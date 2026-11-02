import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import attendanceRoutes from '../src/routes/attendance.js';
import { pool } from '../src/db.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-more-than-24-chars';

// AMS-016 / AMS-010, TC-Att-04, TC-Calc-02: student views own attendance
const originalExecute = pool.execute;
let summaryRows = [];
let enrolled = true;
let recordRows = [];
let lastParams = null;

const app = express();
app.use('/api/attendance', attendanceRoutes);

pool.execute = async (sql, params) => {
  if (sql.includes('AS attendedClasses')) {
    lastParams = params;
    return [summaryRows, []];
  }
  if (sql.includes('FROM enrollments e')) {
    lastParams = params;
    return [enrolled ? [{ 1: 1 }] : [], []];
  }
  if (sql.includes('a.attendance_date AS attendanceDate')) {
    lastParams = params;
    return [recordRows, []];
  }
  throw new Error(`Unexpected student self-view query: ${sql}`);
};

let server;
let baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/attendance/mine`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
  pool.execute = originalExecute;
  await pool.end();
});

const studentToken = jwt.sign({ id: 30, role: 'student' }, process.env.JWT_SECRET);
const teacherToken = jwt.sign({ id: 11, role: 'teacher' }, process.env.JWT_SECRET);

function get(path, token = studentToken) {
  return fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

function reset() {
  enrolled = true;
  lastParams = null;
  summaryRows = [
    { classId: 1, classCode: 'CSE-A', className: 'Computer Science', section: 'A',
      totalClasses: 4, attendedClasses: 3 },
    { classId: 2, classCode: 'CSE-B', className: 'Computer Science', section: 'B',
      totalClasses: 3, attendedClasses: 2 }
  ];
  recordRows = [
    { attendanceDate: '2026-10-30', status: 'present' },
    { attendanceDate: '2026-10-29', status: 'absent' }
  ];
}

test('student summary lists each class with its attendance percentage', async () => {
  reset();
  const res = await get('/summary');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 2);
  assert.equal(body[0].classCode, 'CSE-A');
  assert.equal(body[0].attendancePercentage, 75);
  assert.equal(body[1].attendancePercentage, 66.67);
});

test('summary handles a class with no sessions (0%)', async () => {
  reset();
  summaryRows = [{ classId: 1, classCode: 'CSE-A', className: 'CS', section: 'A',
    totalClasses: 0, attendedClasses: 0 }];
  const body = await (await get('/summary')).json();
  assert.equal(body[0].attendancePercentage, 0);
});

test('summary returns an empty list when the student has no classes', async () => {
  reset();
  summaryRows = [];
  const res = await get('/summary');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('student is identified by the token, not by anything in the URL', async () => {
  reset();
  await get('/summary?userId=999&studentId=999');
  assert.equal(lastParams[0], 30);
});

test('student sees their own day-by-day records for an enrolled class', async () => {
  reset();
  const res = await get('/records?classId=1');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.classId, 1);
  assert.equal(body.records.length, 2);
  assert.equal(body.records[0].attendanceDate, '2026-10-30');
});

test('records for a class the student is not enrolled in return 404', async () => {
  reset();
  enrolled = false;
  const res = await get('/records?classId=5');
  assert.equal(res.status, 404);
  assert.match((await res.json()).message, /not enrolled/);
});

test('records reject a missing or malformed classId with 400', async () => {
  reset();
  assert.equal((await get('/records')).status, 400);
  assert.equal((await get('/records?classId=abc')).status, 400);
  assert.equal((await get('/records?classId=0')).status, 400);
});

test('teachers cannot use the student self-view endpoints (403)', async () => {
  reset();
  assert.equal((await get('/summary', teacherToken)).status, 403);
  assert.equal((await get('/records?classId=1', teacherToken)).status, 403);
});

test('requests without a token are rejected (401)', async () => {
  reset();
  assert.equal((await fetch(`${baseUrl}/summary`)).status, 401);
});