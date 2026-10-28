import { useEffect, useState } from 'react';
import './admin-management.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminManagement({ token }) {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [classForm, setClassForm] = useState({ class_code: '', class_name: '', section: '' });
  const [studentForm, setStudentForm] = useState({
  student_number: '',
  full_name: '',
  email: '',
  password: ''
  });
  const [teacherForm, setTeacherForm] = useState({
  employee_number: '',
  full_name: '',
  email: '',
  password: ''
  });
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
    return body;
  }

  async function refresh() {
    const [c, s, t] = await Promise.all([
      api('/classes'), api('/students'), api('/teachers')
    ]);
    setClasses(c); setStudents(s); setTeachers(t);
    if (!classId && c.length) setClassId(String(c[0].id));
    if (!studentId && s.length) setStudentId(String(s[0].id));
    if (!teacherId && t.length) setTeacherId(String(t[0].id));
  }

  useEffect(() => { refresh().catch(err => setMessage(err.message)); }, [token]);

  async function submit(path, body, reset) {
    setBusy(true); setMessage('');
    try {
      const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
      setMessage(result.message || 'Saved successfully.');
      reset?.();
      await refresh();
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }

  if (!token) return null;

  return <section className="admin-panel">
    <div className="admin-heading">
      <div><p className="admin-eyebrow">ADMIN TOOLS · SPRINT 1</p><h2>Class and people management</h2></div>
      <button className="admin-secondary" onClick={() => refresh().catch(e => setMessage(e.message))}>Refresh lists</button>
    </div>
    <p className="admin-muted">Create classes, student/teacher records, assign teachers, and enrol students. This section is visible only to admin users.</p>
    {message && <p className="admin-message" role="status">{message}</p>}
    <div className="admin-grid">
      <form className="admin-card" onSubmit={e => { e.preventDefault(); submit('/classes', classForm, () => setClassForm({ class_code:'', class_name:'', section:'' })); }}>
        <h3>Create class</h3>
        <label>Class code<input required value={classForm.class_code} onChange={e=>setClassForm({...classForm,class_code:e.target.value})} placeholder="CSE-C" /></label>
        <label>Class name<input required value={classForm.class_name} onChange={e=>setClassForm({...classForm,class_name:e.target.value})} placeholder="Computer Science" /></label>
        <label>Section<input value={classForm.section} onChange={e=>setClassForm({...classForm,section:e.target.value})} placeholder="C" /></label>
        <button disabled={busy}>Create class</button>
      </form>
      
<form
  className="admin-card"
  onSubmit={e => {
    e.preventDefault();
    submit('/students/with-account', studentForm, () =>
      setStudentForm({
        student_number: '',
        full_name: '',
        email: '',
        password: ''
      })
    );
  }}
>
  <h3>Create student account</h3>

  <label>
    Student number
    <input
      required
      value={studentForm.student_number}
      onChange={e => setStudentForm({
        ...studentForm,
        student_number: e.target.value
      })}
      placeholder="STU003"
    />
  </label>

  <label>
    Full name
    <input
      required
      value={studentForm.full_name}
      onChange={e => setStudentForm({
        ...studentForm,
        full_name: e.target.value
      })}
      placeholder="Student name"
    />
  </label>

  <label>
    Email
    <input
      required
      type="email"
      value={studentForm.email}
      onChange={e => setStudentForm({
        ...studentForm,
        email: e.target.value
      })}
      placeholder="student@example.com"
    />
  </label>

  <label>
    Temporary password
    <input
      required
      type="password"
      minLength={10}
      autoComplete="new-password"
      value={studentForm.password}
      onChange={e => setStudentForm({
        ...studentForm,
        password: e.target.value
      })}
      placeholder="At least 10 characters"
    />
  </label>

  <button disabled={busy}>Create student account</button>
</form>
      
<form
  className="admin-card"
  onSubmit={e => {
    e.preventDefault();
    submit('/teachers/with-account', teacherForm, () =>
      setTeacherForm({
        employee_number: '',
        full_name: '',
        email: '',
        password: ''
      })
    );
  }}
>
  <h3>Create teacher account</h3>

  <label>
    Employee number
    <input
      required
      value={teacherForm.employee_number}
      onChange={e => setTeacherForm({
        ...teacherForm,
        employee_number: e.target.value
      })}
      placeholder="TCH001"
    />
  </label>

  <label>
    Full name
    <input
      required
      value={teacherForm.full_name}
      onChange={e => setTeacherForm({
        ...teacherForm,
        full_name: e.target.value
      })}
      placeholder="Teacher name"
    />
  </label>

  <label>
    Email
    <input
      required
      type="email"
      value={teacherForm.email}
      onChange={e => setTeacherForm({
        ...teacherForm,
        email: e.target.value
      })}
      placeholder="teacher@example.com"
    />
  </label>

  <label>
    Temporary password
    <input
      required
      type="password"
      minLength={10}
      autoComplete="new-password"
      value={teacherForm.password}
      onChange={e => setTeacherForm({
        ...teacherForm,
        password: e.target.value
      })}
      placeholder="At least 10 characters"
    />
  </label>

  <button disabled={busy}>Create teacher account</button>
</form>

      <form className="admin-card" onSubmit={e => { e.preventDefault(); submit(`/classes/${classId}/teachers/${teacherId}`, {}, null); }}>
        <h3>Assign teacher to class</h3>
        <label>Class<select required value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.class_code} — {c.class_name}</option>)}</select></label>
        <label>Teacher<select required value={teacherId} onChange={e=>setTeacherId(e.target.value)}><option value="">Select teacher</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.employee_number} — {t.full_name}</option>)}</select></label>
        <button disabled={busy || !classId || !teacherId}>Assign teacher</button>
      </form>
      <form className="admin-card" onSubmit={e => { e.preventDefault(); submit(`/classes/${classId}/students/${studentId}`, {}, null); }}>
        <h3>Enrol student in class</h3>
        <label>Class<select required value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.class_code} — {c.class_name}</option>)}</select></label>
        <label>Student<select required value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Select student</option>{students.map(s=><option key={s.id} value={s.id}>{s.student_number} — {s.full_name}</option>)}</select></label>
        <button disabled={busy || !classId || !studentId}>Enrol student</button>
      </form>
    </div>
    <div className="admin-lists">
      <div><h3>Classes ({classes.length})</h3><ul>{classes.map(c=><li key={c.id}>{c.class_code} — {c.class_name} {c.section ? `(${c.section})` : ''} <small>ID: {c.id}</small></li>)}</ul></div>
      <div><h3>Students ({students.length})</h3><ul>{students.map(s=><li key={s.id}>{s.student_number} — {s.full_name} <small>ID: {s.id}</small></li>)}</ul></div>
      <div><h3>Teachers ({teachers.length})</h3><ul>{teachers.map(t=><li key={t.id}>{t.employee_number} — {t.full_name} <small>ID: {t.id}</small></li>)}</ul></div>
    </div>
  </section>;
}
