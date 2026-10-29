
# SAMS Sprint 1 Starter

Starter implementation for the SAMS Student Attendance Management System, using:
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL
- CI: GitHub Actions

This is a starter codebase for Sprint 1 issues #1, #2, #3, #4, #5, #6, #9, #12, #13, #16, and #20. Review it with your team's SRS/SAD and existing repository before merging. It is not a production deployment.

## Requirements
- Node.js 20+ and npm
- MySQL 8+
- Git

## Setup

### 1. Database
Open MySQL Workbench or the MySQL command line and run `database/schema.sql`.
This creates a database named `sams_db` and core tables. It also inserts sample class/student records, but no default password is seeded.

### 2. Backend
Open a terminal in `backend`:
```powershell
Copy-Item .env.example .env
npm install
```
Edit `.env` with your MySQL username/password and a long random `JWT_SECRET`.
Then:
```powershell
npm run dev
```
Backend runs on http://localhost:5000. Check http://localhost:5000/api/health.

Create the first administrator through the register endpoint only during local setup:
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/register -ContentType "application/json" -Body '{"name":"SAMS Admin","email":"admin@example.com","password":"ChangeThisPassword123!","role":"admin"}'
```
For a class demo, you can also register teacher/student accounts. In a real deployment, public registration must be disabled or restricted to admins.

### 3. Frontend
Open another terminal in `frontend`:
```powershell
Copy-Item .env.example .env
npm install
npm run dev
```
Open the URL printed by Vite (usually http://localhost:5173).

## API endpoints
- `POST /api/auth/register` — local/demo registration; roles: admin, teacher, student
- `POST /api/auth/login`
- `GET /api/classes` — authenticated classes; admins see all, teachers see assigned classes, students see enrolled classes
- `GET /api/classes/:id/students`
- `POST /api/classes` — admin only
- `POST /api/students` — admin only
- `POST /api/teachers` — admin only
- `POST /api/classes/:id/teachers/:teacherId` — admin only
- `POST /api/classes/:id/students/:studentId` — admin only
- `POST /api/attendance?classId=1&date=2026-10-27` — teacher/admin marks attendance
- `GET /api/attendance?classId=1&date=2026-10-27` — class/date attendance view
- `GET /api/attendance/dashboard?classId=1` — assigned teacher's enrolled students and attendance percentages from saved records
- `POST /api/attendance` prevents duplicate class/student/date rows via validation and a database unique constraint.

The teacher dashboard defaults to a 75% attendance criterion, which can be adjusted on screen. Percentages use present attendance records divided by distinct class dates with saved attendance. A class with no saved attendance sessions is shown as not yet measured.

## Pull-request checks
The GitHub Actions workflow in `.github/workflows/ci.yml` runs for pull requests and pushes to `main`. It installs dependencies from each package lock file, runs the backend test suite, and builds the frontend. On a pull request, check the **Checks** tab for the `Backend tests` and `Frontend production build` results; open a failed job to see its error output.

## Security notes
- Passwords are hashed with bcrypt.
- JWT is used for API authentication.
- Role checks are enforced on protected routes.
- Set a strong JWT_SECRET and use HTTPS/TLS in deployment.
- Restrict/disable public registration before deployment; this starter permits it to simplify local testing.
- Add rate limiting, stronger validation, migrations, logging, and deployment secrets before production use.

## Suggested ownership
- Manav (Tech Lead): review schema/API/security; coordinate issues #1, #2, #3, #16.
- Tanvi (QA Lead, if reassigned by agreement): test cases and feature testing; implementation owner for assigned GitHub issues remains unchanged.
- Merwyn (Product Owner): acceptance criteria and review of #4, #12, #13.
- Parnika (Scrum Master): track progress and implement assigned issue #6; coordinate integration and testing.
- Tanvi's, Parnika's, Manav's, and Merwyn's actual feature issue assignments remain the GitHub board's source of truth.

See `docs/SPRINT1_TASKS.md` for a clear issue-by-issue plan.
=======
# Attendance-Management-System
>>>>>>> origin/main
