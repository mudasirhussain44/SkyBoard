-- ================================================
-- SkyBoard Airline Reservation System - Database Schema
-- Run this once in PostgreSQL to create tables
-- ================================================

DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS flights;
DROP TABLE IF EXISTS users;

-- ---------- Users (login / signup) ----------
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',   -- 'user' or 'admin'
    created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- Flights ----------
CREATE TABLE flights (
    id SERIAL PRIMARY KEY,
    flight_no VARCHAR(10) NOT NULL,
    airline VARCHAR(50) NOT NULL,
    origin VARCHAR(50) NOT NULL,
    destination VARCHAR(50) NOT NULL,
    departure_time TIMESTAMP NOT NULL,
    arrival_time TIMESTAMP NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    total_seats INT NOT NULL DEFAULT 60,
    seats_available INT NOT NULL DEFAULT 60,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled'  -- scheduled / delayed / cancelled
);

-- ---------- Bookings ----------
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    pnr VARCHAR(10) UNIQUE NOT NULL,
    flight_id INT REFERENCES flights(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    passenger_name VARCHAR(100) NOT NULL,
    passenger_email VARCHAR(100) NOT NULL,
    passenger_phone VARCHAR(20),
    seat_no VARCHAR(10) NOT NULL,
    booking_date TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'confirmed',
    UNIQUE(flight_id, seat_no)   -- ek seat sirf ek hi waqt mein book ho sakti hai
);

CREATE INDEX idx_flights_route ON flights (origin, destination, departure_time);
CREATE INDEX idx_bookings_user ON bookings (user_id);

-- ---------- Sample flights (aap apni marzi se add/change kar sakte hain) ----------
INSERT INTO flights (flight_no, airline, origin, destination, departure_time, arrival_time, price, total_seats, seats_available)
VALUES
('PK-301', 'PIA', 'Karachi', 'Lahore', '2026-09-05 08:00:00', '2026-09-05 09:45:00', 12500, 36, 36),
('PK-402', 'PIA', 'Lahore', 'Islamabad', '2026-09-05 11:30:00', '2026-09-05 12:20:00', 8500, 24, 24),
('AA-115', 'Airblue', 'Karachi', 'Islamabad', '2026-09-06 06:15:00', '2026-09-06 08:30:00', 15000, 30, 30),
('SG-220', 'SereneAir', 'Islamabad', 'Karachi', '2026-09-06 14:00:00', '2026-09-06 16:10:00', 14200, 30, 30),
('AA-330', 'Airblue', 'Lahore', 'Karachi', '2026-09-07 09:00:00', '2026-09-07 10:50:00', 11800, 24, 24),
('FF-118', 'FlyJinnah', 'Karachi', 'Peshawar', '2026-09-08 07:30:00', '2026-09-08 09:50:00', 16500, 30, 30),
('PK-556', 'PIA', 'Multan', 'Karachi', '2026-09-08 18:00:00', '2026-09-08 19:40:00', 13200, 24, 24);

-- ---------- NOTE ----------
-- Signup ke waqt admin account banane ke liye .env mein ADMIN_SECRET set karein
-- aur signup form mein wahi code daal kar admin role mil jayega.
