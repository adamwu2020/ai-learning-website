// ============================================================
//  Auth Client — Register, Login, Forgot Password
// ============================================================

const API = 'http://localhost:3001/api';
const TOKEN_KEY = 'ai-learn-token';

// ── State ──────────────────────────────────────────────────
let currentUser = null;

// ── API Helper ─────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    // Network error — server is likely not running
    throw new Error('Cannot connect to auth server. Please run ./start-server.sh in your terminal first.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── App-mode toggle (show/hide landing vs app) ─────────────
function enterApp() {
  document.body.classList.add('app-mode');
  // rAF ensures browser applies the app-mode CSS class before navigate() runs
  requestAnimationFrame(() => {
    if (typeof initAppNav === 'function') initAppNav();
  });
}
function exitApp() {
  document.body.classList.remove('app-mode');
  // clear any active section so the landing page takes over via CSS
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  history.replaceState({}, '', location.pathname);
}

// ── Session ────────────────────────────────────────────────
async function initAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) { renderTopbarGuest(); exitApp(); return; }
  try {
    const { user } = await apiFetch('/auth/me');
    currentUser = user;
    await syncCreditsFromServer();
    renderTopbarUser(user);
    enterApp();
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    renderTopbarGuest();
    exitApp();
  }
}

async function syncCreditsFromServer() {
  if (!currentUser) return;
  try {
    const { credits, subscription } = await apiFetch('/auth/credits');
    currentUser.credits = credits;
    if (subscription !== undefined) currentUser.subscription = subscription;
    updateCreditDisplay();
    updateTrialBadge();
  } catch { /* offline */ }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  renderTopbarGuest();
  updateCreditDisplay();
  closeAuthModal();
  exitApp();
}

// ── Server-aware credit operations ─────────────────────────
async function serverAddCredits(amount, note) {
  if (!currentUser) { addCredits(amount, note); return; }  // fallback localStorage
  await apiFetch('/auth/credits/add', { method: 'POST', body: { amount, note } });
  await syncCreditsFromServer();
}

async function serverDeductCredits(amount, note) {
  if (!currentUser) return deductCredits(amount, note);    // fallback localStorage
  try {
    await apiFetch('/auth/credits/deduct', { method: 'POST', body: { amount, note } });
    await syncCreditsFromServer();
    return true;
  } catch (err) {
    if (err.message === 'Insufficient credits') return false;
    throw err;
  }
}

async function serverSubscribe() {
  if (!currentUser) { purchaseSubscription(); return; }
  const data = await apiFetch('/auth/subscription', { method: 'POST' });
  currentUser.credits      = data.credits;
  currentUser.subscription = data.subscription;
  updateCreditDisplay();
  return data;
}

function getCreditsValue() {
  return currentUser ? currentUser.credits : getCredits();
}

// ── Trial & Access ──────────────────────────────────────────
function trialDaysLeft() {
  if (!currentUser) return 0;
  // Prefer server-computed value (returned in user object)
  if (typeof currentUser.trial_days_left === 'number') return currentUser.trial_days_left;
  // Fallback: compute from created_at
  try {
    const raw = currentUser.created_at;
    if (!raw) return 7;
    const created = new Date(String(raw).replace(' ', 'T') + 'Z');
    if (isNaN(created.getTime())) return 7;
    const daysElapsed = (Date.now() - created.getTime()) / 86400000;
    return Math.max(0, Math.ceil(7 - daysElapsed));
  } catch { return 7; }
}

function hasActiveSubscription() {
  try {
    const sub = currentUser?.subscription;
    if (!sub) return false;
    const s = typeof sub === 'string' ? JSON.parse(sub) : sub;
    return !!(s?.expiresAt && new Date() < new Date(s.expiresAt));
  } catch { return false; }
}

function hasModuleAccess() {
  if (!currentUser) return false;       // not logged in
  if (hasActiveSubscription()) return true;
  // Use server-provided trial flag if available
  if (typeof currentUser.trial_active === 'boolean') return currentUser.trial_active;
  // Fallback: compute locally
  const days = trialDaysLeft();
  return isNaN(days) || days > 0;      // fail open on uncertainty
}

function updateTrialBadge() {
  const el = document.getElementById('topnav-trial');
  if (!el || !currentUser) return;
  const days = trialDaysLeft();
  if (hasActiveSubscription()) {
    el.innerHTML = `<div class="trial-badge trial-pro">⚡ Pro</div>`;
  } else if (days > 2) {
    el.innerHTML = `<div class="trial-badge trial-active" title="Free trial — ${days} days remaining">🎉 ${days}d free</div>`;
  } else if (days > 0) {
    el.innerHTML = `<div class="trial-badge trial-expiring" onclick="openPaymentModal()" title="Trial expiring soon!">⏰ ${days}d left</div>`;
  } else {
    el.innerHTML = `<div class="trial-badge trial-expired" onclick="openPaymentModal()">🔒 Upgrade</div>`;
  }
}

// ── Topbar Rendering ────────────────────────────────────────
function renderTopbarUser(user) {
  const right = document.querySelector('.topnav-actions');

  // Avatar pill
  const avatarEl = document.getElementById('topnav-user');
  if (avatarEl) avatarEl.remove();

  const avatar = document.createElement('div');
  avatar.id = 'topnav-user';
  avatar.className = 'topnav-user-pill';
  avatar.innerHTML = `
    <div class="topnav-avatar">${user.name.charAt(0).toUpperCase()}</div>
    <span class="topnav-username">${user.name.split(' ')[0]}</span>
    <div class="topnav-user-menu">
      <div class="tum-item tum-info">
        <strong>${user.name}</strong>
        <span>${user.email}</span>
      </div>
      <div class="tum-divider"></div>
      <div class="tum-item" onclick="openPaymentModal()">💰 Buy Credits / Upgrade</div>
      <div class="tum-divider"></div>
      <div class="tum-item tum-logout" onclick="logout()">🚪 Sign Out</div>
    </div>
  `;
  right.insertBefore(avatar, right.firstChild);
  updateTrialBadge();
}

function renderTopbarGuest() {
  const existing = document.getElementById('topnav-user');
  if (existing) existing.remove();

  const right = document.querySelector('.topnav-actions');
  const el    = document.createElement('div');
  el.id = 'topnav-user';
  el.className = 'topnav-guest-btns';
  el.innerHTML = `
    <button class="topnav-login-btn"    onclick="openAuthModal('login')">Sign In</button>
    <button class="topnav-register-btn" onclick="openAuthModal('register')">Get Started</button>
  `;
  right.insertBefore(el, right.firstChild);
}

// ── Auth Modal ─────────────────────────────────────────────
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  modal.classList.add('open');
  renderAuthModal(tab);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
}

function renderAuthModal(tab = 'login') {
  const tabs = { login: 'Sign In', register: 'Create Account', forgot: 'Forgot Password' };
  document.getElementById('authModalBody').innerHTML = `
    <div class="auth-tabs">
      ${['login','register'].map(t => `
        <button class="auth-tab ${tab === t ? 'active' : ''}" onclick="renderAuthModal('${t}')">${tabs[t]}</button>
      `).join('')}
    </div>
    <div id="auth-form-wrap">
      ${tab === 'login'    ? renderLoginForm()    : ''}
      ${tab === 'register' ? renderRegisterForm() : ''}
      ${tab === 'forgot'   ? renderForgotForm()   : ''}
    </div>
  `;
}

// ── Login Form ─────────────────────────────────────────────
function renderLoginForm() {
  return `
    <form id="loginForm" class="auth-form" onsubmit="handleLogin(event)">
      <h2 class="auth-title">Welcome back</h2>
      <p class="auth-sub">Sign in to your AI Learning account</p>

      <div class="auth-field">
        <label>Email</label>
        <input type="email" id="loginEmail" placeholder="you@example.com" required autocomplete="email" />
      </div>
      <div class="auth-field">
        <label>Password</label>
        <div class="auth-pw-wrap">
          <input type="password" id="loginPassword" placeholder="Your password" required autocomplete="current-password" />
          <button type="button" class="pw-toggle" onclick="togglePw('loginPassword', this)">Show</button>
        </div>
      </div>

      <div id="loginError" class="auth-error" style="display:none"></div>

      <button type="submit" class="auth-submit" id="loginBtn">Sign In</button>

      <div class="auth-links">
        <button type="button" class="auth-link" onclick="renderAuthModal('forgot')">Forgot password?</button>
        <span style="color:#cbd5e1">·</span>
        <button type="button" class="auth-link" onclick="renderAuthModal('register')">Create account</button>
      </div>
    </form>
  `;
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginBtn');
  const errEl    = document.getElementById('loginError');

  setAuthLoading(btn, true, 'Signing in…');
  errEl.style.display = 'none';

  try {
    const { token, user } = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    localStorage.setItem(TOKEN_KEY, token);
    currentUser = user;
    await syncCreditsFromServer();
    renderTopbarUser(user);
    closeAuthModal();
    enterApp();
    showToast(`Welcome back, ${user.name.split(' ')[0]}! 👋`);
  } catch (err) {
    showAuthError(errEl, err.message);
    setAuthLoading(btn, false, 'Sign In');
  }
}

// ── Register Form ──────────────────────────────────────────
function renderRegisterForm() {
  return `
    <form id="registerForm" class="auth-form" onsubmit="handleRegister(event)">
      <h2 class="auth-title">Create your account</h2>
      <p class="auth-sub">Free to join — start learning AI today</p>

      <div class="auth-field">
        <label>Full Name</label>
        <input type="text" id="regName" placeholder="Alice Chen" required autocomplete="name" />
      </div>
      <div class="auth-field">
        <label>Email</label>
        <input type="email" id="regEmail" placeholder="you@example.com" required autocomplete="email" />
      </div>
      <div class="auth-field">
        <label>Password</label>
        <div class="auth-pw-wrap">
          <input type="password" id="regPassword" placeholder="At least 8 characters" required autocomplete="new-password" />
          <button type="button" class="pw-toggle" onclick="togglePw('regPassword', this)">Show</button>
        </div>
        <div id="pwStrengthBar" class="pw-strength-bar"><div class="pw-strength-fill"></div></div>
        <span id="pwStrengthLabel" class="pw-strength-label"></span>
      </div>
      <div class="auth-field">
        <label>Confirm Password</label>
        <input type="password" id="regConfirm" placeholder="Repeat password" required autocomplete="new-password" />
      </div>

      <div id="regError" class="auth-error" style="display:none"></div>

      <div class="auth-terms">
        By creating an account you agree to our <a href="#" onclick="return false">Terms</a> and <a href="#" onclick="return false">Privacy Policy</a>.
      </div>

      <button type="submit" class="auth-submit" id="regBtn">Create Account</button>

      <div class="auth-links">
        Already have an account?
        <button type="button" class="auth-link" onclick="renderAuthModal('login')">Sign in</button>
      </div>
    </form>
  `;
}

async function handleRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;
  const btn      = document.getElementById('regBtn');
  const errEl    = document.getElementById('regError');

  if (password !== confirm) { showAuthError(errEl, 'Passwords do not match.'); return; }
  if (password.length < 8)  { showAuthError(errEl, 'Password must be at least 8 characters.'); return; }

  setAuthLoading(btn, true, 'Creating account…');
  errEl.style.display = 'none';

  try {
    const { token, user } = await apiFetch('/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    localStorage.setItem(TOKEN_KEY, token);
    currentUser = user;
    await syncCreditsFromServer();
    renderTopbarUser(user);
    closeAuthModal();
    enterApp();
    showToast(`Account created! Welcome, ${user.name.split(' ')[0]}! 🎉`);
  } catch (err) {
    showAuthError(errEl, err.message);
    setAuthLoading(btn, false, 'Create Account');
  }
}

// ── Forgot Password Form ───────────────────────────────────
function renderForgotForm() {
  return `
    <form id="forgotForm" class="auth-form" onsubmit="handleForgot(event)">
      <h2 class="auth-title">Reset your password</h2>
      <p class="auth-sub">Enter your email and we'll send a reset link valid for 1 hour.</p>

      <div class="auth-field">
        <label>Email address</label>
        <input type="email" id="forgotEmail" placeholder="you@example.com" required autocomplete="email" />
      </div>

      <div id="forgotError"   class="auth-error"   style="display:none"></div>
      <div id="forgotSuccess" class="auth-success"  style="display:none"></div>

      <button type="submit" class="auth-submit" id="forgotBtn">Send Reset Link</button>

      <div class="auth-links">
        <button type="button" class="auth-link" onclick="renderAuthModal('login')">← Back to sign in</button>
      </div>
    </form>
  `;
}

async function handleForgot(e) {
  e.preventDefault();
  const email   = document.getElementById('forgotEmail').value.trim();
  const btn     = document.getElementById('forgotBtn');
  const errEl   = document.getElementById('forgotError');
  const succEl  = document.getElementById('forgotSuccess');

  setAuthLoading(btn, true, 'Sending…');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  try {
    const data = await apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });

    succEl.innerHTML = `
      ✅ ${data.message}
      ${data._dev_previewUrl
        ? `<br><br>📧 <strong>Dev mode:</strong> <a href="${data._dev_previewUrl}" target="_blank" style="color:#6366f1">View email preview</a>`
        : ''}
    `;
    succEl.style.display = 'block';
    btn.style.display = 'none';
  } catch (err) {
    showAuthError(errEl, err.message);
    setAuthLoading(btn, false, 'Send Reset Link');
  }
}

// ── Account Settings Modal ─────────────────────────────────
function openAccountModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  // Reuse payment modal for settings
  openPaymentModal();
}

// ── Utility ────────────────────────────────────────────────
function setAuthLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="auth-spinner"></span> ${label}` : label;
}

function showAuthError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

// Password strength meter
document.addEventListener('input', e => {
  if (e.target.id !== 'regPassword') return;
  const val   = e.target.value;
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(val)).length;
  const colors = ['#ef4444','#f97316','#f59e0b','#10b981'];
  const labels = ['Too short','Weak','Fair','Strong'];
  const bar   = document.querySelector('.pw-strength-fill');
  const label = document.getElementById('pwStrengthLabel');
  if (bar && label && val.length > 0) {
    bar.style.width   = (score * 25) + '%';
    bar.style.background = colors[score - 1] || '#ef4444';
    label.textContent = labels[score - 1] || '';
    label.style.color = colors[score - 1] || '#ef4444';
  }
});

// Toast notification
function showToast(msg, duration = 3500) {
  const existing = document.getElementById('authToast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'authToast';
  el.className = 'auth-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.id === 'authModal') closeAuthModal();
});

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.topnav-user-pill')) {
    document.querySelector('.topnav-user-menu')?.classList.remove('open');
  } else {
    document.querySelector('.topnav-user-menu')?.classList.toggle('open');
  }
});

// ── Override payment functions to use server when logged in ─
const _origPurchaseCredits     = window.purchaseCredits;
const _origPurchaseSubscription = window.purchaseSubscription;

// Patch after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
