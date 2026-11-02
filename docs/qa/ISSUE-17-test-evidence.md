# Test Evidence — Issue #17 (Record attendance changes in an audit log)

| Item | Detail |
|---|---|
| Tester | Tanvi (tanvimag) |
| Date executed | 2 November 2026 |
| Environment | Local: Windows, Node.js 20, MySQL 8.0, backend on `http://localhost:5000`, running the repository code from branch `feature/issue-17-audit-log` |
| Requirement | SEC-005: every important attendance change is recorded with the responsible user and a timestamp (Test Plan: TC-Sec-06) |
| Code under test | `PATCH /api/attendance` in `backend/src/routes/attendanceMark.js`, table `attendance_audit_log` in `database/schema.sql` |
| Test data | Synthetic only: teacher `teacher1@example.com` (user id 1), demo students 1 and 2 in class CSE-A |

## Behaviour implemented

- New table `attendance_audit_log`: attendance id, class, student, date, old status, new status, `changed_by` (user id from the login token) and `changed_at` (timestamp).
- Every edit that actually changes a status inserts one audit row per changed student.
- The status update and the audit insert are in the same database transaction: if the audit insert fails, the edit is rolled back, so an edit can never exist without its audit entry.
- Edits that change nothing, and edits rejected by validation or permission checks, write no audit rows.
- The ids in the audit table have no foreign keys to attendance, classes or students, so the history is kept if those records are later deleted. `changed_by` references `users`.

## Results

| ID | Test | Action | Expected | Result | Evidence |
|---|---|---|---|---|---|
| TC-AUD-01 | Real change is logged | PATCH 2026-10-29, student 2 present to absent | 200, changed 1; one audit row (student 2, present to absent, changed_by 1, timestamp set) | PASS | `evidence/issue17-manual.png` |
| TC-AUD-02 | No-op is not logged | Same request again | 200 `No changes`, changed 0; audit row count unchanged | PASS | `evidence/issue17-manual.png` |
| TC-AUD-03 | Rejected edit is not logged | PATCH 2026-10-31 for students 1 and 2 (student 2 has no record) | 404 `Nothing was changed`; audit row count unchanged | PASS | `evidence/issue17-manual.png` |
| TC-AUD-04 | Several changes in one request | PATCH 2026-10-30, students 1 and 2 absent to present | 200, changed 2; two audit rows | PASS | `evidence/issue17-manual.png` |
| TC-AUD-05 | Edit cannot exist without its audit entry | Audit table renamed so the audit insert fails, then PATCH 2026-10-29 student 1 present to absent | 500 `Internal server error.`; student 1 stays `present` (edit rolled back); table renamed back, 3 audit rows intact | PASS | `evidence/issue17-atomicity.png`, `evidence/issue17-server-error.png` |
| TC-AUD-06 | Regression: marking and editing still work | `docs/qa/run-attendance-tests.ps1` on a clean attendance table | 27 of 27 PASS | PASS | `evidence/issue17-test-run.png` (first run, 08:27:19, log `evidence/attendance-test-run-20261102-082719.txt`); second run on a clean audit table, 08:31:25, log `evidence/attendance-test-run-20261102-083125.txt` (27 of 27 PASS) |
| TC-AUD-07 | Audit rows from the regression run | `SELECT ... FROM attendance_audit_log` after TC-AUD-06 | Exactly 3 rows: 10-29 student 2 absent to present; 10-30 student 1 present to absent; 10-30 student 2 present to absent; changed_by 1 on all | PASS | `evidence/issue17-audit-rows.png` |
| TC-AUD-08 | History survives deletion of attendance | `DELETE FROM attendance;` then count audit rows | attendance 0 rows; audit rows unchanged (3 before, 3 after) | PASS | `evidence/issue17-audit-db.png` |

Audit row ids in the screenshots start above 1 (for example 7 to 9 in TC-AUD-07) because earlier test rows were cleared and the id counter does not reset. This is normal.

## Summary

| Total executed | Passed | Failed |
|---|---|---|
| 8 (plus the 27 automated regression cases inside TC-AUD-06) | 8 | 0 |

## Not executed

| Item | Reason |
|---|---|
| Two simultaneous edits to the same record | Needs a concurrent test tool; the route locks the rows with `SELECT ... FOR UPDATE` inside the transaction. To be covered with issue #18. |
| Reading the audit log through the API | No endpoint reads the log in this issue; it is verified directly in the database. |
| Audit entries for first-time marking | Not required here: the original marker is already stored in `attendance.marked_by` and `created_at`. |
| Admin editing any class | Admin account not created in this session. |

## Acceptance notes

- [x] Attendance changes are recorded with the responsible user and a timestamp (SEC-005)
- [x] Old and new values are kept
- [x] An edit and its audit entry succeed or fail together
- [x] No-op and rejected edits write no entries
- [x] History survives deletion of attendance records
- [x] Only synthetic test data used
