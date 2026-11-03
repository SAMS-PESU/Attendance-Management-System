
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';

import authRoutes from './routes/auth.js';
import classRoutes from './routes/classes.js';
import attendanceRoutes from './routes/attendance.js';
import attendanceMarkRoutes from './routes/attendanceMark.js';
import adminDashboardRoutes from './routes/adminDashboard.js';
import adminRoutes from './routes/admin.js';

// Load environment variables
dotenv.config();

// Validate JWT secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    console.error('JWT_SECRET must be set in .env and contain at least 24 characters.');
    process.exit(1);
}

// Initialize Express
const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
}));

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch {
        res.status(503).json({
            status: 'error',
            database: 'unavailable'
        });
    }
});

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/attendance', attendanceMarkRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api', adminRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
});

// Start server
const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
    console.log(`SAMS API listening on http://localhost:${port}`);
});
