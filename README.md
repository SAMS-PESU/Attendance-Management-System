# SAMS – Student Attendance Management System

SAMS is a web application that lets colleges mark, view and manage student attendance. Teachers record attendance for their classes, students check their own attendance and percentage, and administrators manage classes, teachers and students from a dashboard.

Built for the Software Engineering mini-project at PES University.

---

## Features

- **Login and registration** for three roles: student, teacher and administrator
- **Role-based access control**: each role only sees what it is allowed to
- **Mark attendance** (present/absent) for an assigned class and date
- **View attendance by date** for a class, including past dates
- **Edit attendance** with an audit log of who changed what and when
- **Duplicate prevention**: attendance can't be marked twice for the same class and date
- **Attendance percentage** per student and class
- **Student self-view**: students see their own records and percentage
- **Admin dashboard**: manage classes, assign teachers, enroll students
- **Secure passwords**: stored as salted hashes, never in plain text
- **Responsive interface** that works on desktop and mobile screens

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React with Vite |
| Backend | Node.js REST API |
| Database | SQL database (schema in `database/schema.sql`) |
| Testing | Automated backend tests in `backend/test` |
| CI | GitHub Actions (`.github/workflows`) |

---

## Project Structure

```
Attendance-Management-System/
├── backend/        # REST API, authentication, business logic and tests
│   ├── src/        # routes, middleware, database connection, server.js
│   └── test/       # automated tests
├── frontend/       # React web application
│   └── src/        # pages and components (login, dashboards, student view)
├── database/       # schema.sql – database tables
├── docs/           # setup guide, sprint notes and QA/test evidence
└── README.md
```

---

## Getting Started

### Prerequisites

Install these first:

- [Node.js](https://nodejs.org) (LTS version) and npm
- [Git](https://git-scm.com)
- The database server used by this project (see `docs/DATABASE_SETUP.md`)

### 1. Clone the repository

```bash
git clone https://github.com/SAMS-PESU/Attendance-Management-System.git
cd Attendance-Management-System
```

### 2. Set up the database

Follow the steps in [`docs/DATABASE_SETUP.md`](docs/DATABASE_SETUP.md). In short: create a database and load `database/schema.sql` into it.

### 3. Configure the backend

Create a file named `.env` inside the `backend` folder with your database details and a secret key for login tokens:

```
PORT=3000
DB_HOST=localhost
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_NAME=your_database_name
JWT_SECRET=choose-a-long-random-secret
```

Never commit your `.env` file or share its contents.

### 4. Install dependencies

```bash
cd backend
npm install
cd ../frontend
npm install
```

### 5. Run the application

Open **two terminals**.

**Terminal 1 – backend**

```bash
cd backend
npm start
```

**Terminal 2 – frontend**

```bash
cd frontend
npm run dev
```

Open the address printed by the frontend (usually **http://localhost:5173**) in your browser.

---

## Creating Your First Account

The login page needs an account that already exists in your local database. With the backend running, create one using the register endpoint. Example in PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/register `
  -ContentType "application/json" `
  -Body '{"name":"Admin","email":"admin@example.com","password":"Admin@123","role":"admin"}'
```

Then sign in on the website with that email and password. Create teacher and student accounts the same way, changing `role`.

---

## Running the Tests

```bash
cd backend
npm test
```

Test reports and QA evidence (performance, availability, recovery) are in the [`docs/qa`](docs/qa) folder.

---

## User Roles

| Role | What they can do |
|---|---|
| **Student** | View own attendance records and percentage |
| **Teacher** | Mark and edit attendance for assigned classes, view records by date, view a student's attendance |
| **Administrator** | Everything above, plus manage classes, teachers and student enrollment from the dashboard |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Invalid or malformed authentication token" on the login page | Clear your browser's saved site data (or run `localStorage.clear()` in the browser console) and reload |
| Backend won't start or can't connect to the database | Check the database server is running and the details in `backend/.env` are correct |
| Page loads but shows no data | Make sure the backend is running and the port matches the one the frontend uses |
| `npm` is not recognised | Install Node.js and restart your terminal |
| Port already in use | Close the other program, or change `PORT` in `backend/.env` |

---

## Team

| Name | Role |
|---|---|
| Parnika | Scrum Master |
| Manav Dewangan | Developer |
| Tanvi Magalur | QA Lead |
| Merwyn Prince Lobo | Product Owner |

---

## Project Documents

- Software Requirements Specification (SRS)
- [Software Architecture and Design Specification](SAMS_Software_Architecture_and_Design_Specification.docx)
- [Software Test Plan](SAMS_Software_Test_Plan.docx)
- [Database setup guide](docs/DATABASE_SETUP.md)
- Sprint 1 demo video: `Sprint1_Demo.mp4`
- Sprint 2 demo video: `Sprint2_Demo.mp4`

---

## Agile Process

The project was built in two sprints using a GitHub Project board:

- **Sprint 1**
- **Sprint 2**

Each feature was developed on its own branch, raised as a pull request by the assigned developer, and reviewed and merged by the repository owner.
