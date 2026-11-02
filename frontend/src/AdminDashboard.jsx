
import { useCallback, useEffect, useState } from 'react';
import './admin-dashboard.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminDashboard({ token }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (signal) => {
        if (!token) {
            setError('Authentication token is missing.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API}/admin/dashboard`, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                signal
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Unable to load dashboard');
            }

            setData(result);
        } catch (err) {
            if (!signal?.aborted) {
                setError(err.message);
            }
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, [token]);

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);

        return () => controller.abort();
    }, [load]);

    return (
        <section className="panel admin-dashboard">
            <div className="admin-dashboard-heading">
                <div>
                    <h2>Administrator Dashboard</h2>
                    <p>System overview and today's attendance.</p>
                </div>

                <button
                    type="button"
                    className="secondary"
                    onClick={() => load()}
                    disabled={loading}
                >
                    {loading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {error && <p className="notice error">{error}</p>}

            {loading && !data && <p>Loading dashboard...</p>}

            {data && (
                <>
                    <div className="stat-grid">
                        <Stat label="Classes" value={data.totals.classes} />
                        <Stat label="Teachers" value={data.totals.teachers} />
                        <Stat label="Students" value={data.totals.students} />
                        <Stat label="Present Today" value={data.today.present} />
                        <Stat label="Absent Today" value={data.today.absent} />
                        <Stat
                            label="Attendance"
                            value={`${data.today.percentage}%`}
                        />
                    </div>

                    <h3>Class Overview</h3>

                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Class</th>
                                    <th>Students</th>
                                    <th>Teachers</th>
                                </tr>
                            </thead>

                            <tbody>
                                {data.classes.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.class_code}</td>
                                        <td>{item.students}</td>
                                        <td>{item.teachers}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}

function Stat({ label, value }) {
    return (
        <div className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
        </div>
    );
}
