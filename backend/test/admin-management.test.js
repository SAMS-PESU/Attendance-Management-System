import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../src/routes/admin.js';
import { pool } from '../src/db.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-more-than-24-chars';

const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;
let connectionFactory = () => {
  throw new Error('Unexpected database connection request');
};
let executeCalls = 0;

pool.execute = async (...args) => {
  executeCalls += 1;
  return originalExecute(...args);
};
pool.getConnection = (...args) => connectionFactory(...args);

const app = express();
app.use(express.json());
app.use('/api', adminRoutes);
app.use((err, _req, res, _next) => {
  res.status(500).json({ message: err.message });
});

let server;
let baseUrl;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  });
  pool.execute = originalExecute;
  pool.getConnection = originalGetConnection;
  await pool.end();
});

const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
const teacherToken = jwt.sign({ id: 2, role: 'teacher' }, process.env.JWT_SECRET);

async function request(path, { method = 'GET', body, token = adminToken } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function mockConnection({ recordRows = [], relatedCounts = {} } = {}) {
  const calls = [];
  const state = { committed: false, rolledBack: false, released: false };
  const connection = {
    async beginTransaction() {
      calls.push('BEGIN');
    },
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT user_id FROM students')) return [recordRows, []];
      if (sql.includes('SELECT id, user_id FROM students')) return [recordRows, []];
      if (sql.includes('SELECT id FROM classes')) return [recordRows, []];
      if (sql.includes('SELECT COUNT(*) AS count FROM')) {
        const table = sql.match(/FROM ([a-z_]+)/i)?.[1];
        return [[{ count: relatedCounts[table] || 0 }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async commit() {
      state.committed = true;
    },
    async rollback() {
      state.rolledBack = true;
    },
    release() {
      state.released = true;
    }
  };
  connectionFactory = async () => connection;
  return { calls, state };
}

test('admin record management endpoints enforce admin-only access', async () => {
  executeCalls = 0;
  const noToken = await request('/students', { token: null });
  assert.equal(noToken.status, 401);

  const teacher = await request('/students', { token: teacherToken });
  assert.equal(teacher.status, 403);
  assert.equal(executeCalls, 0);
});

test('class updates reject invalid IDs and missing required fields', async () => {
  executeCalls = 0;
  const invalidId = await request('/classes/nope', {
    method: 'PUT',
    body: { class_code: 'CSE-A', class_name: 'Computer Science' }
  });
  assert.equal(invalidId.status, 400);

  const missingFields = await request('/classes/1', {
    method: 'PUT',
    body: { class_code: ' ', class_name: '' }
  });
  assert.equal(missingFields.status, 400);
  assert.equal(executeCalls, 0);
});

test('student edits update linked user details and release the connection', async () => {
  const { calls, state } = mockConnection({ recordRows: [{ user_id: 41 }] });
  const response = await request('/students/7', {
    method: 'PUT',
    body: {
      student_number: ' STU007 ',
      full_name: ' Test Student ',
      email: ' TEST@example.com '
    }
  });

  assert.equal(response.status, 200);
  assert.ok(calls.some(call =>
    typeof call === 'object' &&
    call.sql.includes('UPDATE students') &&
    call.params[0] === 'STU007'
  ));
  assert.ok(calls.some(call =>
    typeof call === 'object' &&
    call.sql.includes('UPDATE users') &&
    call.params[1] === 'test@example.com'
  ));
  assert.equal(state.committed, true);
  assert.equal(state.released, true);
});

test('student deletion is blocked by enrollments and releases the connection', async () => {
  const { calls, state } = mockConnection({
    recordRows: [{ id: 7, user_id: 41 }],
    relatedCounts: { enrollments: 1 }
  });
  const response = await request('/students/7', { method: 'DELETE' });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.message, /related enrollments/i);
  assert.equal(calls.some(call =>
    typeof call === 'object' && call.sql.startsWith('DELETE')
  ), false);
  assert.equal(state.rolledBack, true);
  assert.equal(state.released, true);
});

test('unreferenced class deletion commits and releases the connection', async () => {
  const { calls, state } = mockConnection({
    recordRows: [{ id: 7 }],
    relatedCounts: { teacher_classes: 0, enrollments: 0, attendance: 0 }
  });
  const response = await request('/classes/7', { method: 'DELETE' });

  assert.equal(response.status, 200);
  assert.ok(calls.some(call =>
    typeof call === 'object' && call.sql === 'DELETE FROM classes WHERE id = ?'
  ));
  assert.equal(state.committed, true);
  assert.equal(state.released, true);
});
