import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import attendanceRoutes from '../src/routes/attendance.js';
import { pool } from '../src/db.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-more-than-24-chars';

// AMS-005 / TC-Att-03: teacher views one student's attendance in one class
const originalExecute = pool.execute;
let teacherAssigned = true;
let studentEnrolled = true;
let totalClasses = 4;
let records = [
  { attendanceDate: '2026-10-30', status: 'present' },
  { attendanceDate: '2026-10-29', status: 'absent' },
  { attendanceDate: '2026-10-28', status: 'present' }
];

const app = express();
app.use('/api/attendance', attendanceRoutes);

pool.execute = async (sql, params) => {
  if (sql.includes('FROM teacher_classes')) {
    // params: [userId, classId]
    return [teacherAssigned && params[0] === 11 && params[1] === 7 ? [{ 1: 1 }] : [], []];
  }
  if (sql.includes('FROM students s')) {
    // params: [studentId, classId]
    return [studentEnrolled
      ? [{ studentId: 21, studentNumber: 'STU021', fullName: 'Demo Student' }]
      : [], []];
  }
  if (sql.includes('SELECT attendance_date AS attendanceDate')) {
    return [records, []];
  }
  if (sql.includes('COUNT(DISTINCT attendance_date)')) {
    return [[{ totalClasses }], []];
  }
  throw new Error(`Unexpected student-attendance query: ${sql}`);
};

let server;
let baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/attendance/student`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
  pool.execute = originalExecute;
  await pool.end();
});

const teacherToken = jwt.sign({ id: 11, role: 'teacher' }, process.env.JWT_SECRET);
const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
const studentToken = jwt.sign({ id: 30, role: 'student' }, process.env.JWT_SECRET);

function getStudent(studentId, classId, token = teacherToken) {
  return fetch(`${baseUrl}/${studentId}?classId=${classId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

function reset() {
  teacherAssigned = true;
  studentEnrolled = true;
  totalClasses = 4;
  records = [
    { attendanceDate: '2026-10-30', status: 'present' },
    { attendanceDate: '2026-10-29', status: 'absent' },
    { attendanceDate: '2026-10-28', status: 'present' }
  ];
}

test('teacher sees a student\'s records and percentage for an assigned class', async () => {
  reset();
  const res = await getStudent(21, 7);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.studentId, 21);
  assert.equal(body.fullName, 'Demo Student');
  assert.equal(body.records.length, 3);
  assert.equal(body.attendedClasses, 2);
  assert.equal(body.totalClasses, 4);
  assert.equal(body.attendancePercentage, 50);
});

test('student with no records and no sessions gets 0% safely', async () => {
  reset();
  records = [];
  totalClasses = 0;
  const res = await getStudent(21, 7);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.attendancePercentage, 0);
  assert.deepEqual(body.records, []);
});

test('admin can view any class without a teacher assignment', async () => {
  reset();
  teacherAssigned = false;
  const res = await getStudent(21, 7, adminToken);
  assert.equal(res.status, 200);
});

test('teacher cannot view a class that is not assigned to them (403)', async () => {
  reset();
  teacherAssigned = false;
  const res = await getStudent(21, 7);
  assert.equal(res.status, 403);
  assert.match((await res.json()).message, /not assigned/);
});

test('student not enrolled in the class gets 404', async () => {
  reset();
  studentEnrolled = false;
  const res = await getStudent(21, 7);
  assert.equal(res.status, 404);
  assert.match((await res.json()).message, /not enrolled/);
});

test('malformed IDs are rejected with 400', async () => {
  reset();
  assert.equal((await getStudent('abc', 7)).status, 400);
  assert.equal((await getStudent(21, 0)).status, 400);
  assert.equal((await getStudent(21, 'x')).status, 400);
});

test('student role cannot use this endpoint (403)', async () => {
  reset();
  const res = await getStudent(21, 7, studentToken);
  assert.equal(res.status, 403);
});

test('request without a token is rejected (401)', async () => {
  reset();
  const res = await fetch(`${baseUrl}/21?classId=7`);
  assert.equal(res.status, 401);
});