import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Demo/local registration. Restrict or disable this endpoint before deployment.
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !['admin','teacher','student'].includes(role)) {
      return res.status(400).json({ message: 'name, email, password, and a valid role are required.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ message: 'A valid email address is required.' });
    }
    if (String(password).length < 10) return res.status(400).json({ message: 'Password must be at least 10 characters.' });
    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',
      [String(name).trim(), cleanEmail, password_hash, role]
    );
    res.status(201).json({ id: result.insertId, name: String(name).trim(), email: cleanEmail, role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already registered.' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    
    const cleanEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const [rows] = await pool.execute(
      'SELECT id,name,email,password_hash,role FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

// Endpoint to verify current session and retrieve identified role
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ user });
  } catch (err) { next(err); }
});

export default router;
