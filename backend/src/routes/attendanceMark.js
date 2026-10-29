import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// A real calendar date in YYYY-MM-DD form (rejects 2026-02-30 and 2026-13-45)
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Admins may mark any class. A teacher only classes linked to them:
// users.id -> teachers.user_id -> teacher_classes.teacher_id -> class_id
async function canAccessClass(user, classId) {
  if (user.role === 'admin') return true;
  const [rows] = await pool.execute(
    `SELECT 1 FROM teacher_classes tc
     JOIN teachers t ON t.id = tc.teacher_id
     WHERE tc.class_id = ? AND t.user_id = ?`,
    [classId, user.id]
  );
  return rows.length > 0;
}

router.post('/', allowRoles('teacher', 'admin'), async (req, res, next) => {
  let connection;
  try {
    const { classId, date, records } = req.body || {};
    const id = Number(classId);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: 'classId must be a positive whole number.' });
    }
    if (!validDate(date)) {
      return res.status(400).json({ message: 'date must be a real date in YYYY-MM-DD format.' });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'records must be a non-empty array.' });
    }

    const studentIds = records.map(r => Number(r.studentId));
    if (studentIds.some(n => !Number.isInteger(n) || n < 1)) {
      return res.status(400).json({ message: 'Every record needs a valid studentId.' });
    }
    if (records.some(r => !['present', 'absent'].includes(r.status))) {
      return res.status(400).json({ message: "status must be 'present' or 'absent'." });
    }
    if (new Set(studentIds).size !== studentIds.length) {
      return res.status(400).json({ message: 'A student cannot appear twice in one request.' });
    }

    if (!(await canAccessClass(req.user, id))) {
      return res.status(403).json({ message: 'This class is not assigned to you.' });
    }

    const marks = studentIds.map(() => '?').join(',');
    const [enrolled] = await pool.execute(
      `SELECT student_id FROM enrollments WHERE class_id = ? AND student_id IN (${marks})`,
      [id, ...studentIds]
    );
    if (enrolled.length !== studentIds.length) {
      return res.status(400).json({ message: 'One or more students are not enrolled in this class.' });
    }
    const [existing] = await pool.execute(
      `SELECT student_id FROM attendance
       WHERE class_id = ? AND attendance_date = ? AND student_id IN (${marks})`,
      [id, date, ...studentIds]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: 'Attendance already exists for this class and date. Nothing was saved.',
        duplicateStudentIds: existing.map(r => r.student_id)
      });
    }
    // Save everything together or nothing at all
    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (const r of records) {
      await connection.execute(
        `INSERT INTO attendance (class_id, student_id, attendance_date, status, marked_by)
         VALUES (?, ?, ?, ?, ?)`,
        [id, Number(r.studentId), date, r.status, req.user.id]
      );
    }
    await connection.commit();
    res.status(201).json({ message: 'Attendance saved.', count: records.length });
  } catch (err) {
        if (connection) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'Attendance already exists for this class and date. Nothing was saved.'
      });
    }
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

export default router;