import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, allowRoles('admin'));

router.get('/students', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, student_number, full_name, email, user_id FROM students ORDER BY student_number'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/teachers', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, employee_number, full_name, email, user_id FROM teachers ORDER BY employee_number'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/students', async (req, res, next) => {
  try {
    const { student_number, full_name, email = null, user_id = null } = req.body || {};
    if (!student_number?.trim() || !full_name?.trim()) {
      return res.status(400).json({ message: 'student_number and full_name are required.' });
    }
    const [r] = await pool.execute(
      'INSERT INTO students (student_number,full_name,email,user_id) VALUES (?,?,?,?)',
      [student_number.trim(), full_name.trim(), email?.trim() || null, user_id || null]
    );
    res.status(201).json({ id: r.insertId, student_number, full_name, email });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Student number or linked user account already exists.' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'The selected user_id does not exist.' });
    next(err);
  }
});

router.post('/teachers', async (req, res, next) => {
  try {
    const { employee_number, full_name, email = null, user_id = null } = req.body || {};
    if (!employee_number?.trim() || !full_name?.trim()) {
      return res.status(400).json({ message: 'employee_number and full_name are required.' });
    }
    const [r] = await pool.execute(
      'INSERT INTO teachers (employee_number,full_name,email,user_id) VALUES (?,?,?,?)',
      [employee_number.trim(), full_name.trim(), email?.trim() || null, user_id || null]
    );
    res.status(201).json({ id: r.insertId, employee_number, full_name, email });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Employee number or linked user account already exists.' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'The selected user_id does not exist.' });
    next(err);
  }
});

router.post('/classes/:classId/teachers/:teacherId', async (req, res, next) => {
  try {
    const classId = Number(req.params.classId), teacherId = Number(req.params.teacherId);
    if (!Number.isInteger(classId) || !Number.isInteger(teacherId) || classId < 1 || teacherId < 1) {
      return res.status(400).json({ message: 'Valid class and teacher IDs are required.' });
    }
    await pool.execute('INSERT INTO teacher_classes (class_id,teacher_id) VALUES (?,?)', [classId, teacherId]);
    res.status(201).json({ message: 'Teacher assigned to class.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Teacher is already assigned to this class.' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ message: 'Class or teacher was not found.' });
    next(err);
  }
});

router.post('/classes/:classId/students/:studentId', async (req, res, next) => {
  try {
    const classId = Number(req.params.classId), studentId = Number(req.params.studentId);
    if (!Number.isInteger(classId) || !Number.isInteger(studentId) || classId < 1 || studentId < 1) {
      return res.status(400).json({ message: 'Valid class and student IDs are required.' });
    }
    await pool.execute('INSERT INTO enrollments (class_id,student_id) VALUES (?,?)', [classId, studentId]);
    res.status(201).json({ message: 'Student enrolled in class.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Student is already enrolled in this class.' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ message: 'Class or student was not found.' });
    next(err);
  }
});


async function createLinkedAccount(req, res, next, role) {
  const connection = await pool.getConnection();

  try {
    const {
      email,
      password,
      full_name,
      student_number,
      employee_number
    } = req.body || {};

    const identifier = role === 'student'
      ? student_number
      : employee_number;

    const fieldName = role === 'student'
      ? 'student_number'
      : 'employee_number';

    if (
      !email?.trim() ||
      !password ||
      !full_name?.trim() ||
      !identifier?.trim()
    ) {
      return res.status(400).json({
        message: `Name, email, password and ${fieldName} are required.`
      });
    }

    if (String(password).length < 10) {
      return res.status(400).json({
        message: 'Password must be at least 10 characters.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(String(password), 12);

    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [
        full_name.trim(),
        normalizedEmail,
        passwordHash,
        role
      ]
    );

    const userId = userResult.insertId;

    if (role === 'student') {
      await connection.execute(
        `INSERT INTO students
         (user_id, student_number, full_name, email)
         VALUES (?, ?, ?, ?)`,
        [
          userId,
          student_number.trim(),
          full_name.trim(),
          normalizedEmail
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO teachers
         (user_id, employee_number, full_name, email)
         VALUES (?, ?, ?, ?)`,
        [
          userId,
          employee_number.trim(),
          full_name.trim(),
          normalizedEmail
        ]
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: `${role === 'student' ? 'Student' : 'Teacher'} account created and linked successfully.`,
      user: {
        id: userId,
        name: full_name.trim(),
        email: normalizedEmail,
        role
      }
    });
  } catch (err) {
    await connection.rollback();

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'Email or student/employee number already exists.'
      });
    }

    return next(err);
  } finally {
    connection.release();
  }
}

router.post('/students/with-account', (req, res, next) =>
  createLinkedAccount(req, res, next, 'student')
);

router.post('/teachers/with-account', (req, res, next) =>
  createLinkedAccount(req, res, next, 'teacher')
);

export default router;
