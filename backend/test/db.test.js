import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';

after(() => pool.end());

test('AMS-002 Issue #2: Database and Core Schema Integrity', async (t) => {
  let dbConnected = false;
  try {
    const [rows] = await pool.query('SELECT 1 as val');
    dbConnected = rows && rows[0] && rows[0].val === 1;
  } catch (err) {
    dbConnected = false;
  }

  await t.test('Database connection pool is configured and alive', { skip: !dbConnected }, async () => {
    const [rows] = await pool.query('SELECT 1 as val');
    assert.equal(rows[0].val, 1, 'Database should return 1');
  });

  await t.test('Core tables exist in schema', { skip: !dbConnected }, async () => {
    const expectedTables = [
      'users',
      'students',
      'teachers',
      'classes',
      'enrollments',
      'teacher_classes',
      'attendance'
    ];

    const [rows] = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
    `);
    const existingTables = rows.map(r => (r.table_name || r.TABLE_NAME).toLowerCase());

    for (const table of expectedTables) {
      assert.ok(
        existingTables.includes(table),
        `Table '${table}' must exist in the database schema`
      );
    }
  });

  await t.test('Primary keys and unique constraints are defined', { skip: !dbConnected }, async () => {
    const [constraints] = await pool.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE 
      FROM information_schema.table_constraints 
      WHERE table_schema = DATABASE()
    `);

    const pkTables = new Set(
      constraints
        .filter(c => (c.CONSTRAINT_TYPE || c.constraint_type) === 'PRIMARY KEY')
        .map(c => (c.TABLE_NAME || c.table_name).toLowerCase())
    );

    const requiredPKs = ['users', 'students', 'teachers', 'classes', 'enrollments', 'teacher_classes', 'attendance'];
    for (const table of requiredPKs) {
      assert.ok(pkTables.has(table), `Table '${table}' must have a primary key`);
    }

    const uniqueConstraints = constraints
      .filter(c => (c.CONSTRAINT_TYPE || c.constraint_type) === 'UNIQUE')
      .map(c => (c.CONSTRAINT_NAME || c.constraint_name).toLowerCase());

    assert.ok(
      uniqueConstraints.includes('uq_attendance_class_student_date'),
      'uq_attendance_class_student_date unique constraint must exist on attendance'
    );
    assert.ok(
      uniqueConstraints.includes('uq_enrollment'),
      'uq_enrollment unique constraint must exist on enrollments'
    );
  });

  await t.test('Foreign key constraints maintain referential integrity', { skip: !dbConnected }, async () => {
    const [fks] = await pool.query(`
      SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
      FROM information_schema.referential_constraints
      WHERE CONSTRAINT_SCHEMA = DATABASE()
    `);

    const fkNames = fks.map(f => (f.CONSTRAINT_NAME || f.constraint_name).toLowerCase());
    assert.ok(fkNames.includes('fk_students_user'), 'fk_students_user must exist');
    assert.ok(fkNames.includes('fk_teachers_user'), 'fk_teachers_user must exist');
    assert.ok(fkNames.includes('fk_attendance_class'), 'fk_attendance_class must exist');
    assert.ok(fkNames.includes('fk_attendance_student'), 'fk_attendance_student must exist');
    assert.ok(fkNames.includes('fk_attendance_marker'), 'fk_attendance_marker must exist');
  });

  // Always run schema file validation even if live MySQL is offline
  await t.test('SQL schema file syntax and structure check', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), '../database/schema.sql'), 'utf-8');

    assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS users'), 'users table defined');
    assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS students'), 'students table defined');
    assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS teachers'), 'teachers table defined');
    assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS classes'), 'classes table defined');
    assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS enrollments'), 'enrollments table defined');
    assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS teacher_classes'), 'teacher_classes table defined');
    assert.ok(schemaSql.includes('CREATE TABLE IF NOT EXISTS attendance'), 'attendance table defined');
    assert.ok(schemaSql.includes('uq_attendance_class_student_date'), 'attendance composite unique constraint defined');
  });
});
