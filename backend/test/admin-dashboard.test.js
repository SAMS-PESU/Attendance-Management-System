import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminDashboardRoutes from '../src/routes/adminDashboard.js';
import { pool } from '../src/db.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-more-than-24-chars';

const originalExecute = pool.execute;
let todayRows = [
  { status: 'present', n: 3 },
  { status: 'absent', n: 1 }
];
const classRows = [
  { id: 7, class_code: 'CSE-A', class_name: 'Computer Science', section: 'A', students: 3, teachers: 1 }
];

const app = express();
app.use('/api/admin/dashboard', adminDashboardRoutes);

pool.execute = async (sql) => {
  if (sql.includes('COUNT(*) FROM teachers')) {
    return [[{ classes: 2, teachers: 1, students: 3 }], []];
  }
  if (sql.includes('FROM attendance')) {
    return [todayRows, []];
  }
  if (sql.includes('FROM classes c')) {
    return [classRows, []];
  }
  throw new Error(`Unexpected admin dashboard query: ${sql}`);
};

let server;
let url;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/admin/dashboard`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  pool.execute = originalExecute;
  await pool.end();
});

const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
const teacherToken = jwt.sign({ id: 11, role: 'teacher' }, process.env.JWT_SECRET);
const studentToken = jwt.sign({ id: 21, role: 'student' }, process.env.JWT_SECRET);

const get = (token) =>
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test('admin dashboard returns totals, today attendance and class overview', async () => {
  const response = await get(adminToken);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body.totals, { classes: 2, teachers: 1, students: 3 });
  assert.deepEqual(body.today, { present: 3, absent: 1, marked: 4, percentage: 75 });
  assert.equal(body.classes.length, 1);
  assert.equal(body.classes[0].class_code, 'CSE-A');
  assert.equal(body.classes[0].students, 3);
});

test('admin dashboard handles a day with no attendance marked', async () => {
  todayRows = [];
  try {
    const response = await get(adminToken);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.today, { present: 0, absent: 0, marked: 0, percentage: 0 });
  } finally {
    todayRows = [
      { status: 'present', n: 3 },
      { status: 'absent', n: 1 }
    ];
  }
});

test('admin dashboard rejects requests without a token', async () => {
  const response = await get();
  assert.equal(response.status, 401);
});

test('admin dashboard is forbidden for teachers', async () => {
  const response = await get(teacherToken);
  assert.equal(response.status, 403);
});

test('admin dashboard is forbidden for students', async () => {
  const response = await get(studentToken);
  assert.equal(response.status, 403);
});

test('admin dashboard is mounted at /api/admin/dashboard', () => {
  const serverSrc = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(serverSrc, /app\.use\(\s*['"]\/api\/admin\/dashboard['"]/);
});

test('admin dashboard is mounted before the catch-all admin router', () => {
  const serverSrc = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const dash = serverSrc.indexOf("'/api/admin/dashboard'");
  const admin = serverSrc.indexOf("app.use('/api', adminRoutes)");
  assert.ok(dash !== -1 && admin !== -1 && dash < admin);
});