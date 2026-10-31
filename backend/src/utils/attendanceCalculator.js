/**
 * Pure calculation helper for attendance percentage.
 * Formula: Percentage = (classes attended / total classes conducted) * 100
 *
 * @param {number} attendedClasses - Total classes attended (present)
 * @param {number} totalClasses - Total classes conducted
 * @returns {number} Percentage rounded to 2 decimal places, or 0 when totalClasses is 0
 */
export function calculateAttendancePercentage(attendedClasses, totalClasses) {
  const attended = Number(attendedClasses);
  const total = Number(totalClasses);

  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }

  if (!Number.isFinite(attended) || attended <= 0) {
    return 0;
  }

  if (attended >= total) {
    return 100;
  }

  return Number(((attended / total) * 100).toFixed(2));
}

