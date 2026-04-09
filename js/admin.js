// ============================================================
//  Admin Dashboard — js/admin.js
// ============================================================
const API = '';   // same origin

// ── Token ─────────────────────────────────────────────────
const token = {
  get:     ()  => localStorage.getItem('admin_token'),
  set:     (t) => localStorage.setItem('admin_token', t),
  clear:   ()  => localStorage.removeItem('admin_token'),
  headers: ()  => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token.get()}` }),
};

// ── API helpers ────────────────────────────────────────────
async function api(method, path, body) {
  const res  = await fetch(`${API}/api/admin${path}`, {
    method,
    headers: token.headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiFetch(method, path, body) {
  const res  = await fetch(`${API}/api/admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token.get() ? { Authorization: `Bearer ${token.get()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── State ──────────────────────────────────────────────────
let allUsers = [];
let currentView = 'overview';

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (token.get()) {
    showDashboard();
  } else {
    showLogin();
  }

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });
  document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  document.getElementById('user-search').addEventListener('input', renderUsersTable);
  document.getElementById('user-filter').addEventListener('change', renderUsersTable);
});

// ── Banner ─────────────────────────────────────────────────
function showBanner(msg, type = 'error') {
  let banner = document.getElementById('dash-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'dash-banner';
    banner.style.cssText = `
      padding:12px 20px; font-size:13px; font-weight:600; display:flex;
      align-items:center; justify-content:space-between; gap:12px;
    `;
    const topBar = document.querySelector('.top-bar');
    topBar.insertAdjacentElement('afterend', banner);
  }
  const colors = { error: '#fef2f2;color:#991b1b;border-bottom:1px solid #fecaca', warning: '#fffbeb;color:#92400e;border-bottom:1px solid #fde68a', success: '#f0fdf4;color:#065f46;border-bottom:1px solid #a7f3d0' };
  banner.style.background = colors[type] || colors.error;
  banner.innerHTML = `<span>⚠️ ${msg}</span><button onclick="document.getElementById('dash-banner').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:inherit;line-height:1">&times;</button>`;
}

function clearBanner() {
  document.getElementById('dash-banner')?.remove();
}

// ── Login ──────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const data = await apiFetch('POST', '/login', { email, password });
    token.set(data.token);
    document.getElementById('admin-name-display').textContent  = data.admin.name;
    document.getElementById('admin-email-display').textContent = data.admin.email;
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

function handleLogout() {
  token.clear();
  allUsers = [];
  clearBanner();
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('dashboard').hidden    = true;
}

async function showDashboard() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('dashboard').hidden    = false;
  await Promise.all([loadStats(), loadUsers()]);
  if (currentView === 'overview') renderRecentUsers();
  if (currentView === 'users')    renderUsersTable();
}

// ── View switching ─────────────────────────────────────────
const viewTitles = {
  overview: ['Overview', 'Platform statistics'],
  users:    ['Users',    'Manage all user accounts'],
  coupons:  ['Coupons',  'Manage discount & trial coupons'],
};

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.getElementById('view-overview').hidden = view !== 'overview';
  document.getElementById('view-users').hidden    = view !== 'users';
  document.getElementById('view-coupons').hidden  = view !== 'coupons';
  const [title, sub] = viewTitles[view] || ['', ''];
  document.getElementById('view-title').textContent    = title;
  document.getElementById('view-subtitle').textContent = sub;
  if (view === 'users')    renderUsersTable();
  if (view === 'overview') renderRecentUsers();
  if (view === 'coupons')  loadCoupons();
}

// ── Stats ──────────────────────────────────────────────────
async function loadStats() {
  // Show loading placeholders
  ['stat-total','stat-subscribed','stat-credits','stat-disabled','stat-lessons','stat-learners'].forEach(id => {
    document.getElementById(id).textContent = '…';
  });
  try {
    const s = await api('GET', '/stats');
    document.getElementById('stat-total').textContent      = Number(s.total_users).toLocaleString();
    document.getElementById('stat-subscribed').textContent = Number(s.subscribed_users).toLocaleString();
    document.getElementById('stat-credits').textContent    = Number(s.total_credits).toLocaleString();
    document.getElementById('stat-disabled').textContent   = Number(s.disabled_users).toLocaleString();
    document.getElementById('stat-lessons').textContent    = Number(s.total_lessons_completed).toLocaleString();
    document.getElementById('stat-learners').textContent   = Number(s.active_learners).toLocaleString();
    clearBanner();
  } catch (err) {
    ['stat-total','stat-subscribed','stat-credits','stat-disabled','stat-lessons','stat-learners'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    showBanner(`Could not load stats: ${err.message}. Check that DATABASE_URL is set correctly in Render.`);
  }
}

// ── Users ──────────────────────────────────────────────────
async function loadUsers() {
  try {
    const data = await api('GET', '/users');
    allUsers = data.users;
    clearBanner();
  } catch (err) {
    allUsers = [];
    showBanner(`Could not load users: ${err.message}. Check that DATABASE_URL is set correctly in Render.`);
  }
}

function getFilteredUsers() {
  const q      = document.getElementById('user-search').value.toLowerCase();
  const filter = document.getElementById('user-filter').value;
  return allUsers.filter(u => {
    if (u.is_admin) return false;
    if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    if (filter === 'subscribed' && !u.subscription) return false;
    if (filter === 'disabled'   && !u.disabled)     return false;
    if (filter === 'active'     && u.disabled)       return false;
    return true;
  });
}

function renderUsersTable() {
  const users = getFilteredUsers();
  document.getElementById('users-count').textContent = `(${users.length})`;
  const body = document.getElementById('users-body');
  if (!users.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-msg">${allUsers.length ? 'No users match your filter.' : 'No users found — database may still be connecting.'}</td></tr>`;
    return;
  }
  body.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-name">${esc(u.name)}</div>
        <div class="user-email">${esc(u.email)}</div>
      </td>
      <td>${u.credits}</td>
      <td>${subscriptionBadge(u.subscription)}</td>
      <td class="prog-cell">${progressCell(u)}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${u.last_login ? fmtDate(u.last_login) : '<span style="color:var(--gray-400)">Never</span>'}</td>
      <td>${u.disabled ? '<span class="badge badge-red">Disabled</span>' : '<span class="badge badge-green">Active</span>'}</td>
      <td>
        <div class="actions">
          <button class="btn-icon primary"  onclick="openUserModal(${u.id})">Details</button>
          <button class="btn-icon warning"  onclick="resetPassword(${u.id}, '${esc(u.email)}')">Reset PW</button>
          ${u.disabled
            ? `<button class="btn-icon success" onclick="toggleDisable(${u.id}, false)">Enable</button>`
            : `<button class="btn-icon"         onclick="toggleDisable(${u.id}, true)">Disable</button>`}
          <button class="btn-icon danger" onclick="deleteUser(${u.id}, '${esc(u.name)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderRecentUsers() {
  const recent = [...allUsers].filter(u => !u.is_admin).slice(0, 8);
  const body   = document.getElementById('recent-users-body');
  if (!recent.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty-msg">${allUsers.length === 0 ? 'Could not load users — check database connection.' : 'No users yet.'}</td></tr>`;
    return;
  }
  body.innerHTML = recent.map(u => `
    <tr>
      <td>
        <div class="user-name">${esc(u.name)}</div>
        <div class="user-email">${esc(u.email)}</div>
      </td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${u.disabled ? '<span class="badge badge-red">Disabled</span>' : '<span class="badge badge-green">Active</span>'}</td>
      <td>${subscriptionBadge(u.subscription)}</td>
    </tr>
  `).join('');
}

// ── User modal ─────────────────────────────────────────────
async function openUserModal(id) {
  switchTab('info');
  document.getElementById('modal-title').textContent = 'Loading…';
  document.getElementById('modal-overlay').classList.add('open');
  try {
    const { user, progress, transactions } = await api('GET', `/users/${id}`);
    document.getElementById('modal-title').textContent = user.name;

    let sub = null;
    try { sub = user.subscription ? JSON.parse(user.subscription) : null; } catch {}

    document.getElementById('user-info-grid').innerHTML = `
      <div class="info-item"><label>Full Name</label><div class="value">${esc(user.name)}</div></div>
      <div class="info-item"><label>Email</label><div class="value">${esc(user.email)}</div></div>
      <div class="info-item"><label>Joined</label><div class="value">${fmtDateFull(user.created_at)}</div></div>
      <div class="info-item"><label>Last Login</label><div class="value">${user.last_login ? fmtDateFull(user.last_login) : 'Never'}</div></div>
      <div class="info-item"><label>Status</label><div class="value">${user.disabled ? '<span class="badge badge-red">Disabled</span>' : '<span class="badge badge-green">Active</span>'}</div></div>
      <div class="info-item"><label>Credits</label><div class="value">${user.credits}</div></div>
      <div class="info-item"><label>Subscription</label><div class="value">${subscriptionBadge(user.subscription)}</div></div>
      ${sub ? `<div class="info-item"><label>Sub Expires</label><div class="value">${fmtDateFull(sub.expiresAt)}</div></div>` : ''}
    `;

    document.getElementById('modal-actions').innerHTML = `
      <button class="btn-icon warning" onclick="resetPassword(${user.id}, '${esc(user.email)}')">Send Password Reset</button>
      ${user.disabled
        ? `<button class="btn-icon success" onclick="toggleDisable(${user.id}, false, true)">Enable Account</button>`
        : `<button class="btn-icon"         onclick="toggleDisable(${user.id}, true,  true)">Disable Account</button>`}
      <button class="btn-icon danger" onclick="deleteUser(${user.id}, '${esc(user.name)}', true)">Delete User</button>
    `;

    renderProgressTab(progress);

    const txBody = document.getElementById('tx-body');
    txBody.innerHTML = transactions.length
      ? transactions.map(t => `
          <tr>
            <td>${fmtDate(t.created_at)}</td>
            <td><span class="badge ${t.type === 'credit' ? 'badge-green' : 'badge-red'}">${t.type}</span></td>
            <td class="${t.type === 'credit' ? 'tx-credit' : 'tx-debit'}">${t.type === 'credit' ? '+' : '-'}${t.amount}</td>
            <td>${esc(t.note || '')}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" class="empty-msg">No transactions</td></tr>`;

  } catch (err) {
    document.getElementById('modal-title').textContent = 'Error';
    document.getElementById('user-info-grid').innerHTML = `<div style="color:var(--danger);padding:8px">${err.message}</div>`;
  }
}

function renderProgressTab(progress) {
  const el = document.getElementById('progress-content');
  if (!progress.length) {
    el.innerHTML = '<div class="empty-msg">No course progress recorded yet.</div>';
    return;
  }

  const NLP_MODULES = { 'Week 01':2,'Week 02':2,'Week 03':2,'Week 04':2,'Week 05':2,'Week 06':2,'Week 07':2,'Week 08':2,'Week 09':2,'Week 10':2 };
  const courseMap = {};
  progress.forEach(p => {
    if (!courseMap[p.course]) courseMap[p.course] = {};
    if (!courseMap[p.course][p.module]) courseMap[p.course][p.module] = [];
    courseMap[p.course][p.module].push(p.lesson);
  });

  // Build summary stats
  const totalLessons  = progress.length;
  const totalCourses  = Object.keys(courseMap).length;
  const overallPct    = Math.min(Math.round((totalLessons / TOTAL_LESSONS) * 100), 100);
  const lastActivity  = progress[0]?.completed_at ? fmtDate(progress[0].completed_at) : '—';

  let html = `
    <div class="progress-summary">
      <div class="progress-summary-item">
        <div class="ps-value">${totalLessons}</div>
        <div class="ps-label">Lessons Completed</div>
      </div>
      <div class="progress-summary-item">
        <div class="ps-value">${totalCourses}</div>
        <div class="ps-label">Courses Enrolled</div>
      </div>
      <div class="progress-summary-item">
        <div class="ps-value">${overallPct}%</div>
        <div class="ps-label">Overall Completion</div>
      </div>
      <div class="progress-summary-item">
        <div class="ps-value">${lastActivity}</div>
        <div class="ps-label">Last Activity</div>
      </div>
    </div>`;

  for (const [course, modules] of Object.entries(courseMap)) {
    const courseLessons = Object.values(modules).flat().length;
    const coursePct     = Math.min(Math.round((courseLessons / TOTAL_LESSONS) * 100), 100);
    html += `<div class="progress-section">
      <h3>${esc(course)} <span style="font-weight:400;color:var(--gray-400);text-transform:none;letter-spacing:0">${courseLessons} lessons · ${coursePct}% complete</span></h3>`;
    for (const [mod, lessons] of Object.entries(modules)) {
      const total = NLP_MODULES[mod] || lessons.length;
      const pct   = Math.round((lessons.length / total) * 100);
      html += `
        <div class="module-row">
          <div class="module-name">${esc(mod)}</div>
          <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="module-pct">${pct}%</div>
        </div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.toggle('active', el.id === `tab-${tab}`));
}

// ── Actions ────────────────────────────────────────────────
async function toggleDisable(id, disable, fromModal = false) {
  if (!confirm(`${disable ? 'Disable' : 'Enable'} this user?`)) return;
  try {
    await api('POST', `/users/${id}/${disable ? 'disable' : 'enable'}`);
    await Promise.all([loadUsers(), loadStats()]);
    if (fromModal) closeModal(); else renderUsersTable();
    renderRecentUsers();
  } catch (err) { alert(err.message); }
}

async function deleteUser(id, name, fromModal = false) {
  if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/users/${id}`);
    await Promise.all([loadUsers(), loadStats()]);
    if (fromModal) closeModal();
    renderUsersTable();
    renderRecentUsers();
  } catch (err) { alert(err.message); }
}

async function resetPassword(id, email) {
  if (!confirm(`Send a password reset email to ${email}?`)) return;
  try {
    const res = await api('POST', `/users/${id}/reset-password`);
    alert(res._dev_previewUrl
      ? `Reset email sent!\n\nDev preview: ${res._dev_previewUrl}`
      : `Reset email sent to ${email}`);
  } catch (err) { alert(err.message); }
}

// ── Coupons ────────────────────────────────────────────────
let allCoupons = [];
let editingCouponId = null;

async function loadCoupons() {
  const body = document.getElementById('coupons-body');
  body.innerHTML = `<tr><td colspan="7" class="empty-msg">Loading…</td></tr>`;
  try {
    const data = await api('GET', '/coupons');
    allCoupons = data.coupons;
    renderCouponsTable();
    clearBanner();
  } catch (err) {
    allCoupons = [];
    body.innerHTML = `<tr><td colspan="7" class="empty-msg">Failed to load coupons: ${esc(err.message)}</td></tr>`;
    showBanner(`Could not load coupons: ${err.message}`);
  }
}

function renderCouponsTable() {
  document.getElementById('coupons-count').textContent = `(${allCoupons.length})`;
  const body = document.getElementById('coupons-body');
  if (!allCoupons.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty-msg">No coupons yet. Click "+ New Coupon" to create one.</td></tr>`;
    return;
  }
  const now = new Date();
  body.innerHTML = allCoupons.map(c => {
    const expired  = c.expires_at && new Date(c.expires_at) <= now;
    const statusBadge = expired
      ? '<span class="badge badge-red">Expired</span>'
      : '<span class="badge badge-green">Active</span>';
    const expiryCell = c.expires_at
      ? `${fmtDate(c.expires_at)}${expired ? '' : ''}`
      : '<span style="color:var(--gray-400)">Never</span>';
    return `
      <tr>
        <td><span class="coupon-code">${esc(c.code)}</span></td>
        <td><strong>${c.days}</strong> day${c.days !== 1 ? 's' : ''}</td>
        <td>${expiryCell}</td>
        <td>${statusBadge}</td>
        <td>${c.used_count}</td>
        <td>${fmtDate(c.created_at)}</td>
        <td>
          <div class="actions">
            <button class="btn-icon primary" onclick="openCouponModal(${c.id})">Edit</button>
            <button class="btn-icon danger"  onclick="confirmDeleteCoupon(${c.id}, '${esc(c.code)}')">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function openCouponModal(id) {
  editingCouponId = id || null;
  document.getElementById('coupon-form-error').textContent = '';
  document.getElementById('coupon-code-hint').textContent  = '';

  if (id) {
    const c = allCoupons.find(x => x.id === id);
    if (!c) return;
    document.getElementById('coupon-modal-title').textContent = 'Edit Coupon';
    document.getElementById('coupon-code').value    = c.code;
    document.getElementById('coupon-code').disabled = false;
    document.getElementById('coupon-days').value    = c.days;
    document.getElementById('coupon-expires').value = c.expires_at
      ? new Date(c.expires_at).toISOString().slice(0, 10)
      : '';
  } else {
    document.getElementById('coupon-modal-title').textContent = 'New Coupon';
    document.getElementById('coupon-code').value    = '';
    document.getElementById('coupon-code').disabled = false;
    document.getElementById('coupon-days').value    = '30';
    document.getElementById('coupon-expires').value = '';
  }

  const overlay = document.getElementById('coupon-modal-overlay');
  overlay.style.display = 'flex';
}

function closeCouponModal() {
  document.getElementById('coupon-modal-overlay').style.display = 'none';
  editingCouponId = null;
}

function generateCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code   = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  document.getElementById('coupon-code').value = code;
  document.getElementById('coupon-code-hint').textContent = 'Code auto-generated — you can edit it.';
}

async function saveCoupon() {
  const errEl = document.getElementById('coupon-form-error');
  const btn   = document.getElementById('coupon-save-btn');
  errEl.textContent = '';

  const code      = document.getElementById('coupon-code').value.trim().toUpperCase();
  const days      = parseInt(document.getElementById('coupon-days').value, 10);
  const expiresRaw = document.getElementById('coupon-expires').value;
  const expires_at = expiresRaw ? new Date(expiresRaw + 'T23:59:59').toISOString() : null;

  if (!code) { errEl.textContent = 'Code is required.'; return; }
  if (!days || days < 1 || days > 10000) { errEl.textContent = 'Days must be between 1 and 10,000.'; return; }

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    if (editingCouponId) {
      await api('PUT', `/coupons/${editingCouponId}`, { code, days, expires_at });
    } else {
      await api('POST', '/coupons', { code, days, expires_at });
    }
    closeCouponModal();
    await loadCoupons();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Coupon';
  }
}

async function confirmDeleteCoupon(id, code) {
  if (!confirm(`Delete coupon "${code}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/coupons/${id}`);
    await loadCoupons();
  } catch (err) { alert(err.message); }
}

// ── Helpers ────────────────────────────────────────────────
const TOTAL_LESSONS = 20; // NLP course: 10 weeks × 2 lessons

function progressCell(u) {
  const count  = Number(u.lessons_completed) || 0;
  const courses = Number(u.courses_count) || 0;
  if (!count) return '<span class="prog-sub">No activity</span>';
  const pct = Math.min(Math.round((count / TOTAL_LESSONS) * 100), 100);
  return `
    <div class="prog-label">${count} lesson${count !== 1 ? 's' : ''}</div>
    <div class="prog-sub">${courses} course${courses !== 1 ? 's' : ''}</div>
    <div class="prog-mini-bar"><div class="prog-mini-fill" style="width:${pct}%"></div></div>`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function fmtDateFull(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function subscriptionBadge(sub) {
  if (!sub) return '<span class="badge badge-gray">Free</span>';
  let parsed = null;
  try { parsed = typeof sub === 'string' ? JSON.parse(sub) : sub; } catch {}
  if (!parsed) return '<span class="badge badge-gray">Free</span>';
  return (parsed.expiresAt && new Date(parsed.expiresAt) > new Date())
    ? '<span class="badge badge-blue">Pro</span>'
    : '<span class="badge badge-yellow">Expired</span>';
}
