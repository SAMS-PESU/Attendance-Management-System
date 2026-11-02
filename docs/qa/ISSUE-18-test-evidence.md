# Test Evidence — Issue #18 (Meet performance and availability targets)

| Item | Detail |
|---|---|
| Tester | Tanvi (tanvimag) |
| Date executed | 2 November 2026 |
| Environment | Local: Windows, Node.js 20, MySQL 8.0 (service MySQL80), backend on `http://localhost:5000`, branch `feature/issue-18-performance-availability` |
| Requirements | NFR-001 (attendance updates within 3 seconds), NFR-002 (record and dashboard views within 3 seconds), NFR-003 (at least 99.5% monthly availability, excluding scheduled maintenance), recovery from recoverable failures |
| Test plan cases | TC-Perf-01, TC-Perf-02, TC-Rel-01 |
| Method | Scripts in `docs/qa/perf/` (performance, availability monitor, recovery test); query plans with `EXPLAIN`; logs and screenshots in `docs/qa/evidence/` |
| Test data | Synthetic only: class PERF-A with 60 students and 60 sessions (3,600 attendance rows), created by `seed-perf-data.sql` and removed by `cleanup-perf-data.sql` |
| Load profile | One user, requests one after another ("normal operating conditions"). Not a stress test. |

## 1. Performance (NFR-001, NFR-002)

Each test sends 30 timed requests after 2 warm-up requests. A test passes if every request returns the expected status and the 95th percentile is 3000 ms or less. The class has 60 students, so each update and edit request carries 60 records, the heaviest realistic request. The edit also writes one audit row per changed student (issue #17). The data was reset with `reset-perf-data.sql` before each run (run 1 used freshly seeded data).

| ID | Test | Run 1 (08:55) min / avg / p95 / max ms | Run 2 (14:14) | Run 3 (14:23) | Result |
|---|---|---|---|---|---|
| TC-Perf-01a | Mark attendance, whole class (POST) | 46 / 65 / 81 / 85 | 17 / 22 / 30 / 35 | 16 / 22 / 41 / 41 | PASS |
| TC-Perf-01b | Edit attendance, whole class, with audit rows (PATCH) | 65 / 87 / 109 / 112 | 21 / 25 / 33 / 35 | 24 / 28 / 33 / 33 | PASS |
| TC-Perf-02a | View attendance by class and date (GET) | 16 / 31 / 50 / 55 | 9 / 11 / 13 / 14 | 12 / 14 / 16 / 16 | PASS |
| TC-Perf-02b | Teacher dashboard with percentages (GET) | 110 / 146 / 224 / 362 | 59 / 114 / 157 / 160 | 63 / 114 / 153 / 160 | PASS |

Failed requests: 0 in all runs. The slowest 95th percentile in any run is 224 ms (dashboard, run 1), about 13 times faster than the 3000 ms target. Run 1 was slower than runs 2 and 3 (first run after a restart, caches cold); the variation between runs is normal and all runs are far inside the target.

Evidence: `evidence/issue18-perf-run.png`, logs `evidence/perf-run-20261102-085503.txt`, `evidence/perf-run-20261102-141421.txt`, `evidence/perf-run-20261102-142310.txt`.

Query plans (`evidence/issue18-explain.png`): the class view uses `uq_enrollment`, `PRIMARY` and `uq_attendance_class_student_date`, one row looked up per student; the dashboard session count is answered from `idx_attendance_class_date` (index only, 3,600 entries). No full table scan. The only `filesort` is the `ORDER BY` over 60 rows. The dashboard count reads every row of the class from the index, so it is the slowest request and will grow with the number of records.

### Discarded runs

Repeating the script without resetting the data gave invalid results: the 30 POST requests were rejected with HTTP 409 because those dates already had records (the duplicate protection from issue #9 working under load), and the PATCH requests became no-ops because the values were already set (issue #8 writes nothing for unchanged values), so they looked unrealistically fast. Those logs were deleted and `reset-perf-data.sql` was added so every valid run starts from the same data.

## 2. Availability (NFR-003)

| ID | Test | Result | Evidence |
|---|---|---|---|
| TC-Rel-01a | Steady state, health check polled every 2 s for 120 s | 60 polls, 60 up, 100.00%, 0 outages | `evidence/issue18-availability-steady.png`, `evidence/availability-run-20261102-142628.txt` |
| TC-Rel-01b | Steady state, polled every 2 s for 180 s | 89 polls, 89 up, 100.00%, 0 outages | `evidence/availability-run-20261102-142909.txt` |
| TC-Rel-01c | Recovery after a database outage (MySQL service stopped 20 s, then started), Node server not restarted | PASS, see below | `evidence/issue18-availability-recovery.png`, `evidence/issue18-server-log.png`, `evidence/recovery-run-20261102-143622.txt` |

### TC-Rel-01c timeline (from the log)

| Time | Event | Health check | Attendance records |
|---|---|---|---|
| 14:36:23 | Healthy | 200 | 200 |
| 14:36:38 | MySQL service stopped | | |
| 14:36:41 | MySQL down | 503 `database unavailable` | 500 `Internal server error.` |
| 14:37:01 | MySQL service started | | |
| 14:37:02 | First check after start | 200 | 200 |

- The API reported unavailable for 21.5 seconds in total (the 20 second outage plus the service start time).
- The API answered with clean error responses while the database was down and the Node server kept running. The server log (`evidence/issue18-server-log.png`) shows the start line only once, followed by the logged connection errors; it was never restarted.
- The API recovered by itself as soon as MySQL accepted connections (the connection pool reconnects). The "0.0 s after MySQL was started" lines in the script summary only mean the first check after `Start-Service` returned already succeeded; the service start time itself is part of the 21.5 s.

### Monthly availability budget

99.5% of a 30-day month (43,200 minutes) allows 216 minutes, about 3.6 hours, of unavailability. The measured windows (about 5 minutes with no outage, and one deliberate 21.5 second outage that recovered without intervention) are far too short to prove a monthly figure. They show that monitoring exists (`/api/health` and `monitor-health.ps1`) and that a database outage is a short, self-recovering event, which is what keeps real downtime inside the budget.

## 3. Observations (not changed in this issue)

- While the database is down, the record endpoints return HTTP 500. HTTP 503 (service unavailable) would describe the situation more accurately, as the health check already does.
- Every failed request writes a full stack trace to the server console, which fills the log during an outage.

## 4. Not executed

| Item | Reason |
|---|---|
| Many simultaneous users | Needs a load-testing tool; this evidence covers one user at a time. |
| A full month of uptime | Not possible in the project timeframe; see the budget above. |
| Failures other than a database outage (network loss, host restart) | Only the database outage was simulated. |
| Browser page load time | These tests measure the API only. |
| Student self-view endpoints | Not in this branch when the tests were run. |

## 5. Acceptance notes

- [x] Attendance updates complete well within 3 seconds (NFR-001)
- [x] Record views and the dashboard complete well within 3 seconds (NFR-002)
- [x] Availability is monitored and the API recovers by itself after a database outage (NFR-003, TC-Rel-01)
- [x] Queries use indexes; no full table scans
- [x] Only synthetic test data used; it is removed by `cleanup-perf-data.sql`
