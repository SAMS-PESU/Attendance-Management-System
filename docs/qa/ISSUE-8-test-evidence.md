# Test Evidence — Issue #8 (Edit previously recorded attendance)

| Item | Detail |
|---|---|
| Tester | Tanvi (tanvimag) |
| Date executed | 30 October 2026, 11:22:00 (automated run; log `evidence/attendance-test-run-20261030-112200.txt`) |
| Environment | Local: Windows, Node.js 20, MySQL 8.0, backend on `http://localhost:5000`, running the repository code from branch `feature/issue-8-edit-attendance` |
| Endpoint under test | `PATCH /api/attendance` (`backend/src/routes/attendanceMark.js`) |
| Test data | Synthetic only: teacher `teacher1@example.com` assigned to CSE-A (class 1); demo students 1 and 2 enrolled in CSE-A; class 2 not assigned to the teacher |
| Method | `docs/qa/run-attendance-tests.ps1` (PASS/FAIL checked automatically against HTTP status and message), plus a MySQL `SELECT` |

## Behaviour implemented

- `PATCH /api/attendance` takes `classId`, `date` and `records` (same body as marking). It changes the status of records that already exist.
- A record that does not exist returns 404 ("Mark it first"); editing never creates records and marking never overwrites them.
- Same permission rule as marking: an assigned teacher or an admin.
- A request that would not change anything is a no-op (nothing written).
- The whole request is one transaction with row locking: if any student has no record, nothing is changed.
- `marked_by` keeps the original marker. Who made the edit is to be recorded by the audit log (issue #17).

## Results

Attendance table was emptied (`DELETE FROM attendance;`) before the run. The 17 marking tests (TC-ATT-01 to 17, see `ISSUE-5-9-test-evidence.md`) were re-run as a regression check after the validation code was refactored into a shared function: all 17 PASS. The edit tests start from this state: 10-29 student 1 present, student 2 absent; 10-30 both present; 10-31 student 1 present.

| ID | Test | Input | Expected | Result | Evidence |
|---|---|---|---|---|---|
| TC-ATT-19 | Edit absent to present | 10-29, student 2 present | 200 `Attendance updated.`, changed 1 (2: absent to present) | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-20 | Same value again | same request as TC-ATT-19 | 200 `No changes: records already had these values.`, changed 0 | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-21 | Edit two students at once | 10-30, students 1 and 2 absent | 200 `Attendance updated.`, changed 2 | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-22 | Date with no records | 2026-11-15 | 404 `Mark it first`, `missingStudentIds: [1]` | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-23 | All-or-nothing | 10-31, student 1 absent and student 2 present (student 2 has no record) | 404 `Nothing was changed`, `missingStudentIds: [2]`; student 1 stays present | PASS | `evidence/issue8-test-run.png`, `evidence/issue8-db-check.png` |
| TC-ATT-24 | Invalid status | `status: "late"` | 400 `status must be 'present' or 'absent'.` | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-25 | Class not assigned | `classId: 2` | 403 `This class is not assigned to you.` | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-26 | Student role | student-role token | 403 `Forbidden: role 'student' is not authorized for this resource.` | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-27 | No token | no `Authorization` header | 401 `Authentication required.` | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-28 | Marking still rejects duplicates after edits | POST 10-29, students 1 and 2 | 409 with `duplicateStudentIds: [1, 2]` | PASS | `evidence/issue8-test-run.png`, run log |
| TC-ATT-29 | Database state after the full run | `SELECT attendance_date, student_id, status, marked_by FROM attendance ORDER BY attendance_date, student_id;` | See below | PASS | `evidence/issue8-db-check.png` |

Expected and observed database state after the run:

```
| 2026-10-29 | 1 | present | 1 |
| 2026-10-29 | 2 | present | 1 |
| 2026-10-30 | 1 | absent  | 1 |
| 2026-10-30 | 2 | absent  | 1 |
| 2026-10-31 | 1 | present | 1 |
```

Student 1 on 10-31 is unchanged (TC-ATT-23 was rejected as a whole) and `marked_by` is still 1 on every row (edits keep the original marker).

## Summary

| Total executed | Passed | Failed |
|---|---|---|
| 28 (27 automated, of which 17 regression and 10 new, plus 1 database check) | 28 | 0 |

## Not executed

| Item | Reason |
|---|---|
| Two simultaneous edits to the same record | Needs a concurrent test tool. The route locks the rows with `SELECT ... FOR UPDATE` inside a transaction, so the second edit waits for the first. To be covered with issue #18. |
| Admin editing any class | Admin account not created in this session. |
| Audit entry for each edit | Belongs to issue #17 (SEC-005); the edit route is written so the audit insert can join the same transaction. |
| Frontend behaviour | Out of scope for this PR; this evidence covers the API only. |

## Acceptance notes

- [x] A teacher can edit previously recorded attendance for an assigned class (#8)
- [x] Editing a record that does not exist is rejected
- [x] Edits are all-or-nothing (transaction with row locks)
- [x] Unchanged values are not rewritten
- [x] `marked_by` is preserved
- [x] Only synthetic test data used
