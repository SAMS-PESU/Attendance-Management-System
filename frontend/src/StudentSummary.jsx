import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function getJson(path, token, signal) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body;
}

export default function StudentSummary({ token }) {
  const [classes, setClasses] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [recordsByClass, setRecordsByClass] = useState({});
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    getJson('/attendance/mine/summary', token, controller.signal)
      .then(setClasses)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [token]);

  async function toggleRecords(classId) {
    if (openId === classId) {
      setOpenId(null);
      return;
    }
    setOpenId(classId);
    setRecordsError('');
    if (recordsByClass[classId]) return;

    setRecordsLoading(true);
    try {
      const data = await getJson(
        `/attendance/mine/records?classId=${encodeURIComponent(classId)}`,
        token
      );
      setRecordsByClass((old) => ({ ...old, [classId]: data.records }));
    } catch (err) {
      setRecordsError(err.message);
    } finally {
      setRecordsLoading(false);
    }
  }

  return (
    <section className="panel" aria-live="polite">
      <h2>My attendance</h2>
      <p className="muted">Your attendance percentage for each class you are enrolled in.</p>

      {error && <p className="notice error" role="alert">{error}</p>}
      {!classes && !error && <p className="muted">Loading your attendance…</p>}
      {classes && classes.length === 0 && (
        <p className="notice">You are not enrolled in any classes yet. Ask an administrator to enrol you.</p>
      )}

      {classes && classes.length > 0 && (
        <div className="summary-grid">
          {classes.map((c) => {
            const pct = Number(c.attendancePercentage) || 0;
            const isOpen = openId === c.classId;
            const records = recordsByClass[c.classId];
            return (
              <article className="summary-card" key={c.classId}>
                <h3>
                  {c.classCode} — {c.className}
                  {c.section ? ` (${c.section})` : ''}
                </h3>

                {c.totalClasses === 0 ? (
                  <p className="muted">No attendance sessions have been recorded yet.</p>
                ) : (
                  <>
                    <p className="summary-percent">{pct.toFixed(2)}%</p>
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={Math.round(pct)}
                      aria-label={`Attendance for ${c.classCode}`}
                    >
                      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                    <p className="muted">
                      Present in {c.attendedClasses} of {c.totalClasses} sessions
                    </p>
                  </>
                )}

                <button
                  type="button"
                  className="secondary"
                  aria-expanded={isOpen}
                  onClick={() => toggleRecords(c.classId)}
                >
                  {isOpen ? 'Hide records' : 'View records'}
                </button>

                {isOpen && (
                  <div className="summary-records">
                    {recordsLoading && !records && <p className="muted">Loading records…</p>}
                    {recordsError && <p className="notice error" role="alert">{recordsError}</p>}
                    {records && records.length === 0 && (
                      <p className="muted">No attendance has been recorded for you in this class yet.</p>
                    )}
                    {records && records.length > 0 && (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th>Date</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {records.map((r) => (
                              <tr key={r.attendanceDate}>
                                <td>{r.attendanceDate}</td>
                                <td>
                                  <span className={r.status === 'present' ? 'pill present' : 'pill absent'}>
                                    {r.status === 'present' ? 'Present' : 'Absent'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}