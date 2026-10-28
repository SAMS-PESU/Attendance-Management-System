# SAMS Sprint 1 — Work allocation and acceptance checklist

Sprint dates in the project plan: 19–23 October 2026. Confirm with the guide if late completion is accepted.

## GitHub issue owners shown on the board
- #1 Login and role identification — Manav / AlphaRay07
- #2 Database and core schema — Manav / AlphaRay07
- #3 Role-based access control — Manav / AlphaRay07
- #4 View assigned classes and enrolled students — Merwyn-Prince-Lobo
- #5 Attendance marking — tanvimag (Tanvi)
- #6 View attendance by class and date — parnika-265 (Parnika)
- #9 Prevent duplicate attendance records — tanvimag (Tanvi)
- #12 Manage classes, teachers, students — Merwyn-Prince-Lobo
- #13 Assign teachers and enrol students — Merwyn-Prince-Lobo
- #16 Secure password storage and authentication — AlphaRay07 (Manav)
- #20 GitHub Actions checks — Merwyn-Prince-Lobo

## Role allocation proposed in discussion
- Scrum Master: Machamma Parnika — coordinate planning, progress, blockers, review, and retrospective. Also implement assigned issue #6.
- QA Lead: Magalur Tanvi, only if team agrees to the reassignment; prepare tests and evidence, and implement assigned issues #5 and #9.
- Product Owner: Merwyn Prince Lobo — clarify requirements, acceptance criteria, and review assigned issues #4, #12, #13.
- Tech Lead: Manav Dewangan — architecture, database/API decisions, code review, integration, and implementation of assigned issues #1, #2, #3, #16.
Role duties do not replace issue ownership: each assigned owner is responsible for implementation; all members help test/integrate.

## Sprint 1 acceptance checklist
- [ ] Database schema applies cleanly in MySQL.
- [ ] Login accepts valid credentials and rejects invalid credentials.
- [ ] Passwords are hashed; protected routes reject missing/invalid tokens.
- [ ] Admin-only operations reject teacher/student accounts.
- [ ] Admin can create classes, students, teachers, and assign/enrol them.
- [ ] Teacher can see assigned classes and enrolled students.
- [ ] Teacher can view attendance by class/date and mark enrolled students.
- [ ] Duplicate attendance for the same class/student/date is rejected.
- [ ] GitHub Actions workflow runs on push and pull request.
- [ ] Test cases, execution evidence, defects, and acceptance notes are recorded.

## Important implementation notes
This starter has a local-demo registration endpoint and a basic API/UI. Restrict public registration before deployment. The schema has separate users/students/teachers tables, so user accounts must be linked to corresponding student/teacher records to get class-specific access. Use only synthetic test data.
