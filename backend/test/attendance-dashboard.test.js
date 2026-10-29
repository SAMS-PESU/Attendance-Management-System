import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import attendanceRoutes from '../src/routes/attendance.js';
import { pool } from '../src/db.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-more-than-24-chars';

const originalExecute = pool.execute;
let totalClasses = 2;
let teacherAssigned = true;
const classRecord = { id: 7, class_code: 'CSE-A', class_name: 'Computer Science', section: 'A' };
const studentRows = [
  { id: 21, student_number: 'STU021', full_name: 'Present Student', email: 'present@example.com', attendedClasses: 1 },
  { id: 22, student_number: 'STU022', full_name: 'Absent Student', email: 'absent@example.com', attendedClasses: 0 }
];
const app = express();
app.use('/api/attendance', attendanceRoutes);

pool.execute = async (sql, params) => {
  if (sql.includes('FROM classes c')) {
    return [teacherAssigned && params[0] === 7 && params[1] === 11 ? [classRecord] : [], []];
  }
  if (sql.includes('COUNT(DISTINCT attendance_date)')) {
    return [[{ totalClasses }], []];
  }
  if (sql.includes('COUNT(DISTINCT CASE WHEN a.status =')) {
    return [studentRows, []];
  }
  throw new Error(`Unexpected dashboard query: ${sql}`);
};

let server;
let baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/attendance/dashboard`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  });
  pool.execute = originalExecute;
  await pool.end();
});

const teacherToken = jwt.sign({ id: 11, role: 'teacher' }, process.env.JWT_SECRET);
const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);

async function getDashboard(classId, token = teacherToken) {
  return fetch(`${baseUrl}?classId=${classId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

test('teacher dashboard reports percentages from saved attendance counts', async () => {
  const response = await getDashboard(7);
  assert.equal(response.status, 200);
  const dashboard = await response.json();

  assert.deepEqual(dashboard.class, classRecord);
  assert.equal(dashboard.totalClasses, 2);
  assert.equal(dashboard.students[0].attendancePercentage, 50);
  assert.equal(dashboard.students[1].attendancePercentage, 0);
});

test('teacher dashboard safely handles classes with no attendance sessions', async () => {
  totalClasses = 0;
  try {
    const response = await getDashboard(7);
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    assert.equal(dashboard.totalClasses, 0);
    assert.deepEqual(dashboard.students.map(student => student.attendancePercentage), [0, 0]);
  } finally {
    totalClasses = 2;
  }
});

test('teacher dashboard rejects malformed class IDs', async () => {
  const response = await getDashboard('invalid');
  assert.equal(response.status, 400);
});

test('teacher dashboard does not expose classes not assigned to the teacher', async () => {
  teacherAssigned = false;
  try {
    const response = await getDashboard(7);
    assert.equal(response.status, 403);
  } finally {
    teacherAssigned = true;
  }
});

test('teacher dashboard is not accessible to administrators', async () => {
  const response = await getDashboard(7, adminToken);
  assert.equal(response.status, 403);
});
