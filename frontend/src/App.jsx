import AdminManagement from './AdminManagement.jsx';
import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const today = new Date().toISOString().slice(0, 10);

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('sams_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('sams_user') || 'null'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [attendanceThreshold, setAttendanceThreshold] = useState(75);
  const [date, setDate] = useState(today);
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
    return body;
  }

  async function login(e) {
    e.preventDefault();
    setMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage('Please enter your email.');
      return;
    }
    if (!password) {
      setMessage('Please enter your password.');
      return;
    }

    setBusy(true);
    try {
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password })
      });
      localStorage.setItem('sams_token', result.token);
      localStorage.setItem('sams_user', JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
    } catch (err) {
      setMessage(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem('sams_token');
    localStorage.removeItem('sams_user');
    setToken('');
    setUser(null);
    setClasses([]);
    setRecords([]);
    setDashboard(null);
    setMessage('');
  }

  // Re-verify session and role on mount if token is stored
  useEffect(() => {
    if (!token) return;
    request('/auth/me')
      .then(data => {
        if (data.user) {
          setUser(data.user);
          localStorage.setItem('sams_user', JSON.stringify(data.user));
        }
      })
      .catch(() => {
        // If token expired or invalid, log out gracefully
        logout();
      });
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    request('/classes')
      .then(list => {
        setClasses(list);
        setClassId(current => list.some(item => String(item.id) === current)
          ? current
          : (list[0] ? String(list[0].id) : ''));
      })
      .catch(err => setMessage(err.message));
  }, [token, user]);

  useEffect(() => {
    if (!token || user?.role !== 'teacher' || !classId) {
      setDashboard(null);
      setDashboardLoading(false);
      setDashboardError('');
      return;
    }

    const controller = new AbortController();
    setDashboard(null);
    setDashboardError('');
    setDashboardLoading(true);
    request(`/attendance/dashboard?classId=${encodeURIComponent(classId)}`, { signal: controller.signal })
      .then(setDashboard)
      .catch(err => {
        if (!controller.signal.aborted) setDashboardError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDashboardLoading(false);
      });

    return () => controller.abort();
  }, [token, user?.role, classId]);

  async function loadAttendance() {
    if (!classId || !date) {
      setMessage('Select a class and date.');
      return;
    }

    setBusy(true);
    setMessage('');
    setRecords([]);

    try {
      if (user.role === 'student') {
        const result = await request(
          `/attendance/mine?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`
        );

        setRecords([{
          studentId: user.id,
          studentNumber: user.studentNumber || '',
          studentName: user.name,
          status: result.status || null,
          className: result.className,
          classCode: result.classCode,
          attendanceDate: result.attendanceDate
        }]);

        setMessage(
          result.status
            ? 'Your attendance record was loaded.'
            : 'Your attendance has not been recorded for this date yet.'
        );
      } else {
        const data = await request(
          `/attendance?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`
        );

        setRecords(data);

        setMessage(
          data.some(r => r.status)
            ? 'Attendance records loaded.'
            : 'No attendance has been recorded for this date. You can mark attendance below.'
        );
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateStatus(studentId, status) {
    setRecords(old => old.map(r => r.studentId === studentId ? { ...r, status } : r));
  }

  async function saveAttendance() {
    const incomplete = records.filter(r => !r.status);
    if (incomplete.length) return setMessage('Choose Present or Absent for every student before saving.');
    setBusy(true);
    setMessage('');
    try {
      const result = await request('/attendance', {
        method: 'POST',
        body: JSON.stringify({ classId: Number(classId), date, records: records.map(r => ({ studentId: r.studentId, status: r.status })) })
      });
      setMessage(result.message);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedClass = classes.find(item => String(item.id) === classId);
  const validAttendanceThreshold = Number.isFinite(attendanceThreshold) &&
    attendanceThreshold >= 0 && attendanceThreshold <= 100;
  const studentsBelowCriterion = validAttendanceThreshold && dashboard?.totalClasses > 0
    ? dashboard.students.filter(student => student.attendancePercentage < attendanceThreshold)
    : [];

  if (!token || !user) return <main className="login-shell">
    <form className="panel login" onSubmit={login}>
      <p className="eyebrow">SAMS · STUDENT ATTENDANCE MANAGEMENT SYSTEM</p>
      <h1>Sign in</h1>
      <p className="muted">Use an account registered in your local SAMS database.</p>
      <label>Email
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="username"
          placeholder="e.g. admin@example.com"
        />
      </label>
      <label>Password
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Enter password"
          />
          <button
            type="button"
            className="secondary"
            style={{ width: 'auto', whiteSpace: 'nowrap', padding: '0 12px' }}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {message && <p className="notice error">{message}</p>}
      <p className="small muted">Local demo: create an account using the backend register endpoint described in README.md.</p>
    </form>
  </main>;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">SAMS</p>
        <h1>Attendance</h1>
      </div>
      <div className="userbox">
        <span style={{ textTransform: 'capitalize' }}>
          <strong>{user.name}</strong> · <span className="badge">{user.role}</span>
        </span>
        <button className="secondary" onClick={logout}>Sign out</button>
      </div>
    </header>
    <section className="panel">
      <h2>View attendance by class and date</h2>
      <p className="muted">Select a class and date to view or mark attendance for enrolled students.</p>
     
<div className="filters">
  <label>
    Class
    <select
      value={classId}
      onChange={e => {
        setClassId(e.target.value);
        setRecords([]);
        setMessage('');
      }}
      required
    >
      <option value="">Select a class</option>
      {classes.map(c => (
        <option key={c.id} value={c.id}>
          {c.class_code} — {c.class_name}
          {c.section ? ` (${c.section})` : ''}
        </option>
      ))}
    </select>
  </label>

  <label>
    Date
    <input
      type="date"
      value={date}
      onChange={e => {
        setDate(e.target.value);
        setRecords([]);
        setMessage('');
      }}
      required
    />
  </label>

  <button
    onClick={loadAttendance}
    disabled={busy || !classId}
  >
    {busy ? 'Loading…' : 'View attendance'}
  </button>
</div>

      {user.role === 'teacher' && <section className="class-roster" aria-live="polite">
        <div className="dashboard-heading">
          <div>
            <h3>Class dashboard{selectedClass && ` · ${selectedClass.class_code}`}</h3>
            {dashboard && <p className="muted">{dashboard.totalClasses} attendance sessions recorded.</p>}
          </div>
          <label className="threshold-control">
            Attendance criterion (%)
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={attendanceThreshold}
              onChange={e => setAttendanceThreshold(e.target.value === '' ? '' : Number(e.target.value))}
              aria-invalid={!validAttendanceThreshold}
            />
          </label>
        </div>
        {dashboardLoading && <p className="muted">Loading class dashboard…</p>}
        {dashboardError && <p className="notice error">{dashboardError}</p>}
        {!validAttendanceThreshold && <p className="notice error">Enter an attendance criterion from 0 to 100.</p>}
        {!dashboardLoading && !dashboardError && dashboard && <>
          <p className="muted">
            {!validAttendanceThreshold
              ? 'Set a valid criterion to identify students below it.'
              : dashboard.totalClasses === 0
                ? 'Attendance percentages will be available after attendance is recorded.'
                : `${studentsBelowCriterion.length} student${studentsBelowCriterion.length === 1 ? '' : 's'} below ${attendanceThreshold}%.`}
          </p>
          {dashboard.students.length === 0
            ? <p className="muted">No students are enrolled in this class.</p>
            : <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Student number</th>
                  <th>Student name</th>
                  <th>Email</th>
                  <th>Attendance</th>
                  <th>Percentage</th>
                  <th>Criterion</th>
                </tr></thead>
                <tbody>{dashboard.students.map(student => {
                  const belowCriterion = validAttendanceThreshold &&
                    dashboard.totalClasses > 0 &&
                    student.attendancePercentage < attendanceThreshold;
                  return <tr key={student.id}>
                    <td>{student.student_number}</td>
                    <td>{student.full_name}</td>
                    <td>{student.email || '—'}</td>
                    <td>{student.attendedClasses} / {dashboard.totalClasses}</td>
                    <td>{dashboard.totalClasses > 0 ? `${student.attendancePercentage.toFixed(2)}%` : '—'}</td>
                    <td>
                      {dashboard.totalClasses === 0
                        ? 'Not measured'
                        : !validAttendanceThreshold
                          ? 'Set criterion'
                          : belowCriterion
                            ? <span className="attendance-warning">Below criterion</span>
                            : 'Meets criterion'}
                    </td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
        </>}
      </section>}

      {message && <p className="notice">{message}</p>}
      {records.length > 0 && <>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {user.role !== 'student' && <><th>Student ID</th><th>Student name</th></>}
                {user.role === 'student' && <th>Class</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => <tr key={r.studentId}>
                {user.role !== 'student' && <>
                  <td>{r.studentNumber}</td>
                  <td>{r.studentName}</td>
                </>}
                {user.role === 'student' && <td>{r.classCode} — {r.className}</td>}
                <td>
                  {user.role === 'teacher' || user.role === 'admin' ?
                    <select value={r.status || ''} onChange={e => updateStatus(r.studentId, e.target.value)}>
                      <option value="">Choose status</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                    </select> :
                    (r.status || 'Not recorded')}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {(user.role === 'teacher' || user.role === 'admin') && <button onClick={saveAttendance} disabled={busy} className="save">Save attendance</button>}
      </>}
      {!classes.length && <p className="notice">No classes are available for this account. Ask an administrator to create/assign a class and enrol students.</p>}
    </section>

    {user.role === 'admin' && (
      <AdminManagement token={token} />
    )}

    <footer>Sprint 1 starter · Please validate with your team's SRS and test plan.</footer>
  </main>;
}
