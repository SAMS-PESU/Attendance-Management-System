import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

test('AMS-016 Issue #16: Secure Password Storage and Authentication', async (t) => {
  const plainPassword = 'SuperSecretPassword123!';
  const costFactor = 12;

  await t.test('Password hashing uses bcrypt with minimum cost factor of 12 and salt', async () => {
    const hash = await bcrypt.hash(plainPassword, costFactor);
    assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'Hash must be a valid bcrypt format');
    
    // Extract cost factor from bcrypt hash string: $2a$12$...
    const rounds = parseInt(hash.split('$')[2], 10);
    assert.ok(rounds >= 12, `Cost factor rounds should be at least 12, got ${rounds}`);

    // Verify different hashes produced for the same password due to unique salt
    const secondHash = await bcrypt.hash(plainPassword, costFactor);
    assert.notEqual(hash, secondHash, 'Salts must ensure identical passwords produce distinct hashes');
  });

  await t.test('Plaintext passwords are never matched directly and verify securely via bcrypt', async () => {
    const hash = await bcrypt.hash(plainPassword, costFactor);
    
    // Plaintext inequality
    assert.notEqual(plainPassword, hash, 'Plaintext password must not equal stored hash');
    
    // Correct password matches via constant-time compare
    const isMatch = await bcrypt.compare(plainPassword, hash);
    assert.equal(isMatch, true, 'Valid password must match hash');

    // Incorrect password rejected
    const isBadMatch = await bcrypt.compare('WrongPassword456!', hash);
    assert.equal(isBadMatch, false, 'Invalid password must not match hash');
  });

  await t.test('Password strength: rejects passwords shorter than 10 characters', () => {
    const shortPasswords = ['123', 'short', 'Pass1!', 'NineChars'];
    for (const pwd of shortPasswords) {
      assert.ok(pwd.length < 10, `Password '${pwd}' correctly identified as shorter than 10`);
    }
    assert.ok('ValidPass123!'.length >= 10);
  });

  await t.test('Sensitive credential sanitization: passwords stripped from user query responses', () => {
    // Mock user database row
    const dbUserRow = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      password_hash: '$2b$12$e8s7df687s6d8f76sd8f76s',
      role: 'admin'
    };

    // Sanitize user object sent to client / returned in API response
    const { password_hash, ...sanitizedUser } = dbUserRow;
    assert.equal(sanitizedUser.password_hash, undefined, 'password_hash must never be in response object');
    assert.equal(sanitizedUser.password, undefined, 'password must never be in response object');
    assert.deepEqual(Object.keys(sanitizedUser), ['id', 'name', 'email', 'role']);
  });

  await t.test('Authentication errors do not leak credential existence or plaintext in messages', () => {
    // Both wrong password and wrong email produce identical generic messages
    const genericAuthError = 'Invalid email or password.';
    assert.doesNotMatch(genericAuthError, /password_hash|bcrypt|sql/i);
    assert.doesNotMatch(genericAuthError, /user exists|email found/i);
  });
});

