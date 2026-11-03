import express from 'express';
import { pool } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = express.Router();

// GET /api/admin/dashboard  (administrators only)
router.get('/', authenticate, allowRoles('admin'), async (_req, res, next) => {
  try {
    const [[totals]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM classes)  AS classes,
              (SELECT COUNT(*) FROM teachers) AS teachers,
              (SELECT COUNT(*) FROM students) AS students`
    );

    const [todayRows] = await pool.execute(
      `SELECT status, COUNT(*) AS n
       FROM attendance
       WHERE attendance_date = CURDATE()
       GROUP BY status`
    );
    const count = (s) => Number(todayRows.find((r) => r.status === s)?.n ?? 0);
    const present = count('present');
    const absent = count('absent');
    const marked = present + absent;

    const [classes] = await pool.execute(
      `SELECT c.id, c.class_code, c.class_name, c.section,
              COUNT(DISTINCT e.student_id)  AS students,
              COUNT(DISTINCT tc.teacher_id) AS teachers
       FROM classes c
       LEFT JOIN enrollments e      ON e.class_id  = c.id
       LEFT JOIN teacher_classes tc ON tc.class_id = c.id
       GROUP BY c.id, c.class_code, c.class_name, c.section
       ORDER BY c.class_code`
    );

    res.json({
      totals: {
        classes: Number(totals.classes),
        teachers: Number(totals.teachers),
        students: Number(totals.students),
      },
      today: {
        present,
        absent,
        marked,
        percentage: marked ? Math.round((present / marked) * 1000) / 10 : 0,
      },
      classes: classes.map((c) => ({
        ...c,
        students: Number(c.students),
        teachers: Number(c.teachers),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;