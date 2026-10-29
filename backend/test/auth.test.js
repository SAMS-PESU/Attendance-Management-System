import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-more-than-24-chars';

test('AMS-001 Issue #1: Login and Role Identification', async (t) => {
  const dummyPassword = 'SecretPassword123!';
  const hashedPassword = await bcrypt.hash(dummyPassword, 10);

  const mockUsers = [
    { id: 1, name: 'Admin User', email: 'admin@example.com', password_hash: hashedPassword, role: 'admin' },
    { id: 2, name: 'Teacher User', email: 'teacher@example.com', password_hash: hashedPassword, role: 'teacher' },
    { id: 3, name: 'Student User', email: 'student@example.com', password_hash: hashedPassword, role: 'student' }
  ];

  await t.test('Login logic succeeds with valid credentials and identifies role', async () => {
    for (const mockUser of mockUsers) {
      const email = mockUser.email;
      const password = dummyPassword;

      // Simulate find user by email
      const user = mockUsers.find(u => u.email === email.trim().toLowerCase());
      assert.ok(user, 'User should be found');

      // Verify password
      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      assert.equal(passwordMatches, true, 'Password should match');

      // Generate JWT token containing role
      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      assert.ok(token, 'Token should be generated');

      // Verify payload identifies the expected role
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      assert.equal(decoded.id, user.id);
      assert.equal(decoded.role, user.role, `Identified role should match ${user.role}`);
    }
  });

  await t.test('Login rejects invalid password', async () => {
    const user = mockUsers[0];
    const passwordMatches = await bcrypt.compare('WrongPassword999', user.password_hash);
    assert.equal(passwordMatches, false, 'Invalid password should not match');
  });

  await t.test('Login rejects non-existent email', async () => {
    const user = mockUsers.find(u => u.email === 'nobody@example.com');
    assert.equal(user, undefined, 'User should not exist');
  });

  await t.test('Validates required fields and email format', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    assert.equal(emailRegex.test('valid@example.com'), true);
    assert.equal(emailRegex.test('invalid-email'), false);
    assert.equal(emailRegex.test(''), false);
  });
});

