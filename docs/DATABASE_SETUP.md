# SAMS Database Setup and Schema Documentation

## 1. Overview
The Student Attendance Management System (SAMS) database is implemented in **MySQL 8.0+** using the `utf8mb4` character set and `utf8mb4_unicode_ci` collation.
The schema manages user accounts, role definitions, academic classes, student enrollments, teacher assignments, and daily attendance logs.

---

## 2. Entity-Relationship Summary

| Table | Primary Key | Foreign Keys / References | Unique Constraints / Indices | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `users` | `id` (BIGINT AUTO_INCREMENT) | None | `UNIQUE (email)` | Stores login credentials, password hashes, and user roles (`admin`, `teacher`, `student`). |
| `students` | `id` (BIGINT AUTO_INCREMENT) | `user_id` -> `users(id)` ON DELETE SET NULL | `UNIQUE (student_number)`, `UNIQUE (user_id)` | Stores academic student identity, linked to user account. |
| `teachers` | `id` (BIGINT AUTO_INCREMENT) | `user_id` -> `users(id)` ON DELETE SET NULL | `UNIQUE (employee_number)`, `UNIQUE (user_id)` | Stores faculty details, linked to user account. |
| `classes` | `id` (BIGINT AUTO_INCREMENT) | None | `UNIQUE (class_code)` | Stores course offerings, code, and section. |
| `enrollments` | `id` (BIGINT AUTO_INCREMENT) | `class_id` -> `classes(id)` ON DELETE CASCADE<br>`student_id` -> `students(id)` ON DELETE CASCADE | `UNIQUE (class_id, student_id)` | Maps students enrolled in classes; prevents duplicate enrollments. |
| `teacher_classes` | `id` (BIGINT AUTO_INCREMENT) | `class_id` -> `classes(id)` ON DELETE CASCADE<br>`teacher_id` -> `teachers(id)` ON DELETE CASCADE | `UNIQUE (class_id, teacher_id)` | Maps teachers assigned to teach specific classes. |
| `attendance` | `id` (BIGINT AUTO_INCREMENT) | `class_id` -> `classes(id)` ON DELETE CASCADE<br>`student_id` -> `students(id)` ON DELETE CASCADE<br>`marked_by` -> `users(id)` | `UNIQUE (class_id, student_id, attendance_date)`<br>`INDEX (class_id, attendance_date)` | Stores per-student attendance (`present`/`absent`) per date; strictly prevents duplicate entries. |

---

## 3. Database Setup Instructions

### Prerequisites
- MySQL Server 8.0+ running on port `3306` (or configured port).
- Node.js 20+

### Option A: Using PowerShell
From the project root:
```powershell
Get-Content database/schema.sql | mysql -u root -p
```

### Option B: Using Command Prompt (CMD)
```cmd
mysql -u root -p < database\schema.sql
```

### Option C: Using MySQL Workbench
1. Open MySQL Workbench and connect to your local MySQL instance.
2. Click **File -> Open SQL Script...** and select `database/schema.sql`.
3. Click the **Execute (Lightning Bolt)** icon.

---

## 4. Environment Configuration
Ensure `backend/.env` is configured with valid database credentials:
```env
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
JWT_SECRET=your-secure-jwt-secret-at-least-24-characters
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=sams_db
```

---

## 5. Verification & Testing
Run the automated schema and database integrity tests:
```powershell
cd backend
npm run test:db
```
*(or run `node test/db.test.js`)*
