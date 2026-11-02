-- Removes everything created by seed-perf-data.sql, plus audit rows made during performance runs.
USE sams_db;
DELETE FROM attendance_audit_log WHERE class_id IN (SELECT id FROM classes WHERE class_code = 'PERF-A');
DELETE FROM classes WHERE class_code = 'PERF-A';
DELETE FROM students WHERE student_number LIKE 'PERF%';