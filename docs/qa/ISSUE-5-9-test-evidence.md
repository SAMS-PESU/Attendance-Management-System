# Test Evidence — Issues #5 (Attendance marking) and #9 (Prevent duplicate attendance)



| Item | Detail |

|---|---|

| Tester | Tanvi (tanvimag) |

| Date executed | 29 October 2026 (automated run 11:03:03; log `evidence/attendance-test-run-20261029-110303.txt`) |

| Environment | Local: Windows, Node.js, MySQL 8.0, backend on `http://localhost:5000` |

| Endpoint under test | `POST /api/attendance` (`backend/src/routes/attendanceMark.js`) |

| Test data | Synthetic only: teacher `teacher1@example.com` assigned to CSE-A (class 1); demo students 1 and 2 enrolled in CSE-A; class 2 (CSE-B) not assigned to the teacher |

| Method | Requests sent from PowerShell (`Invoke-RestMethod`); database checked with MySQL `SELECT` |



**Result key:** PASS = actual result matched expected, as recorded in the run log.



**Evidence:** All of TC-ATT-01 to 17 were re-run with `docs/qa/run-attendance-tests.ps1`, which marks each case PASS or FAIL automatically and saves a timestamped log. `evidence/test-run.png` is a screenshot of that run; `evidence/db-check.png` is the MySQL output for TC-ATT-18. If any row differs from the log, the log is the source of truth.



## 1. Authentication and authorisation



| ID | Test | Input | Expected | Result | Evidence |

|---|---|---|---|---|---|

| TC-ATT-01 | No token | Valid body, no `Authorization` header | 401 `Authentication required.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-02 | Wrong role | Valid body, student-role token | 403 `You do not have permission for this action.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-03 | Teacher not assigned to class | `classId: 2` | 403 `This class is not assigned to you.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-04 | Class does not exist | `classId: 999` | 403, same message as TC-ATT-03 (does not reveal which class IDs exist) | PASS | `evidence/test-run.png`, run log |



## 2. Input validation (#5)



| ID | Test | Input | Expected | Result | Evidence |

|---|---|---|---|---|---|

| TC-ATT-05 | Invalid status | `status: "late"` | 400 `status must be 'present' or 'absent'.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-06 | Impossible date | `date: "2026-13-45"` | 400 `date must be a real date in YYYY-MM-DD format.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-07 | Wrong date format | `date: "29-10-2026"` | 400, same date message | PASS | `evidence/test-run.png`, run log |

| TC-ATT-08 | Empty records | `records: []` | 400 `records must be a non-empty array.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-09 | Same student twice in one request | studentId 1 twice | 400 `A student cannot appear twice in one request.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-10 | Missing classId | body without `classId` | 400 `classId must be a positive whole number.` | PASS | `evidence/test-run.png`, run log |



## 3. Enrolment check (#5)



| ID | Test | Input | Expected | Result | Evidence |

|---|---|---|---|---|---|

| TC-ATT-11 | Student not enrolled | `studentId: 99` in class 1 | 400 `One or more students are not enrolled in this class.` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-12 | One enrolled, one not | studentIds 1 and 99 | 400, same message; nothing saved | PASS | `evidence/test-run.png`, run log |



## 4. Saving attendance (#5) and rejecting duplicates (#9)



Attendance table was emptied (`DELETE FROM attendance;`) before this group.



| ID | Test | Input | Expected | Result | Evidence |

|---|---|---|---|---|---|

| TC-ATT-13 | First save | class 1, 2026-10-29, students 1 (present) and 2 (absent) | 201 `Attendance saved.`, count 2 | PASS | `evidence/test-run.png`, run log |

| TC-ATT-14 | Exact repeat | same request as TC-ATT-13 | 409 `Attendance already exists for this class and date. Nothing was saved.` with `duplicateStudentIds: [1, 2]` | PASS | `evidence/test-run.png`, run log |

| TC-ATT-15 | Same students, different date | 2026-10-30 | 201, count 2 (a new day is allowed) | PASS | `evidence/test-run.png`, run log |

| TC-ATT-16 | One student, new date | 2026-10-31, student 1 only | 201, count 1 | PASS | `evidence/test-run.png`, run log |

| TC-ATT-17 | Partial overlap | 2026-10-31, students 1 and 2 | 409 with `duplicateStudentIds: [1]`; student 2 NOT saved (all-or-nothing) | PASS | `evidence/test-run.png`, run log |

| TC-ATT-18 | Database state after TC-ATT-13 to 17 | `SELECT attendance_date, student_id, status FROM attendance ORDER BY attendance_date, student_id;` | Exactly 5 rows; no row for student 2 on 2026-10-31 | PASS | `evidence/db-check.png` |



Database output captured:



```

| 2026-10-29 | 1 | present |

| 2026-10-29 | 2 | absent  |

| 2026-10-30 | 1 | present |

| 2026-10-30 | 2 | present |

| 2026-10-31 | 1 | present |

```



## 5. Summary



| Total executed | Passed | Failed |

|---|---|---|

| 18 (17 automated + 1 database check) | 18 | 0 |



## 6. Defects



| ID | Found in | Description | Status |

|---|---|---|---|

| DEF-01 | Starter implementation (`routes/attendance.js`, PR #21) | Marking used `INSERT ... ON DUPLICATE KEY UPDATE`, so a duplicate request silently overwrote the earlier record and returned success. This contradicts the acceptance criterion "Duplicate attendance for the same class/student/date is rejected." The 409 handler in that file could never run. | Fixed in this PR: plain `INSERT`, a pre-check returning 409 with the duplicated student IDs, and a handler for the database `ER_DUP_ENTRY` error. Verified by TC-ATT-14 and TC-ATT-17. |

| DEF-02 | Test script (`run-attendance-tests.ps1`), first run | Script read an empty error body on Windows PowerShell, so 13 of 17 cases showed FAIL although every HTTP status was correct. Test-tooling defect, not a product defect. | Fixed: script now reads `$_.ErrorDetails.Message`. Re-run: 17/17 PASS. |



## 7. Not executed



| Item | Reason |

|---|---|

| Two simultaneous requests for the same class and date (race condition) | Needs a concurrent test tool. The code handles it: the database `UNIQUE KEY (class_id, student_id, attendance_date)` rejects the second insert and the route returns 409. To be covered in Sprint 2 alongside issue #18. |

| Admin marking any class | Admin account not created in this session. |

| Frontend behaviour | Out of scope for this PR; this evidence covers the API only. |



## 8. Acceptance notes



- [x] Teacher can mark attendance for enrolled students of an assigned class (#5)

- [x] Duplicate attendance for the same class, student and date is rejected (#9)

- [x] Saves are all-or-nothing (transaction)

- [x] `marked_by` is taken from the logged-in user, never from the request body

- [x] Only synthetic test data used

