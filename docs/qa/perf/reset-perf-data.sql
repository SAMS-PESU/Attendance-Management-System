-- Puts the PERF-A class back to its seeded state so run-performance-tests.ps1 can be repeated.
-- Removes dates created by the POST test, restores seeded statuses, clears performance audit rows.
USE sams_db;

DELETE FROM attendance
WHERE class_id = (SELECT id FROM classes WHERE class_code = 'PERF-A')
  AND attendance_date >= '2027-01-01';

UPDATE attendance a
JOIN classes c ON c.id = a.class_id AND c.class_code = 'PERF-A'
SET a.status = IF((a.student_id + DATEDIFF('2026-09-01', a.attendance_date)) % 5 = 0, 'absent', 'present');

DELETE FROM attendance_audit_log
WHERE class_id = (SELECT id FROM classes WHERE class_code = 'PERF-A');