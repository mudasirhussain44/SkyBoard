// ================================================
// SkyBoard - Airline Reservation System - Backend
// Node.js + Express + PostgreSQL + JWT Auth
// ================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// !! POSTGRESQL CONNECTION SETTINGS !!
// Agar DATABASE_URL env variable mile (Render/Railway/Neon par deploy karte waqt)
// to wahi use hogi, warna local .env / defaults se connect hoga.
// ----------------------------------------------------
const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'airline_db',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 5432,
      });

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ PostgreSQL se connect nahi ho paya:', err.message);
    } else {
        console.log('✅ PostgreSQL se successfully connect ho gaya!');
        release();
    }
});

// ================== HELPERS ==================

function generatePNR() {
    return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Auth middleware — token required
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Login zaroori hai (token nahi mila)' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Session expire ho gaya, dobara login karein' });
    }
}

// Admin-only middleware
function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Sirf admin ye action kar sakta hai' });
    }
    next();
}

// ================== AUTH ROUTES ==================

// Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { full_name, email, password, admin_code } = req.body;
        if (!full_name || !email || !password) {
            return res.status(400).json({ error: 'Naam, email aur password zaroori hain' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password kam se kam 6 characters ka ho' });
        }

        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Is email se account pehle se maujood hai' });
        }

        const role = (admin_code && admin_code === ADMIN_SECRET) ? 'admin' : 'user';
        const password_hash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role)
             VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, role, created_at`,
            [full_name, email.toLowerCase(), password_hash, role]
        );

        const user = result.rows[0];
        const token = signToken(user);
        res.json({ token, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Signup fail ho gaya: ' + err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email aur password zaroori hain' });
        }

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Email ya password ghalat hai' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Email ya password ghalat hai' });

        const safeUser = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
        const token = signToken(safeUser);
        res.json({ token, user: safeUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Current user
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

// ================== FLIGHT ROUTES ==================

// 1. Sab flights get karo (search filters + sorting ke saath)
app.get('/api/flights', async (req, res) => {
    try {
        const { origin, destination, date, sort } = req.query;
        let query = 'SELECT * FROM flights WHERE 1=1';
        const params = [];

        if (origin) {
            params.push(`%${origin}%`);
            query += ` AND origin ILIKE $${params.length}`;
        }
        if (destination) {
            params.push(`%${destination}%`);
            query += ` AND destination ILIKE $${params.length}`;
        }
        if (date) {
            params.push(date);
            query += ` AND DATE(departure_time) = $${params.length}`;
        }

        if (sort === 'price_asc') query += ' ORDER BY price ASC';
        else if (sort === 'price_desc') query += ' ORDER BY price DESC';
        else query += ' ORDER BY departure_time ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Ek specific flight ki details
app.get('/api/flights/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM flights WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Flight not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2b. Seat map — is flight ki booked seats ki list (taake frontend grid disable kar sake)
app.get('/api/flights/:id/seats', async (req, res) => {
    try {
        const flightResult = await pool.query('SELECT total_seats FROM flights WHERE id = $1', [req.params.id]);
        if (flightResult.rows.length === 0) return res.status(404).json({ error: 'Flight not found' });

        const bookedResult = await pool.query(
            "SELECT seat_no FROM bookings WHERE flight_id = $1 AND status = 'confirmed'",
            [req.params.id]
        );
        res.json({
            total_seats: flightResult.rows[0].total_seats,
            booked_seats: bookedResult.rows.map(r => r.seat_no)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Nayi flight add karna (admin only)
app.post('/api/flights', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { flight_no, airline, origin, destination, departure_time, arrival_time, price, total_seats } = req.body;
        const result = await pool.query(
            `INSERT INTO flights (flight_no, airline, origin, destination, departure_time, arrival_time, price, total_seats, seats_available)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
            [flight_no, airline, origin, destination, departure_time, arrival_time, price, total_seats]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3b. Flight update karna — price/status/timing (admin only)
app.put('/api/flights/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { price, status, departure_time, arrival_time } = req.body;
        const result = await pool.query(
            `UPDATE flights SET
                price = COALESCE($1, price),
                status = COALESCE($2, status),
                departure_time = COALESCE($3, departure_time),
                arrival_time = COALESCE($4, arrival_time)
             WHERE id = $5 RETURNING *`,
            [price, status, departure_time, arrival_time, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Flight not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3c. Flight delete karna (admin only)
app.delete('/api/flights/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM flights WHERE id = $1', [req.params.id]);
        res.json({ message: 'Flight delete ho gayi' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================== BOOKING ROUTES ==================

// 4. Booking create karna (login required, seat map se seat select karke)
app.post('/api/bookings', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { flight_id, passenger_name, passenger_email, passenger_phone, seat_no } = req.body;
        if (!flight_id || !passenger_name || !passenger_email || !seat_no) {
            return res.status(400).json({ error: 'Zaroori fields missing hain' });
        }

        await client.query('BEGIN');

        const flightResult = await client.query('SELECT * FROM flights WHERE id = $1 FOR UPDATE', [flight_id]);
        const flight = flightResult.rows[0];

        if (!flight) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Flight nahi mili' });
        }
        if (flight.status === 'cancelled') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Ye flight cancel ho chuki hai' });
        }
        if (flight.seats_available <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Is flight mein seats available nahi hain' });
        }

        const seatTaken = await client.query(
            "SELECT id FROM bookings WHERE flight_id = $1 AND seat_no = $2 AND status = 'confirmed'",
            [flight_id, seat_no]
        );
        if (seatTaken.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Seat ${seat_no} pehle se book hai, doosri seat chunein` });
        }

        const pnr = generatePNR();

        const bookingResult = await client.query(
            `INSERT INTO bookings (pnr, flight_id, user_id, passenger_name, passenger_email, passenger_phone, seat_no)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [pnr, flight_id, req.user.id, passenger_name, passenger_email, passenger_phone, seat_no]
        );

        await client.query(
            'UPDATE flights SET seats_available = seats_available - 1 WHERE id = $1',
            [flight_id]
        );

        await client.query('COMMIT');
        res.json({ booking: bookingResult.rows[0], flight });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 5. Login user ki apni bookings
app.get('/api/bookings/my', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, f.flight_no, f.airline, f.origin, f.destination, f.departure_time, f.arrival_time, f.price, f.status AS flight_status
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
            WHERE b.user_id = $1
            ORDER BY b.booking_date DESC
        `, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5b. Sab bookings dekhna (admin only)
app.get('/api/bookings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, f.flight_no, f.airline, f.origin, f.destination, f.departure_time, f.arrival_time, f.price,
                   u.full_name AS booked_by
            FROM bookings b
            JOIN flights f ON b.flight_id = f.id
            LEFT JOIN users u ON b.user_id = u.id
            ORDER BY b.booking_date DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Booking cancel karna (sirf apni booking, ya admin kisi ki bhi)
app.delete('/api/bookings/:id', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        const booking = bookingResult.rows[0];

        if (!booking) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Booking nahi mili' });
        }
        if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Ye booking apki nahi hai' });
        }

        await client.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);
        await client.query('UPDATE flights SET seats_available = seats_available + 1 WHERE id = $1', [booking.flight_id]);

        await client.query('COMMIT');
        res.json({ message: 'Booking cancel ho gayi' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ================== ADMIN STATS ==================

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const flights = await pool.query('SELECT COUNT(*) FROM flights');
        const bookings = await pool.query("SELECT COUNT(*) FROM bookings WHERE status = 'confirmed'");
        const revenue = await pool.query(`
            SELECT COALESCE(SUM(f.price), 0) AS total
            FROM bookings b JOIN flights f ON b.flight_id = f.id
            WHERE b.status = 'confirmed'
        `);
        const users = await pool.query('SELECT COUNT(*) FROM users');
        const seatsLeft = await pool.query('SELECT COALESCE(SUM(seats_available),0) AS total FROM flights');

        res.json({
            total_flights: parseInt(flights.rows[0].count, 10),
            total_bookings: parseInt(bookings.rows[0].count, 10),
            total_revenue: parseFloat(revenue.rows[0].total),
            total_users: parseInt(users.rows[0].count, 10),
            seats_left: parseInt(seatsLeft.rows[0].total, 10)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server chal raha hai: http://localhost:${PORT}`);
});
