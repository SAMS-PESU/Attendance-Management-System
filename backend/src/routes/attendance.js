import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

function validDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  const parsedDate = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

async function canAccessClass(user, classId) {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const [rows] = await pool.execute(
    'SELECT 1 FROM teacher_classes tc JOIN teachers t ON t.id=tc.teacher_id WHERE tc.class_id=? AND t.user_id=?',
    [classId, user.id]
  );
  return rows.length > 0;
}

router.get('/mine', async (req, res, next) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        message: 'This endpoint is for students only.'
      });
    }

    const { classId, date } = req.query;

    if (!classId || !date) {
      return res.status(400).json({
        message: 'Class and date are required.'
      });
    }

    if (
      !/^\d+$/.test(String(classId)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(date))
    ) {
      return res.status(400).json({
        message: 'Invalid class or date.'
      });
    }

    const [rows] = await pool.execute(
      `SELECT
         c.id AS classId,
         c.class_code AS classCode,
         c.class_name AS className,
         c.section,
         a.attendance_date AS attendanceDate,
         a.status
       FROM students s
       JOIN enrollments e ON e.student_id = s.id
       JOIN classes c ON c.id = e.class_id
       LEFT JOIN attendance a
         ON a.student_id = s.id
         AND a.class_id = c.id
         AND a.attendance_date = ?
       WHERE s.user_id = ?
         AND c.id = ?
       LIMIT 1`,
      [date, req.user.id, Number(classId)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'You are not enrolled in this class.'
      });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard', allowRoles('teacher'), async (req, res, next) => {
  const rawClassId = req.query.classId;
  if (typeof rawClassId !== 'string' || !/^\d+$/.test(rawClassId) || Number(rawClassId) < 1) {
    return res.status(400).json({ message: 'A valid classId is required.' });
  }

  const classId = Number(rawClassId);
  try {
    const [classes] = await pool.execute(
      `SELECT c.id,c.class_code,c.class_name,c.section
       FROM classes c
       JOIN teacher_classes tc ON tc.class_id = c.id
       JOIN teachers t ON t.id = tc.teacher_id
       WHERE c.id = ? AND t.user_id = ?`,
      [classId, req.user.id]
    );
    if (!classes.length) {
      return res.status(403).json({ message: 'This class is not assigned to you.' });
    }

    const [sessionRows] = await pool.execute(
      'SELECT COUNT(DISTINCT attendance_date) AS totalClasses FROM attendance WHERE class_id = ?',
      [classId]
    );
    const totalClasses = Number(sessionRows[0].totalClasses);
    const [students] = await pool.execute(
      `SELECT s.id,s.student_number,s.full_name,s.email,
              COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.attendance_date END) AS attendedClasses
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN attendance a ON a.class_id = e.class_id AND a.student_id = e.student_id
       WHERE e.class_id = ?
       GROUP BY s.id,s.student_number,s.full_name,s.email
       ORDER BY s.student_number`,
      [classId]
    );

    res.json({
      class: classes[0],
      totalClasses,
      students: students.map(student => {
        const attendedClasses = Number(student.attendedClasses);
        return {
          ...student,
          attendedClasses,
          attendancePercentage: totalClasses === 0
            ? 0
            : Number(((attendedClasses / totalClasses) * 100).toFixed(2))
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const classId = Number(req.query.classId);
    const date = req.query.date;
    if (!Number.isInteger(classId) || classId < 1 || !validDate(date)) {
      return res.status(400).json({ message: 'Valid classId and date (YYYY-MM-DD) are required.' });
    }
    if (!(await canAccessClass(req.user, classId))) {
      return res.status(403).json({ message: 'Only an assigned teacher or administrator can view class attendance.' });
    }
    const [rows] = await pool.execute(
      `SELECT s.id AS studentId,s.student_number AS studentNumber,s.full_name AS studentName,
              a.status,a.attendance_date AS attendanceDate
       FROM enrollments e JOIN students s ON s.id=e.student_id
       LEFT JOIN attendance a ON a.student_id=s.id AND a.class_id=e.class_id AND a.attendance_date=?
       WHERE e.class_id=? ORDER BY s.student_number`,
      [date, classId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
