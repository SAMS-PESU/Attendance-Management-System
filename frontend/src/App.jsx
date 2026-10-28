import AdminManagement from './AdminManagement.jsx';
import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const today = new Date().toISOString().slice(0, 10);

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('sams_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('sams_user') || 'null'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
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
    e.preventDefault(); setMessage(''); setBusy(true);
    try {
      const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('sams_token', result.token);
      localStorage.setItem('sams_user', JSON.stringify(result.user));
      setToken(result.token); setUser(result.user);
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }

  function logout() {
    localStorage.removeItem('sams_token'); localStorage.removeItem('sams_user');
    setToken(''); setUser(null); setClasses([]); setRecords([]); setMessage('');
  }

  useEffect(() => {
    if (!token) return;
    request('/classes').then(list => { setClasses(list); if (list.length) setClassId(String(list[0].id)); })
      .catch(err => setMessage(err.message));
  }, [token]);

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
    setBusy(true); setMessage('');
    try {
      const result = await request('/attendance', {
        method: 'POST',
        body: JSON.stringify({ classId: Number(classId), date, records: records.map(r => ({ studentId: r.studentId, status: r.status })) })
      });
      setMessage(result.message);
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }

  if (!token || !user) return <main className="login-shell">
    <form className="panel login" onSubmit={login}>
      <p className="eyebrow">SAMS · STUDENT ATTENDANCE MANAGEMENT SYSTEM</p>
      <h1>Sign in</h1>
      <p className="muted">Use an account registered in your local SAMS database.</p>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {message && <p className="notice error">{message}</p>}
      <p className="small muted">Local demo: create an account using the backend register endpoint described in README.md.</p>
    </form>
  </main>;

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">SAMS</p><h1>Attendance</h1></div><div className="userbox"><span>{user.name} · {user.role}</span><button className="secondary" onClick={logout}>Sign out</button></div></header>
    <section className="panel">
      <h2>View attendance by class and date</h2>
      <p className="muted">Select a class and date to view or mark attendance for enrolled students.</p>
      <div className="filters">
        <label>Class<select value={classId} onChange={e => { setClassId(e.target.value); setRecords([]); }} required>
          <option value="">Select a class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.class_code} — {c.class_name}{c.section ? ` (${c.section})` : ''}</option>)}
        </select></label>
        <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
        <button onClick={loadAttendance} disabled={busy || !classId}>{busy ? 'Loading…' : 'View attendance'}</button>
      </div>
      {message && <p className="notice">{message}</p>}
      {records.length > 0 && <>
        <div className="table-wrap"><table><thead><tr>
  {user.role !== 'student' && <><th>Student ID</th><th>Student name</th></>}
  {user.role === 'student' && <th>Class</th>}
  <th>Status</th>
</tr></thead>
          <tbody>{records.map(r => <tr key={r.studentId}>
  {user.role !== 'student' && <>
    <td>{r.studentNumber}</td>
    <td>{r.studentName}</td>
  </>}
  {user.role === 'student' && <td>{r.classCode} — {r.className}</td>}
  <td>
            {user.role === 'teacher' || user.role === 'admin' ?
              <select value={r.status || ''} onChange={e => updateStatus(r.studentId, e.target.value)}><option value="">Choose status</option><option value="present">Present</option><option value="absent">Absent</option></select> :
              (r.status || 'Not recorded')}
          </td></tr>)}</tbody></table></div>
        {(user.role === 'teacher' || user.role === 'admin') && <button onClick={saveAttendance} disabled={busy} className="save">Save attendance</button>}
      </>}
      {!classes.length && <p className="notice">No classes are available for this account. Ask an administrator to create/assign a class and enrol students.</p>}
    </section>

    {user.role === 'admin' && (
      <AdminManagement token={token} />
    )}

    <footer> Sprint 1 starter · Please validate with your team's SRS and test plan.</footer>
  </main>;
}
