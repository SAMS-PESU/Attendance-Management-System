import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, allowRoles('admin'));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

async function updatePerson(req, res, next, { table, identifierColumn }) {
  const id = parseId(req.params.id);
  const identifier = req.body?.[identifierColumn];
  const fullName = req.body?.full_name;
  const rawEmail = req.body?.email;

  if (!id) return res.status(400).json({ message: 'A valid record ID is required.' });
  if (typeof identifier !== 'string' || !identifier.trim() ||
      typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ message: `${identifierColumn} and full_name are required.` });
  }
  if (rawEmail != null && typeof rawEmail !== 'string') {
    return res.status(400).json({ message: 'Email must be a valid email address.' });
  }

  const email = rawEmail?.trim().toLowerCase() || null;
  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Email must be a valid email address.' });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [existing] = await connection.execute(
      `SELECT user_id FROM ${table} WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!existing.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Record not found.' });
    }

    const userId = existing[0].user_id;
    if (userId && !email) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'Email is required for a linked user account.' });
    }

    await connection.execute(
      `UPDATE ${table} SET ${identifierColumn} = ?, full_name = ?, email = ? WHERE id = ?`,
      [identifier.trim(), fullName.trim(), email, id]
    );
    if (userId) {
      await connection.execute(
        'UPDATE users SET name = ?, email = ? WHERE id = ?',
        [fullName.trim(), email, userId]
      );
    }

    await connection.commit();
    transactionStarted = false;
    return res.json({ message: 'Record updated successfully.' });
  } catch (err) {
    if (transactionStarted) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'The identifier or email is already in use.' });
    }
    return next(err);
  } finally {
    connection?.release();
  }
}

async function deleteUnreferencedRecord(req, res, next, { table, references, linkedUser = false }) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'A valid record ID is required.' });

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [records] = await connection.execute(
      `SELECT id${linkedUser ? ', user_id' : ''} FROM ${table} WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!records.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Record not found.' });
    }

    for (const { table: referenceTable, column } of references) {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) AS count FROM ${referenceTable} WHERE ${column} = ?`,
        [id]
      );
      if (Number(rows[0].count) > 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: `This record cannot be deleted while it has related ${referenceTable} records.`
        });
      }
    }

    if (linkedUser && records[0].user_id) {
      const [attendance] = await connection.execute(
        'SELECT COUNT(*) AS count FROM attendance WHERE marked_by = ?',
        [records[0].user_id]
      );
      if (Number(attendance[0].count) > 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          message: 'This record cannot be deleted because its user account marked attendance.'
        });
      }
    }

    await connection.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    if (linkedUser && records[0].user_id) {
      await connection.execute('DELETE FROM users WHERE id = ?', [records[0].user_id]);
    }
    await connection.commit();
    transactionStarted = false;
    return res.json({ message: 'Record deleted successfully.' });
  } catch (err) {
    if (transactionStarted) await connection.rollback();
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'This record cannot be deleted while it has related records.' });
    }
    return next(err);
  } finally {
    connection?.release();
  }
}

router.put('/students/:id', (req, res, next) =>
  updatePerson(req, res, next, { table: 'students', identifierColumn: 'student_number' })
);

router.put('/teachers/:id', (req, res, next) =>
  updatePerson(req, res, next, { table: 'teachers', identifierColumn: 'employee_number' })
);

router.put('/classes/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  const { class_code, class_name, section = null } = req.body || {};
  if (!id) return res.status(400).json({ message: 'A valid class ID is required.' });
  if (typeof class_code !== 'string' || !class_code.trim() ||
      typeof class_name !== 'string' || !class_name.trim()) {
    return res.status(400).json({ message: 'class_code and class_name are required.' });
  }
  if (section != null && typeof section !== 'string') {
    return res.status(400).json({ message: 'section must be a string.' });
  }
  try {
    const [existing] = await pool.execute('SELECT id FROM classes WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ message: 'Class not found.' });
    const cleanSection = section?.trim() || null;
    await pool.execute(
      'UPDATE classes SET class_code = ?, class_name = ?, section = ? WHERE id = ?',
      [class_code.trim(), class_name.trim(), cleanSection, id]
    );
    return res.json({ message: 'Class updated successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Class code already exists.' });
    return next(err);
  }
});

router.delete('/classes/:id', (req, res, next) =>
  deleteUnreferencedRecord(req, res, next, {
    table: 'classes',
    references: [
      { table: 'teacher_classes', column: 'class_id' },
      { table: 'enrollments', column: 'class_id' },
      { table: 'attendance', column: 'class_id' }
    ]
  })
);

router.delete('/students/:id', (req, res, next) =>
  deleteUnreferencedRecord(req, res, next, {
    table: 'students',
    references: [
      { table: 'enrollments', column: 'student_id' },
      { table: 'attendance', column: 'student_id' }
    ],
    linkedUser: true
  })
);

router.delete('/teachers/:id', (req, res, next) =>
  deleteUnreferencedRecord(req, res, next, {
    table: 'teachers',
    references: [{ table: 'teacher_classes', column: 'teacher_id' }],
    linkedUser: true
  })
);

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
