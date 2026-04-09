// ============================================================
//  Payment & Credit System
// ============================================================

const INTERVIEW_COST  = 50;   // credits per mock interview
const SUB_MONTHLY_PRICE  = 99;
const SUB_ANNUAL_PRICE   = 999;
const SUB_MONTHLY_CREDITS = 200;
const SUB_ANNUAL_CREDITS  = 2400;

// ── Persistence (localStorage fallback for offline) ────────
function loadAccount() {
  const raw = localStorage.getItem('ai-learn-account');
  if (raw) return JSON.parse(raw);
  return { credits: 0, subscription: null, transactions: [] };
}
function saveAccount(acc) { localStorage.setItem('ai-learn-account', JSON.stringify(acc)); }
function getAccount() {
  const acc = loadAccount();
  if (acc.subscription) {
    if (new Date() > new Date(acc.subscription.expiresAt)) { acc.subscription = null; saveAccount(acc); }
  }
  return acc;
}
function getCredits()           { return getAccount().credits; }
function addCredits(amount, note) {
  const acc = getAccount();
  acc.credits += amount;
  acc.transactions.push({ date: new Date().toISOString(), type: 'credit', amount, note });
  saveAccount(acc);
  updateCreditDisplay();
}
function deductCredits(amount, note) {
  const acc = getAccount();
  if (acc.credits < amount) return false;
  acc.credits -= amount;
  acc.transactions.push({ date: new Date().toISOString(), type: 'debit', amount, note });
  saveAccount(acc);
  updateCreditDisplay();
  return true;
}
function updateCreditDisplay() {
  const credits = typeof currentUser !== 'undefined' && currentUser ? (currentUser.credits ?? getCredits()) : getCredits();
  document.querySelectorAll('.credit-balance').forEach(el => {
    el.textContent = credits + ' credits';
    el.style.color = credits >= INTERVIEW_COST ? '' : '#ef4444';
  });
}

// ── Payment Modal ──────────────────────────────────────────
let _stripeLinks = null; // cached after first fetch
let _txHistory   = null; // cached server transactions

async function openPaymentModal() {
  document.getElementById('paymentModal').classList.add('open');
  // Fetch Stripe links and transaction history in parallel
  await Promise.all([
    (async () => {
      if (_stripeLinks === null) {
        try {
          _stripeLinks = await apiFetch('/stripe/links');
          console.log('[Stripe] links loaded:', _stripeLinks);
        } catch (err) {
          console.warn('[Stripe] failed to load links:', err.message);
          _stripeLinks = { configured: false };
        }
      }
    })(),
    (async () => {
      // Always refresh transactions on open so history is up to date
      if (typeof currentUser !== 'undefined' && currentUser) {
        try {
          const data = await apiFetch('/auth/credits');
          _txHistory = data.transactions || [];
        } catch { _txHistory = null; }
      }
    })(),
  ]);
  renderPaymentModal();
}
function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('open');
  _txHistory = null; // refresh on next open
}

function renderPaymentModal() {
  const acc      = getAccount();
  const subRaw   = (typeof currentUser !== 'undefined' && currentUser?.subscription) || acc.subscription;
  const sub      = typeof subRaw === 'string' ? (() => { try { return JSON.parse(subRaw); } catch { return null; } })() : subRaw;
  const subActive    = sub && new Date(sub.expiresAt) > new Date();
  const currentPlan  = subActive ? sub.plan : null;   // 'monthly' | 'annual' | 'coupon' | null
  const isCouponSub  = currentPlan === 'coupon';
  const expiry       = subActive ? new Date(sub.expiresAt).toLocaleDateString() : null;
  const credits      = typeof currentUser !== 'undefined' && currentUser ? (currentUser.credits ?? acc.credits) : acc.credits;
  const stripeReady  = _stripeLinks?.configured;

  // Build Stripe URL at render time (links already cached in _stripeLinks)
  function stripeUrl(plan) {
    if (!stripeReady) return null;
    const isAnnual = plan === 'annual';
    const link   = isAnnual ? _stripeLinks.annual : _stripeLinks.monthly;
    const userId = (typeof currentUser !== 'undefined' && currentUser?.id) || '';
    const email  = (typeof currentUser !== 'undefined' && currentUser?.email) || '';
    return `${link}?client_reference_id=${encodeURIComponent(userId)}&prefilled_email=${encodeURIComponent(email)}`;
  }

  // Per-card button helper
  function planButton(plan) {
    const isAnnual = plan === 'annual';
    const isCurrentPaid = currentPlan === plan;

    if (isCurrentPaid) {
      return `<button class="pm-buy-btn pm-buy-btn-disabled" disabled style="background:#e2e8f0;color:#64748b;cursor:default">✓ Current Plan</button>`;
    }

    const url = stripeUrl(plan);
    if (url) {
      // Use a real anchor tag — avoids any SPA router interference
      let label, style = '';
      if (isCouponSub || !currentPlan) {
        label = isAnnual ? 'Subscribe Annually' : 'Subscribe Monthly';
      } else if (currentPlan === 'monthly' && plan === 'annual') {
        label = 'Upgrade to Annual ↑';
      } else {
        label = 'Switch to Monthly';
        style = 'background:#64748b';
      }
      return `<a href="${url}" class="pm-buy-btn" style="display:block;text-align:center;text-decoration:none;${style}">${label}</a>`;
    }

    // Demo fallback (Stripe not configured)
    let label, style = '';
    if (isCouponSub || !currentPlan) {
      label = isAnnual ? 'Subscribe Annually' : 'Subscribe Monthly';
    } else if (currentPlan === 'monthly' && plan === 'annual') {
      label = 'Upgrade to Annual ↑';
    } else {
      label = 'Switch to Monthly';
      style = 'background:#64748b';
    }
    return `<button class="pm-buy-btn" style="${style}" onclick="purchaseSubscription('${plan}')">${label}</button>`;
  }

  // Card highlight border for active plan
  function cardStyle(plan) {
    if (currentPlan === plan) return 'position:relative;border:2px solid #10b981;box-shadow:0 0 0 3px rgba(16,185,129,0.15)';
    return 'position:relative';
  }

  // "Current Plan" top badge (green ribbon replacing BEST VALUE on annual when active)
  function currentBadge(plan) {
    if (currentPlan !== plan) return '';
    return `<div style="position:absolute;top:-1px;left:50%;transform:translateX(-50%);background:#10b981;color:white;font-size:11px;font-weight:700;padding:3px 12px;border-radius:0 0 8px 8px;letter-spacing:.5px;white-space:nowrap">✓ CURRENT PLAN</div>`;
  }

  // Header subscription status
  let subBadge = '';
  if (isCouponSub) {
    subBadge = `<div class="pm-sub-badge" style="background:#fef9c3;border-color:#fde68a;color:#92400e">🎟️ Free trial active — expires ${expiry}. Subscribe anytime to continue after trial.</div>`;
  } else if (currentPlan === 'monthly') {
    subBadge = `<div class="pm-sub-badge" style="background:#dcfce7;border-color:#86efac;color:#166534">✓ Pro Monthly — renews ${expiry}</div>`;
  } else if (currentPlan === 'annual') {
    subBadge = `<div class="pm-sub-badge" style="background:#dcfce7;border-color:#86efac;color:#166534">✓ Pro Annual — expires ${expiry}</div>`;
  }

  // Payment method note
  const paymentNote = stripeReady
    ? `<div style="text-align:center;font-size:12px;color:#94a3b8;margin-top:4px">🔒 Secure payment via Stripe</div>`
    : `<div style="text-align:center;font-size:12px;color:#f59e0b;margin-top:4px">⚡ Demo mode — no real charge</div>`;

  document.getElementById('paymentModalBody').innerHTML = `
    <div class="pm-header">
      <div class="pm-title">Get Access</div>
      <div class="pm-balance">Current credits: <strong>${credits}</strong></div>
      ${subBadge}
    </div>

    <div class="pm-tabs">
      <button class="pm-tab active" onclick="showPmTab('plans')">Subscription Plans</button>
      <button class="pm-tab" onclick="showPmTab('coupon')">🎟️ Coupon Code</button>
      <button class="pm-tab" onclick="showPmTab('history')">History</button>
    </div>

    <div id="pm-tab-plans" class="pm-tab-content active">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">

        <!-- Monthly -->
        <div class="pm-card" style="${cardStyle('monthly')}">
          ${currentBadge('monthly')}
          <div class="pm-card-title" style="margin-top:${currentPlan === 'monthly' ? '12px' : '0'}">📅 Monthly</div>
          <div class="pm-price-big">$${SUB_MONTHLY_PRICE}<span>/mo</span></div>
          <div class="pm-card-desc">${SUB_MONTHLY_CREDITS} credits · 30 days</div>
          <ul class="pm-features">
            <li>✓ ${SUB_MONTHLY_CREDITS} credits/month</li>
            <li>✓ 4 mock interviews</li>
            <li>✓ All course modules</li>
            <li>✓ Priority support</li>
          </ul>
          ${planButton('monthly')}
        </div>

        <!-- Annual -->
        <div class="pm-card pm-card-featured" style="${cardStyle('annual')}">
          ${currentPlan === 'annual' ? currentBadge('annual') : '<div class="pm-badge-best">BEST VALUE</div>'}
          <div class="pm-card-title" style="margin-top:12px">🗓️ Annual</div>
          <div class="pm-price-big">$${SUB_ANNUAL_PRICE}<span>/yr</span></div>
          <div class="pm-card-desc">${SUB_ANNUAL_CREDITS} credits · 365 days · 2 months free</div>
          <ul class="pm-features">
            <li>✓ ${SUB_ANNUAL_CREDITS} credits/year</li>
            <li>✓ 48 mock interviews</li>
            <li>✓ All course modules</li>
            <li>✓ Priority support</li>
          </ul>
          ${planButton('annual')}
        </div>
      </div>

      ${paymentNote}

      <div class="pm-compare" style="margin-top:12px">
        <table class="pm-compare-table">
          <tr><th></th><th>Monthly</th><th>Annual</th></tr>
          <tr><td>Price</td><td>$${SUB_MONTHLY_PRICE}/mo</td><td class="highlight">$${SUB_ANNUAL_PRICE}/yr</td></tr>
          <tr><td>Credits</td><td>${SUB_MONTHLY_CREDITS}/mo</td><td class="highlight">${SUB_ANNUAL_CREDITS}/yr</td></tr>
          <tr><td>Cost per credit</td><td>$0.50</td><td class="highlight">$0.42</td></tr>
          <tr><td>Mock interviews</td><td>4/mo</td><td class="highlight">48/yr</td></tr>
          <tr><td>Savings</td><td>—</td><td class="highlight">~$189 vs monthly</td></tr>
        </table>
      </div>
    </div>

    <div id="pm-tab-coupon" class="pm-tab-content" style="display:none">
      <div class="pm-card">
        <div class="pm-card-title">🎟️ Redeem Coupon Code</div>
        <div class="pm-card-desc">${subActive ? 'Applying a coupon will extend your current access period.' : 'Enter a coupon code to activate a free trial period.'}</div>
        <div style="margin-top:20px">
          <label style="display:block;font-size:13px;font-weight:600;color:#475569;margin-bottom:6px">Coupon Code</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="couponInput" placeholder="e.g. TRIAL30"
              style="flex:1;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:monospace;text-transform:uppercase;outline:none"
              oninput="this.value=this.value.toUpperCase();document.getElementById('couponMsg').textContent=''"
              onkeydown="if(event.key==='Enter')applyCoupon()">
            <button class="pm-buy-btn" style="width:auto;padding:10px 20px;margin-top:0" onclick="applyCoupon()">Apply</button>
          </div>
          <div id="couponMsg" style="font-size:13px;margin-top:10px;min-height:18px"></div>
        </div>
      </div>
    </div>

    <div id="pm-tab-history" class="pm-tab-content" style="display:none">
      <div class="pm-card">
        <div class="pm-card-title">📋 Transaction History</div>
        ${(() => {
          // Prefer server transactions; fall back to localStorage
          const txList = (_txHistory !== null ? _txHistory : acc.transactions) || [];
          if (txList.length === 0) {
            return '<p style="color:#64748b;text-align:center;padding:20px">No transactions yet</p>';
          }
          // Server records use created_at; localStorage uses date
          const rows = txList.slice().reverse().map(tx => {
            const dateStr = tx.created_at || tx.date;
            const isDemo = tx.note && (
              tx.note.includes('[DEMO]') ||
              (/subscription/i.test(tx.note) && !tx.note.includes('via Stripe') && tx.type === 'credit')
            );
            const displayNote = tx.note ? tx.note.replace(' [DEMO]', '') : '';
            const demoBadge = isDemo
              ? '<span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:4px;padding:1px 5px;vertical-align:middle">DEMO</span>'
              : '';
            return `
              <div class="pm-tx">
                <span class="pm-tx-icon">${tx.type === 'credit' ? '↑' : '↓'}</span>
                <div class="pm-tx-detail">
                  <div class="pm-tx-note">${displayNote}${demoBadge}</div>
                  <div class="pm-tx-date">${new Date(dateStr).toLocaleString()}</div>
                </div>
                <span class="pm-tx-amount ${tx.type}">${tx.type === 'credit' ? '+' : '-'}${tx.amount}</span>
              </div>`;
          });
          return `<div class="pm-tx-list">${rows.join('')}</div>`;
        })()}
      </div>
    </div>
  `;
}

function showPmTab(name) {
  document.querySelectorAll('.pm-tab').forEach((t, i) => {
    const tabs = ['plans', 'coupon', 'history'];
    t.classList.toggle('active', tabs[i] === name);
  });
  document.querySelectorAll('.pm-tab-content').forEach(c => c.style.display = 'none');
  const target = document.getElementById(`pm-tab-${name}`);
  if (target) target.style.display = 'block';
}

// ── Subscriptions ──────────────────────────────────────────
function purchaseSubscription(plan) {
  const isAnnual  = plan === 'annual';
  const price     = isAnnual ? `$${SUB_ANNUAL_PRICE}/year` : `$${SUB_MONTHLY_PRICE}/month`;
  const credits   = isAnnual ? SUB_ANNUAL_CREDITS : SUB_MONTHLY_CREDITS;
  const days      = isAnnual ? 365 : 30;
  const label     = isAnnual ? 'Pro Annual' : 'Pro Monthly';

  // Use cached Stripe payment links if configured
  const stripeData = _stripeLinks || {};
  if (stripeData.configured) {
    const link   = isAnnual ? stripeData.annual : stripeData.monthly;
    const userId = (typeof currentUser !== 'undefined' && currentUser?.id) || '';
    const email  = (typeof currentUser !== 'undefined' && currentUser?.email) || '';
    const url    = `${link}?client_reference_id=${encodeURIComponent(userId)}&prefilled_email=${encodeURIComponent(email)}`;
    window.location.href = url;
    return;
  }

  // Demo / simulation fallback
  showPaymentConfirm(credits, price, () => {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    const sub = { plan, startedAt: new Date().toISOString(), expiresAt: expiry.toISOString() };
    const acc = getAccount();
    acc.subscription = sub;
    addCredits(credits, `${label} subscription: ${credits} credits [DEMO]`);
    saveAccount(acc);
    if (typeof currentUser !== 'undefined' && currentUser) {
      currentUser.credits = (currentUser.credits || 0) + credits;
      currentUser.subscription = sub;
      if (typeof syncCreditsFromServer === 'function') syncCreditsFromServer();
    }
    showPaymentSuccess(`Welcome to Pro! ${credits} credits added. Access valid until ${expiry.toLocaleDateString()}.`);
  });
}

// ── Coupon Redemption ──────────────────────────────────────
async function applyCoupon() {
  const input  = document.getElementById('couponInput');
  const msgEl  = document.getElementById('couponMsg');
  const code   = input.value.trim().toUpperCase();
  if (!code) { msgEl.style.color = '#ef4444'; msgEl.textContent = 'Please enter a coupon code.'; return; }

  msgEl.style.color = '#64748b';
  msgEl.textContent = 'Validating…';

  try {
    const data = await apiFetch(`/auth/coupon/apply`, { method: 'POST', body: { code } });
    // Sync subscription from server
    if (typeof syncCreditsFromServer === 'function') await syncCreditsFromServer();
    msgEl.style.color = '#065f46';
    msgEl.textContent = `✓ ${data.message}`;
    input.value = '';
    // Refresh modal header to show new subscription status
    setTimeout(() => renderPaymentModal(), 1500);
  } catch (err) {
    msgEl.style.color = '#ef4444';
    msgEl.textContent = err.message;
  }
}

// ── Payment confirm / success screens ─────────────────────
function showPaymentConfirm(credits, price, onConfirm) {
  document.getElementById('paymentModalBody').innerHTML = `
    <div style="text-align:center;padding:40px 20px">
      <div style="font-size:48px;margin-bottom:16px">💳</div>
      <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Confirm Purchase</h2>
      <p style="color:#64748b;margin-bottom:24px">${credits} credits for ${price}</p>
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#92400e">
        ⚡ <strong>Demo Mode:</strong> This is a simulated payment. No real charge will occur.
      </div>
      <div style="display:flex;gap:12px;justify-content:center">
        <button onclick="renderPaymentModal()" style="padding:10px 24px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;font-weight:600">Cancel</button>
        <button onclick="(${onConfirm.toString()})()" style="padding:10px 24px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">Confirm Payment</button>
      </div>
    </div>
  `;
}

function showPaymentSuccess(msg) {
  document.getElementById('paymentModalBody').innerHTML = `
    <div style="text-align:center;padding:40px 20px">
      <div style="font-size:56px;margin-bottom:16px">🎉</div>
      <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;color:#166534">Payment Successful!</h2>
      <p style="color:#64748b;margin-bottom:24px">${msg}</p>
      <button onclick="closePaymentModal()" style="padding:10px 32px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">Start Practicing →</button>
    </div>
  `;
  updateCreditDisplay();
}

// ── Close on backdrop click ────────────────────────────────
document.addEventListener('click', e => {
  if (e.target.id === 'paymentModal') closePaymentModal();
});

// ── Stripe redirect-back handler ───────────────────────────
// Stripe returns users to the app URL with ?stripe_success=1
(function handleStripeRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('stripe_success')) return;

  // Remove the query param from the URL without a page reload
  const clean = window.location.pathname + window.location.hash;
  history.replaceState(null, '', clean);

  // Wait for auth to initialise, then sync credits and show success modal
  function onReady() {
    if (typeof syncCreditsFromServer === 'function') {
      syncCreditsFromServer().then(() => {
        openPaymentModal();
        document.getElementById('paymentModalBody').innerHTML = `
          <div style="text-align:center;padding:40px 20px">
            <div style="font-size:56px;margin-bottom:16px">🎉</div>
            <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;color:#166534">Payment Successful!</h2>
            <p style="color:#64748b;margin-bottom:24px">Your subscription is now active. Credits have been added to your account.</p>
            <button onclick="closePaymentModal()" style="padding:10px 32px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">Start Practicing →</button>
          </div>`;
        updateCreditDisplay();
      });
    }
  }

  // Delay slightly to let auth.js finish initialising currentUser
  setTimeout(onReady, 800);
}());
