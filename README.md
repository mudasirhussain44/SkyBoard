# SkyBoard — Airline Reservation System (Node.js + PostgreSQL)

Ab is project mein ye naye features add ho chuke hain:

- **Login / Signup** — JWT-based authentication, password bcrypt se hash hoti hai
- **Seat map** — har flight ke liye visual seat grid, booked seats auto-disable
- **Boarding pass ticket** — booking ke baad print/PDF-ready boarding pass style ticket
- **My Bookings** — apni bookings dekhna aur cancel karna
- **Admin panel** — flights add/edit/delete karna, sab bookings dekhna, live stats (revenue, seats left, users)
- **Naya interface** — dark "departure board" theme, split-flap animation, fully dynamic (koi page reload nahi)

---

## Part 1 — Apne computer par local chalayein

### Step 1 — Node.js install karein
https://nodejs.org se LTS version install kar lein.

### Step 2 — PostgreSQL mein database banayein
```sql
CREATE DATABASE airline_db;
```
Phir `schema.sql` isi database ke andar run karein:
```bash
psql -U postgres -d airline_db -f schema.sql
```

### Step 3 — `.env` file banayein
`.env.example` ko copy karke naam `.env` rakh dein, phir apni values daal dein:
```bash
DB_USER=postgres
DB_HOST=localhost
DB_NAME=airline_db
DB_PASSWORD=YOUR_PASSWORD
DB_PORT=5432
JWT_SECRET=koi_lambi_random_string
ADMIN_SECRET=koi_secret_code
PORT=8080
```
`ADMIN_SECRET` wo code hai jo signup form mein "Admin code" field mein daal kar koi bhi user apna account **admin** bana sakta hai — ye sirf apne college project ke demo ke liye rakhein, production mein zyada secure tareeqa use karein.

### Step 4 — Dependencies install karein
```bash
npm install
```

### Step 5 — Server start karein
```bash
npm start
```
Browser mein kholein: `http://localhost:8080`

---

## Part 2 — Internet par free deploy karein (taake koi bhi link se access kar sake)

Ye project 2 cheezein maangta hai: (1) Node.js chalane ki jagah, (2) ek PostgreSQL database. Dono free mil sakte hain — bas do alag services use karni hongi kyunki free Node hosting mein database usually sath nahi milta:

| Kaam | Free service | Kyun |
|---|---|---|
| Node.js backend + frontend | **Render.com** (Free Web Service) | GitHub se seedha deploy, free HTTPS URL milta hai (`yourapp.onrender.com`) |
| PostgreSQL database | **Neon.tech** (Free Postgres) | Render ka free Postgres 90 din baad expire ho jata hai, Neon ka free tier expire nahi hota |

### Step A — Code GitHub par push karein
```bash
git init
git add .
git commit -m "SkyBoard with auth and admin panel"
git branch -M main
git remote add origin https://github.com/<your-username>/skyboard.git
git push -u origin main
```
(`.gitignore` mein `.env` aur `node_modules` already exclude hain, to password kabhi GitHub par nahi jayega.)

### Step B — Neon.tech par free database banayein
1. https://neon.tech par sign up karein (GitHub se login ho sakta hai)
2. "New Project" bana kar database ka naam rakhein
3. Neon apko ek **connection string** dega jo aisi dikhegi:
   `postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`
4. Neon ke apne "SQL Editor" mein `schema.sql` ka poora content paste karke run kar dein — tables ban jayengi

### Step C — Render.com par deploy karein
1. https://render.com par sign up karein aur GitHub account connect karein
2. "New +" → "Web Service" → apni repo select karein
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. "Environment" tab mein ye variables add karein:
   - `DATABASE_URL` → Neon wali connection string paste karein
   - `JWT_SECRET` → koi lambi random string
   - `ADMIN_SECRET` → apna admin signup code
   - `NODE_ENV` → `production`
5. "Create Web Service" dabayein — 2-3 minute mein deploy ho jayega

Render apko ek free URL dega jaisे:
```
https://skyboard-xxxx.onrender.com
```
Yehi link kisi ko bhi bhej dein — koi bhi browser mein khol kar sign up/login/booking kar sakta hai. (Free tier 15 minute inactivity ke baad "so" jata hai, agli request par 30-60 second mein wapas jaag jata hai — ye normal hai free hosting mein.)

### Custom free domain chahiye?
`onrender.com` wala link already ek free, public, searchable-nahi-lekin-shareable domain hai. Agar apna khud ka naam wala domain chahiye (jaise `skyboard.tech`), to **Freenom** (limited free TLDs) ya student ke liye **GitHub Student Developer Pack** (jisme Namecheap se 1 saal free `.me` domain milta hai) dekh sakte hain — phir Render ke "Custom Domain" setting mein us domain ko point kar dein.

---

## Project Structure
```
skyboard/
  server.js            → Express backend (auth, flights, bookings, admin)
  schema.sql            → Database tables (users, flights, bookings) + sample data
  package.json           → Dependencies
  .env.example            → Environment variables template
  public/
    index.html            → App shell (search, booking, admin, auth modal)
    style.css              → Departure-board themed design
    script.js                → Frontend logic (fetch calls, seat map, ticket render)
```

## Common Errors

- **"Login zaroori hai"** → booking ya admin route hit karne se pehle login karein, token expire ho gaya ho to dobara login karein
- **"Sirf admin ye action kar sakta hai"** → signup ke waqt Admin code field mein `.env` wala `ADMIN_SECRET` daalein
- **"ECONNREFUSED" ya "password authentication failed"** → `.env` mein DB credentials galat hain
- **"relation flights does not exist"** → `schema.sql` run nahi hui
- **Render par app "waking up" dikha raha hai** → free tier normal behavior hai, 30-60 second wait karein
