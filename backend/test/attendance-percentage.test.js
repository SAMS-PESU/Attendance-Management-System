import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAttendancePercentage } from '../src/utils/attendanceCalculator.js';

test('AMS-010 Issue #10: Calculate attendance percentage', async (t) => {
  await t.test('Normal case: calculates percentage using (attended / total) * 100', () => {
    // 3 out of 4 sessions = 75.00%
    assert.equal(calculateAttendancePercentage(3, 4), 75);

    // 1 out of 2 sessions = 50.00%
    assert.equal(calculateAttendancePercentage(1, 2), 50);

    // 2 out of 3 sessions = 66.67% (rounded to 2 decimal places)
    assert.equal(calculateAttendancePercentage(2, 3), 66.67);

    // 1 out of 3 sessions = 33.33%
    assert.equal(calculateAttendancePercentage(1, 3), 33.33);

    // 7 out of 9 sessions = 77.78%
    assert.equal(calculateAttendancePercentage(7, 9), 77.78);
  });

  await t.test('Boundary case: 100% attendance (attended === total)', () => {
    assert.equal(calculateAttendancePercentage(5, 5), 100);
    assert.equal(calculateAttendancePercentage(1, 1), 100);
  });

  await t.test('Boundary case: 0% attendance (attended === 0, total > 0)', () => {
    assert.equal(calculateAttendancePercentage(0, 10), 0);
    assert.equal(calculateAttendancePercentage(0, 1), 0);
  });

  await t.test('Zero-class case: safely handles division by zero (totalClasses === 0)', () => {
    assert.equal(calculateAttendancePercentage(0, 0), 0);
    assert.equal(calculateAttendancePercentage(2, 0), 0);
  });

  await t.test('Edge / invalid input handling', () => {
    assert.equal(calculateAttendancePercentage(-1, 5), 0);
    assert.equal(calculateAttendancePercentage(5, -2), 0);
    assert.equal(calculateAttendancePercentage('abc', 10), 0);
    assert.equal(calculateAttendancePercentage(5, 'xyz'), 0);
    assert.equal(calculateAttendancePercentage(null, undefined), 0);
  });

  await t.test('Attended classes cap at total classes (attended > total handled safely)', () => {
    assert.equal(calculateAttendancePercentage(12, 10), 100);
  });
});

