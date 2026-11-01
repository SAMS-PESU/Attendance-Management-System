import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { calculateAttendancePercentage } from '../utils/attendanceCalculator.js';

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

    if (!classId) {
      return res.status(400).json({
        message: 'Class is required.'
      });
    }

    if (!/^\d+$/.test(String(classId)) || Number(classId) < 1) {
      return res.status(400).json({
        message: 'Invalid class ID.'
      });
    }

    const numericClassId = Number(classId);

    // Verify enrollment
    const [enrollmentRows] = await pool.execute(
      `SELECT s.id AS studentId, c.id AS classId, c.class_code AS classCode, c.class_name AS className, c.section
       FROM students s
       JOIN enrollments e ON e.student_id = s.id
       JOIN classes c ON c.id = e.class_id
       WHERE s.user_id = ? AND c.id = ?`,
      [req.user.id, numericClassId]
    );

    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        message: 'You are not enrolled in this class.'
      });
    }

    const classInfo = enrollmentRows[0];

    // Compute student's overall attendance stats for this class
    const [summaryRows] = await pool.execute(
      `SELECT
         COUNT(DISTINCT attendance_date) AS totalClasses,
         COUNT(DISTINCT CASE WHEN status = 'present' THEN attendance_date END) AS attendedClasses
       FROM attendance
       WHERE class_id = ?`,
      [numericClassId]
    );

    // Attended sessions specifically for this student
    const [studentSummaryRows] = await pool.execute(
      `SELECT
         COUNT(DISTINCT CASE WHEN a.status = 'present' THEN a.attendance_date END) AS attendedClasses
       FROM attendance a
       WHERE a.class_id = ? AND a.student_id = ?`,
      [numericClassId, classInfo.studentId]
    );

    const totalClasses = Number(summaryRows[0]?.totalClasses || 0);
    const attendedClasses = Number(studentSummaryRows[0]?.attendedClasses || 0);
    const attendancePercentage = calculateAttendancePercentage(attendedClasses, totalClasses);

    let specificDateRecord = null;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !validDate(String(date))) {
        return res.status(400).json({
          message: 'Invalid date format (YYYY-MM-DD).'
        });
      }

      const [dateRows] = await pool.execute(
        `SELECT a.attendance_date AS attendanceDate, a.status
         FROM attendance a
         WHERE a.class_id = ? AND a.student_id = ? AND a.attendance_date = ?
         LIMIT 1`,
        [numericClassId, classInfo.studentId, date]
      );
      if (dateRows.length > 0) {
        specificDateRecord = dateRows[0];
      }
    }

    res.json({
      classId: classInfo.classId,
      classCode: classInfo.classCode,
      className: classInfo.className,
      section: classInfo.section,
      attendanceDate: specificDateRecord ? specificDateRecord.attendanceDate : (date || null),
      status: specificDateRecord ? specificDateRecord.status : null,
      totalClasses,
      attendedClasses,
      attendancePercentage
    });
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
          attendancePercentage: calculateAttendancePercentage(attendedClasses, totalClasses)
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

async function teacherHasClass(user, classId) {
  if (user.role === 'admin') return true;
  const [rows] = await pool.execute(
    `SELECT 1
     FROM teacher_classes tc
     JOIN teachers t ON t.id = tc.teacher_id
     WHERE t.user_id = ? AND tc.class_id = ?`,
    [user.id, classId]
  );
  return rows.length > 0;
}

router.get('/student/:studentId', allowRoles('teacher', 'admin'), async (req, res, next) => {
  try {
    const studentId = Number(req.params.studentId);
    const classId = Number(req.query.classId);

    if (!Number.isInteger(studentId) || studentId < 1 ||
        !Number.isInteger(classId) || classId < 1) {
      return res.status(400).json({ message: 'studentId and classId must be positive whole numbers.' });
    }

    if (!(await teacherHasClass(req.user, classId))) {
      return res.status(403).json({ message: 'This class is not assigned to you.' });
    }

    const [students] = await pool.execute(
      `SELECT s.id AS studentId, s.student_number AS studentNumber, s.full_name AS fullName
       FROM students s
       JOIN enrollments e ON e.student_id = s.id
       WHERE s.id = ? AND e.class_id = ?`,
      [studentId, classId]
    );
    if (students.length === 0) {
      return res.status(404).json({ message: 'Student is not enrolled in this class.' });
    }

    const [records] = await pool.execute(
      `SELECT attendance_date AS attendanceDate, status
       FROM attendance
       WHERE class_id = ? AND student_id = ?
       ORDER BY attendance_date DESC`,
      [classId, studentId]
    );

    const [[totals]] = await pool.execute(
      `SELECT COUNT(DISTINCT attendance_date) AS totalClasses
       FROM attendance WHERE class_id = ?`,
      [classId]
    );

    const totalClasses = Number(totals.totalClasses);
    const attendedClasses = records.filter(r => r.status === 'present').length;

    res.json({
      ...students[0],
      classId,
      records,
      totalClasses,
      attendedClasses,
      attendancePercentage: calculateAttendancePercentage(attendedClasses, totalClasses)
    });
  } catch (err) {
    next(err);
  }
});

export default router;
