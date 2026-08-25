// ================================================
// SkyBoard - Frontend logic (vanilla JS, no build step)
// ================================================

const API = '/api';
let state = {
  token: localStorage.getItem('sb_token') || null,
  user: JSON.parse(localStorage.getItem('sb_user') || 'null'),
  currentFlight: null,
  selectedSeat: null,
  lastBooking: null,
};

// ---------------- API helper ----------------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Kuch ghalat ho gaya');
  return data;
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 3200);
}

function money(n) {
  return 'Rs. ' + Number(n).toLocaleString('en-PK');
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------- Navigation ----------------
const views = ['home', 'booking', 'ticket', 'mybookings', 'admin'];
function navigate(name) {
  if ((name === 'mybookings') && !state.user) return openAuth('login');
  if (name === 'admin' && state.user?.role !== 'admin') return openAuth('login');

  views.forEach(v => {
    document.getElementById('view-' + v).hidden = v !== name;
  });
  document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'home') loadFlights();
  if (name === 'mybookings') loadMyBookings();
  if (name === 'admin') loadAdmin();
}
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.nav));
});

// ---------------- Auth UI ----------------
function refreshAuthUI() {
  const chip = document.getElementById('userChip');
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (state.user) {
    chip.hidden = false;
    chip.textContent = `${state.user.full_name.split(' ')[0]} · ${state.user.role.toUpperCase()}`;
    loginBtn.hidden = true;
    signupBtn.hidden = true;
    logoutBtn.hidden = false;
  } else {
    chip.hidden = true;
    loginBtn.hidden = false;
    signupBtn.hidden = false;
    logoutBtn.hidden = true;
  }
  document.querySelectorAll('[data-requires-admin]').forEach(el => {
    el.style.display = state.user?.role === 'admin' ? '' : 'none';
  });
}

function openAuth(pane) {
  document.getElementById('authModalBackdrop').hidden = false;
  document.getElementById('loginPane').hidden = pane !== 'login';
  document.getElementById('signupPane').hidden = pane !== 'signup';
}
function closeAuth() {
  document.getElementById('authModalBackdrop').hidden = true;
  document.getElementById('loginError').hidden = true;
  document.getElementById('signupError').hidden = true;
}
document.getElementById('loginBtn').onclick = () => openAuth('login');
document.getElementById('signupBtn').onclick = () => openAuth('signup');
document.getElementById('modalClose').onclick = closeAuth;
document.getElementById('authModalBackdrop').addEventListener('click', e => {
  if (e.target.id === 'authModalBackdrop') closeAuth();
});
document.getElementById('toSignup').onclick = e => { e.preventDefault(); openAuth('signup'); };
document.getElementById('toLogin').onclick = e => { e.preventDefault(); openAuth('login'); };

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('liEmail').value,
        password: document.getElementById('liPassword').value,
      }),
    });
    setSession(data);
    closeAuth();
    toast(`Welcome back, ${data.user.full_name.split(' ')[0]}!`);
    navigate('home');
  } catch (err) {
    errEl.textContent = err.message; errEl.hidden = false;
  }
});

document.getElementById('signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('signupError');
  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        full_name: document.getElementById('suName').value,
        email: document.getElementById('suEmail').value,
        password: document.getElementById('suPassword').value,
        admin_code: document.getElementById('suAdminCode').value,
      }),
    });
    setSession(data);
    closeAuth();
    toast(`Account created — welcome, ${data.user.full_name.split(' ')[0]}!`);
    navigate('home');
  } catch (err) {
    errEl.textContent = err.message; errEl.hidden = false;
  }
});

document.getElementById('logoutBtn').onclick = () => {
  state.token = null; state.user = null;
  localStorage.removeItem('sb_token'); localStorage.removeItem('sb_user');
  refreshAuthUI();
  toast('Logged out');
  navigate('home');
};

function setSession(data) {
  state.token = data.token; state.user = data.user;
  localStorage.setItem('sb_token', data.token);
  localStorage.setItem('sb_user', JSON.stringify(data.user));
  refreshAuthUI();
}

// mobile hamburger -> reuse nav links in a simple toggle
document.getElementById('hamburger').onclick = () => {
  const nav = document.querySelector('.nav-links');
  nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
  nav.style.cssText += 'position:absolute; top:100%; left:0; right:0; background:var(--panel); flex-direction:column; padding:1em; border-bottom:1px solid var(--border);';
};

// ---------------- Split-flap departure board (hero) ----------------
async function renderFlapBoard() {
  const box = document.getElementById('flapBoard');
  try {
    const flights = await api('/flights');
    box.innerHTML = '';
    flights.slice(0, 6).forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'board-row';
      const statusClass = 'status-' + f.status;
      row.innerHTML = `
        <span class="flap">${flapify(f.flight_no)}</span>
        <span class="route-cell">${f.origin.toUpperCase()} → ${f.destination.toUpperCase()}</span>
        <span class="route-cell">${fmtTime(f.departure_time)}</span>
        <span class="route-cell">${String(10 + i).padStart(2, '0')}</span>
        <span class="status-pill ${statusClass}">${f.status}</span>
      `;
      row.style.animationDelay = (i * 60) + 'ms';
      box.appendChild(row);
    });
    if (!flights.length) box.innerHTML = '<div class="board-row"><span class="muted">No flights scheduled right now</span></div>';
  } catch (err) {
    box.innerHTML = '<div class="board-row"><span class="muted">Board offline — check your connection</span></div>';
  }
}
function flapify(text) {
  return [...text].map((c, i) => `<span class="flap-char" style="animation-delay:${i * 40}ms">${c}</span>`).join('');
}

// ---------------- Search + results ----------------
document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  loadFlights();
});
document.getElementById('swapBtn').onclick = () => {
  const o = document.getElementById('fOrigin'), d = document.getElementById('fDestination');
  [o.value, d.value] = [d.value, o.value];
};

async function loadFlights() {
  const origin = document.getElementById('fOrigin').value.trim();
  const destination = document.getElementById('fDestination').value.trim();
  const date = document.getElementById('fDate').value;
  const sort = document.getElementById('fSort').value;
  const params = new URLSearchParams();
  if (origin) params.set('origin', origin);
  if (destination) params.set('destination', destination);
  if (date) params.set('date', date);
  if (sort && sort !== 'time') params.set('sort', sort);

  const list = document.getElementById('flightResults');
  list.innerHTML = '<p class="muted">Loading flights…</p>';
  try {
    const flights = await api('/flights?' + params.toString());
    document.getElementById('resultsCount').textContent = flights.length + (flights.length === 1 ? ' flight' : ' flights');
    if (!flights.length) {
      list.innerHTML = '<div class="empty-state">No flights match that search. Try a different route or date.</div>';
      return;
    }
    list.innerHTML = '';
    flights.forEach(f => list.appendChild(flightCard(f)));
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
  renderFlapBoard();
}

function flightCard(f) {
  const el = document.createElement('div');
  el.className = 'flight-card';
  const disabled = f.status === 'cancelled' || f.seats_available <= 0;
  el.innerHTML = `
    <div>
      <div class="fc-code">${f.flight_no}</div>
      <div class="fc-airline">${f.airline}</div>
    </div>
    <div class="fc-route">
      <div><div class="fc-city">${f.origin}</div><div class="fc-time">${fmtTime(f.departure_time)} · ${fmtDate(f.departure_time)}</div></div>
      <span class="fc-arrow">✈ →</span>
      <div><div class="fc-city">${f.destination}</div><div class="fc-time">${fmtTime(f.arrival_time)}</div></div>
    </div>
    <div class="status-pill status-${f.status}">${f.status}</div>
    <div class="fc-price">${money(f.price)}</div>
    <div>
      <div class="fc-seats">${f.seats_available} seats left</div>
      <button class="btn btn-solid" ${disabled ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>${disabled ? 'Unavailable' : 'Select seat'}</button>
    </div>
  `;
  if (!disabled) {
    el.querySelector('button').onclick = () => openBooking(f);
  }
  return el;
}

// ---------------- Booking / seat map ----------------
async function openBooking(flight) {
  if (!state.user) { openAuth('login'); toast('Please log in to book a seat'); return; }
  state.currentFlight = flight;
  state.selectedSeat = null;
  document.getElementById('bookingFlightTitle').textContent = `${flight.flight_no} · ${flight.origin} → ${flight.destination}`;
  document.getElementById('bookingFlightSub').textContent = `${fmtDate(flight.departure_time)} · Departs ${fmtTime(flight.departure_time)} · ${money(flight.price)} per seat`;
  document.getElementById('pPrice').textContent = money(flight.price);
  document.getElementById('pSeat').value = '';
  if (state.user) {
    document.getElementById('pName').value = state.user.full_name;
    document.getElementById('pEmail').value = state.user.email;
  }
  document.getElementById('bookingError').hidden = true;
  navigate('booking');

  const grid = document.getElementById('seatGrid');
  grid.innerHTML = '<p class="muted">Loading seat map…</p>';
  try {
    const data = await api(`/flights/${flight.id}/seats`);
    grid.innerHTML = '';
    const cols = 6;
    for (let i = 0; i < data.total_seats; i++) {
      const row = String.fromCharCode(65 + Math.floor(i / cols));
      const seatNo = row + ((i % cols) + 1);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seat-btn';
      btn.textContent = seatNo;
      const taken = data.booked_seats.includes(seatNo);
      btn.disabled = taken;
      btn.onclick = () => selectSeat(seatNo, btn);
      grid.appendChild(btn);
    }
  } catch (err) {
    grid.innerHTML = `<p class="muted">${err.message}</p>`;
  }
}

function selectSeat(seatNo, btn) {
  document.querySelectorAll('.seat-btn.selected').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selectedSeat = seatNo;
  document.getElementById('pSeat').value = seatNo;
}

document.getElementById('bookingForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('bookingError');
  errEl.hidden = true;
  if (!state.selectedSeat) {
    errEl.textContent = 'Pehle seat map se ek seat select karein';
    errEl.hidden = false;
    return;
  }
  try {
    const data = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        flight_id: state.currentFlight.id,
        passenger_name: document.getElementById('pName').value,
        passenger_email: document.getElementById('pEmail').value,
        passenger_phone: document.getElementById('pPhone').value,
        seat_no: state.selectedSeat,
      }),
    });
    state.lastBooking = { ...data.booking, flight: data.flight };
    renderTicket(state.lastBooking);
    navigate('ticket');
    toast('Booking confirmed — here is your boarding pass');
  } catch (err) {
    errEl.textContent = err.message; errEl.hidden = false;
  }
});

// ---------------- Boarding pass ticket ----------------
function renderTicket(b) {
  const f = b.flight;
  document.getElementById('boardingPass').innerHTML = `
    <div class="bp-main">
      <div class="bp-eyebrow">SkyBoard · Boarding Pass</div>
      <div class="bp-route">
        <span class="bp-city">${f.origin}</span>
        <span class="bp-plane">✈</span>
        <span class="bp-city">${f.destination}</span>
      </div>
      <div class="bp-grid">
        <div class="bp-field"><div class="bp-label">Passenger</div><div class="bp-value">${b.passenger_name}</div></div>
        <div class="bp-field"><div class="bp-label">Flight</div><div class="bp-value">${f.flight_no}</div></div>
        <div class="bp-field"><div class="bp-label">Airline</div><div class="bp-value">${f.airline}</div></div>
        <div class="bp-field"><div class="bp-label">Date</div><div class="bp-value">${fmtDate(f.departure_time)}</div></div>
        <div class="bp-field"><div class="bp-label">Departs</div><div class="bp-value">${fmtTime(f.departure_time)}</div></div>
        <div class="bp-field"><div class="bp-label">Arrives</div><div class="bp-value">${fmtTime(f.arrival_time)}</div></div>
      </div>
      <div class="bp-barcode"></div>
    </div>
    <div class="bp-stub">
      <div>
        <div class="bp-eyebrow">Seat</div>
        <div class="bp-seat-badge">${b.seat_no}</div>
      </div>
      <div>
        <div class="bp-label">PNR</div>
        <div class="bp-pnr">${b.pnr}</div>
      </div>
    </div>
  `;
}

// ---------------- My bookings ----------------
async function loadMyBookings() {
  const list = document.getElementById('myBookingsList');
  list.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const bookings = await api('/bookings/my');
    if (!bookings.length) {
      list.innerHTML = '<div class="empty-state">No bookings yet — search a flight and pick a seat.</div>';
      return;
    }
    list.innerHTML = '';
    bookings.forEach(b => {
      const el = document.createElement('div');
      el.className = 'booking-card';
      el.innerHTML = `
        <div class="bc-pnr">${b.pnr}</div>
        <div>
          <strong>${b.flight_no}</strong> · ${b.origin} → ${b.destination}
          <div class="muted" style="font-size:.8rem;">${fmtDate(b.departure_time)} · Seat ${b.seat_no}</div>
        </div>
        <div>${money(b.price)}</div>
        <div style="display:flex; gap:.5em;">
          <button class="btn btn-ghost" data-act="view">View pass</button>
          <button class="icon-btn" data-act="cancel">Cancel</button>
        </div>
      `;
      el.querySelector('[data-act=view]').onclick = () => {
        renderTicket({ ...b, flight: b });
        navigate('ticket');
      };
      el.querySelector('[data-act=cancel]').onclick = async () => {
        if (!confirm(`Cancel booking ${b.pnr}?`)) return;
        try {
          await api(`/bookings/${b.id}`, { method: 'DELETE' });
          toast('Booking cancelled');
          loadMyBookings();
        } catch (err) { toast(err.message, true); }
      };
      list.appendChild(el);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

// ---------------- Admin ----------------
async function loadAdmin() {
  await Promise.all([loadStats(), loadAdminFlights(), loadAdminBookings()]);
}
document.getElementById('refreshBookingsBtn').addEventListener('click', () => {
  loadAdminBookings();
  loadStats();
  toast('Bookings refreshed');
});

async function loadStats() {
  const grid = document.getElementById('statGrid');
  try {
    const s = await api('/admin/stats');
    grid.innerHTML = `
      ${statCard(s.total_flights, 'Flights')}
      ${statCard(s.total_bookings, 'Active bookings')}
      ${statCard(s.total_users, 'Users')}
      ${statCard(s.seats_left, 'Seats left')}
      ${statCard(money(s.total_revenue), 'Revenue')}
    `;
  } catch (err) { grid.innerHTML = `<p class="muted">${err.message}</p>`; }
}
function statCard(value, label) {
  return `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

document.getElementById('addFlightForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('addFlightMsg');
  try {
    await api('/flights', {
      method: 'POST',
      body: JSON.stringify({
        flight_no: document.getElementById('afFlightNo').value,
        airline: document.getElementById('afAirline').value,
        origin: document.getElementById('afOrigin').value,
        destination: document.getElementById('afDestination').value,
        departure_time: document.getElementById('afDeparture').value,
        arrival_time: document.getElementById('afArrival').value,
        price: document.getElementById('afPrice').value,
        total_seats: document.getElementById('afSeats').value,
      }),
    });
    msg.textContent = 'Flight added ✓'; msg.hidden = false;
    e.target.reset();
    loadAdminFlights(); loadStats();
    toast('Flight added to the board');
  } catch (err) {
    msg.textContent = err.message; msg.hidden = false;
  }
});

async function loadAdminFlights() {
  const box = document.getElementById('adminFlightList');
  try {
    const flights = await api('/flights');
    box.innerHTML = '';
    flights.forEach(f => {
      const row = document.createElement('div');
      row.className = 'admin-flight-row';
      row.innerHTML = `
        <span>${f.flight_no} · ${f.origin}→${f.destination} · ${money(f.price)}</span>
        <span style="display:flex; gap:.5em; align-items:center;">
          <select data-id="${f.id}">
            <option value="scheduled" ${f.status === 'scheduled' ? 'selected' : ''}>scheduled</option>
            <option value="delayed" ${f.status === 'delayed' ? 'selected' : ''}>delayed</option>
            <option value="cancelled" ${f.status === 'cancelled' ? 'selected' : ''}>cancelled</option>
          </select>
          <button class="icon-btn">Delete</button>
        </span>
      `;
      row.querySelector('select').onchange = async (e) => {
        try {
          await api(`/flights/${f.id}`, { method: 'PUT', body: JSON.stringify({ status: e.target.value }) });
          toast(`${f.flight_no} marked ${e.target.value}`);
          renderFlapBoard();
        } catch (err) { toast(err.message, true); }
      };
      row.querySelector('.icon-btn').onclick = async () => {
        if (!confirm(`Delete flight ${f.flight_no}?`)) return;
        try {
          await api(`/flights/${f.id}`, { method: 'DELETE' });
          toast('Flight deleted');
          loadAdminFlights(); loadStats();
        } catch (err) { toast(err.message, true); }
      };
      box.appendChild(row);
    });
  } catch (err) { box.innerHTML = `<p class="muted">${err.message}</p>`; }
}

async function loadAdminBookings() {
  const tbody = document.querySelector('#adminBookingsTable tbody');
  try {
    const bookings = await api('/bookings');
    tbody.innerHTML = '';
    bookings.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="bc-pnr">${b.pnr}</td>
        <td>${b.passenger_name}</td>
        <td>${b.passenger_email}</td>
        <td>${b.passenger_phone || '—'}</td>
        <td>${b.flight_no}</td>
        <td>${b.origin} → ${b.destination}</td>
        <td>${b.seat_no}</td>
        <td>${b.booked_by || '—'}</td>
        <td>${fmtDate(b.booking_date)}</td>
        <td><button class="icon-btn">Cancel</button></td>
      `;
      tr.querySelector('.icon-btn').onclick = async () => {
        if (!confirm(`Cancel booking ${b.pnr}?`)) return;
        try {
          await api(`/bookings/${b.id}`, { method: 'DELETE' });
          toast('Booking cancelled');
          loadAdminBookings(); loadStats();
        } catch (err) { toast(err.message, true); }
      };
      tbody.appendChild(tr);
    });
  } catch (err) { tbody.innerHTML = `<tr><td colspan="10" class="muted">${err.message}</td></tr>`; }
}

// ---------------- Init ----------------
refreshAuthUI();
navigate('home');
