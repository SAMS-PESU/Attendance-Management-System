-- Synthetic performance-test data: class PERF-A, 60 students, 60 days of attendance.
-- Safe to re-run (INSERT IGNORE). Remove with cleanup-perf-data.sql.
USE sams_db;

INSERT IGNORE INTO classes (class_code, class_name, section)
VALUES ('PERF-A', 'Performance Test Class', 'P');

INSERT IGNORE INTO students (student_number, full_name, email)
WITH RECURSIVE n AS (SELECT 1 AS i UNION ALL SELECT i + 1 FROM n WHERE i < 60)
SELECT CONCAT('PERF', LPAD(i, 3, '0')), CONCAT('Perf Student ', i), CONCAT('perf', i, '@example.com') FROM n;

INSERT IGNORE INTO enrollments (class_id, student_id)
SELECT c.id, s.id FROM classes c JOIN students s
WHERE c.class_code = 'PERF-A' AND s.student_number LIKE 'PERF%';

INSERT IGNORE INTO teacher_classes (class_id, teacher_id)
SELECT c.id, t.id FROM classes c JOIN teachers t
WHERE c.class_code = 'PERF-A' AND t.employee_number = 'EMP001';

INSERT IGNORE INTO attendance (class_id, student_id, attendance_date, status, marked_by)
WITH RECURSIVE d AS (SELECT 0 AS k UNION ALL SELECT k + 1 FROM d WHERE k < 59)
SELECT c.id, s.id, DATE_SUB('2026-09-01', INTERVAL d.k DAY),
       IF((s.id + d.k) % 5 = 0, 'absent', 'present'), 1
FROM classes c
JOIN students s ON s.student_number LIKE 'PERF%'
CROSS JOIN d
WHERE c.class_code = 'PERF-A';