import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate, allowRoles } from '../src/middleware/auth.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-more-than-24-chars';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

test('AMS-003 Issue #3: Role-based access control (RBAC)', async (t) => {
  const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  const teacherToken = jwt.sign({ id: 2, role: 'teacher' }, process.env.JWT_SECRET);
  const studentToken = jwt.sign({ id: 3, role: 'student' }, process.env.JWT_SECRET);
  const invalidRoleToken = jwt.sign({ id: 4, role: 'guest' }, process.env.JWT_SECRET);
  const expiredToken = jwt.sign({ id: 5, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: -10 });

  await t.test('Rejects request without authorization header (401)', () => {
    const req = { headers: {} };
    const res = mockRes();
    let calledNext = false;

    authenticate(req, res, () => { calledNext = true; });

    assert.equal(calledNext, false);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /Authentication required/i);
  });

  await t.test('Rejects malformed authorization header (401)', () => {
    const req = { headers: { authorization: 'Basic 12345' } };
    const res = mockRes();
    let calledNext = false;

    authenticate(req, res, () => { calledNext = true; });

    assert.equal(calledNext, false);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /Invalid authorization format/i);
  });

  await t.test('Rejects expired token (401)', () => {
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = mockRes();
    let calledNext = false;

    authenticate(req, res, () => { calledNext = true; });

    assert.equal(calledNext, false);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /token has expired/i);
  });

  await t.test('Rejects unapproved/invalid role in token (403)', () => {
    const req = { headers: { authorization: `Bearer ${invalidRoleToken}` } };
    const res = mockRes();
    let calledNext = false;

    authenticate(req, res, () => { calledNext = true; });

    assert.equal(calledNext, false);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /Unrecognized user role/i);
  });

  await t.test('Accepts valid token and attaches user payload', () => {
    const req = { headers: { authorization: `Bearer ${adminToken}` } };
    const res = mockRes();
    let calledNext = false;

    authenticate(req, res, () => { calledNext = true; });

    assert.equal(calledNext, true);
    assert.equal(req.user.role, 'admin');
    assert.equal(req.user.id, 1);
  });

  await t.test('allowRoles allows authorized roles and calls next()', () => {
    const middleware = allowRoles('admin');
    const req = { user: { id: 1, role: 'admin' } };
    const res = mockRes();
    let calledNext = false;

    middleware(req, res, () => { calledNext = true; });
    assert.equal(calledNext, true);
  });

  await t.test('allowRoles blocks unauthorized roles with 403', () => {
    const adminOnly = allowRoles('admin');

    // Test student blocked from admin action
    const studentReq = { user: { id: 3, role: 'student' } };
    const studentRes = mockRes();
    let studentNext = false;
    adminOnly(studentReq, studentRes, () => { studentNext = true; });
    assert.equal(studentNext, false);
    assert.equal(studentRes.statusCode, 403);
    assert.match(studentRes.body.message, /Forbidden.*student/i);

    // Test teacher blocked from admin action
    const teacherReq = { user: { id: 2, role: 'teacher' } };
    const teacherRes = mockRes();
    let teacherNext = false;
    adminOnly(teacherReq, teacherRes, () => { teacherNext = true; });
    assert.equal(teacherNext, false);
    assert.equal(teacherRes.statusCode, 403);
    assert.match(teacherRes.body.message, /Forbidden.*teacher/i);
  });

  await t.test('allowRoles blocks students from attendance marking routes (403)', () => {
    const teacherOrAdminOnly = allowRoles('teacher', 'admin');
    const studentReq = { user: { id: 3, role: 'student' } };
    const studentRes = mockRes();
    let studentNext = false;

    teacherOrAdminOnly(studentReq, studentRes, () => { studentNext = true; });
    assert.equal(studentNext, false);
    assert.equal(studentRes.statusCode, 403);
  });
});

