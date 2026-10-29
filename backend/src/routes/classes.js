import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    let sql = `SELECT DISTINCT c.id,c.class_code,c.class_name,c.section
               FROM classes c`;
    const params = [];
    if (req.user.role === 'teacher') {
      sql += ` JOIN teacher_classes tc ON tc.class_id=c.id
               JOIN teachers t ON t.id=tc.teacher_id WHERE t.user_id=?`;
      params.push(req.user.id);
    } else if (req.user.role === 'student') {
      sql += ` JOIN enrollments e ON e.class_id=c.id
               JOIN students s ON s.id=e.student_id WHERE s.user_id=?`;
      params.push(req.user.id);
    }
    sql += ' ORDER BY c.class_code';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id/students', async (req, res, next) => {
  try {
    const classId = Number(req.params.id);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: 'Invalid class ID.' });
    if (req.user.role === 'teacher') {
      const [allowed] = await pool.execute(
        'SELECT 1 FROM teacher_classes tc JOIN teachers t ON t.id=tc.teacher_id WHERE tc.class_id=? AND t.user_id=?',
        [classId, req.user.id]
      );
      if (!allowed.length) return res.status(403).json({ message: 'This class is not assigned to you.' });
    } else if (req.user.role === 'student') {
      return res.status(403).json({ message: 'Students cannot view the class roster.' });
    }
    const [rows] = await pool.execute(
      `SELECT s.id,s.student_number,s.full_name,s.email
       FROM students s JOIN enrollments e ON e.student_id=s.id
       WHERE e.class_id=? ORDER BY s.student_number`, [classId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', authenticate, allowRoles('admin'), async (req, res, next) => {
  try {
    const { class_code, class_name, section = null } = req.body || {};
    if (!class_code || !class_name) return res.status(400).json({ message: 'class_code and class_name are required.' });
    const [result] = await pool.execute(
      'INSERT INTO classes (class_code,class_name,section) VALUES (?,?,?)',
      [class_code, class_name, section]
    );
    res.status(201).json({ id: result.insertId, class_code, class_name, section });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Class code already exists.' });
    next(err);
  }
});

export default router;
