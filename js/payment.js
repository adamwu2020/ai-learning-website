// ============================================================
//  Payment & Credit System
// ============================================================

const PRICE_PER_CREDIT   = 1;    // $1 per credit
const INTERVIEW_COST     = 50;   // credits per mock interview
const SUB_PRICE          = 99;   // $99/month
const SUB_CREDITS        = 200;  // credits included
const SUB_EXPIRY_DAYS    = 30;

// ── Persistence ────────────────────────────────────────────
function loadAccount() {
  const raw = localStorage.getItem('ai-learn-account');
  if (raw) return JSON.parse(raw);
  return { credits: 0, subscription: null, transactions: [] };
}

function saveAccount(acc) {
  localStorage.setItem('ai-learn-account', JSON.stringify(acc));
}

function getAccount() {
  const acc = loadAccount();
  // Check subscription expiry
  if (acc.subscription) {
    const expiry = new Date(acc.subscription.expiresAt);
    if (new Date() > expiry) {
      acc.subscription = null;
      saveAccount(acc);
    }
  }
  return acc;
}

function getCredits() {
  return getAccount().credits;
}

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
  const credits = getCredits();
  document.querySelectorAll('.credit-balance').forEach(el => {
    el.textContent = credits + ' credits';
    el.style.color = credits >= INTERVIEW_COST ? '' : '#ef4444';
  });
  // Update start interview button state
  const startBtn = document.getElementById('startInterviewBtn');
  if (startBtn) {
    if (credits >= INTERVIEW_COST) {
      startBtn.disabled = false;
      startBtn.title = '';
    } else {
      startBtn.disabled = false; // still clickable to prompt purchase
    }
  }
}

// ── Payment Modal ──────────────────────────────────────────
function openPaymentModal() {
  document.getElementById('paymentModal').classList.add('open');
  renderPaymentModal();
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('open');
}

function renderPaymentModal() {
  const acc = getAccount();
  const subActive = acc.subscription !== null;
  const expiry = subActive ? new Date(acc.subscription.expiresAt).toLocaleDateString() : null;

  document.getElementById('paymentModalBody').innerHTML = `
    <div class="pm-header">
      <div class="pm-title">Get Credits</div>
      <div class="pm-balance">Current balance: <strong>${acc.credits} credits</strong></div>
      ${subActive ? `<div class="pm-sub-badge">✓ Pro Subscriber — expires ${expiry}</div>` : ''}
    </div>

    <div class="pm-tabs">
      <button class="pm-tab active" onclick="showTab('oneTime')">One-Time Purchase</button>
      <button class="pm-tab" onclick="showTab('subscription')">Monthly Subscription</button>
      <button class="pm-tab" onclick="showTab('history')">Transaction History</button>
    </div>

    <div id="tab-oneTime" class="pm-tab-content active">
      <div class="pm-card">
        <div class="pm-card-title">💳 One-Time Credits</div>
        <div class="pm-card-desc">$1 per credit · No expiry · Use anytime</div>
        <div class="pm-slider-section">
          <label>Credits to purchase: <strong id="sliderVal">50</strong></label>
          <input type="range" id="creditSlider" min="50" max="500" step="10" value="50"
            oninput="updateSlider(this.value)" class="credit-slider">
          <div class="pm-price-row">
            <span>Total: <strong id="sliderPrice">$50.00</strong></span>
            <span class="pm-hint">=  <span id="sliderInterviews">1</span> mock interviews</span>
          </div>
        </div>
        <div class="pm-presets">
          <button class="pm-preset" onclick="setSlider(50)">50 credits<br><small>$50</small></button>
          <button class="pm-preset" onclick="setSlider(100)">100 credits<br><small>$100</small></button>
          <button class="pm-preset" onclick="setSlider(200)">200 credits<br><small>$200</small></button>
          <button class="pm-preset popular" onclick="setSlider(300)">300 credits<br><small>$300 🔥</small></button>
        </div>
        <div class="pm-demo-notice">⚡ Demo mode — payment is simulated</div>
        <button class="pm-buy-btn" onclick="purchaseCredits()">
          Purchase <span id="buyBtnAmount">50</span> Credits
        </button>
      </div>
    </div>

    <div id="tab-subscription" class="pm-tab-content" style="display:none">
      <div class="pm-card pm-card-featured">
        <div class="pm-badge-best">BEST VALUE</div>
        <div class="pm-card-title">⭐ Pro Monthly</div>
        <div class="pm-price-big">$99<span>/month</span></div>
        <div class="pm-card-desc">200 credits per month · $0.50/credit (vs $1 one-time) · Must be used within 30 days</div>
        <ul class="pm-features">
          <li>✓ 4 full mock interviews/month</li>
          <li>✓ Priority question bank updates</li>
          <li>✓ Module completion certificates</li>
          <li>✓ Performance analytics</li>
        </ul>
        ${subActive
          ? `<button class="pm-buy-btn pm-buy-btn-disabled" disabled>✓ Already Subscribed (expires ${expiry})</button>`
          : `<div class="pm-demo-notice">⚡ Demo mode — payment is simulated</div>
             <button class="pm-buy-btn" onclick="purchaseSubscription()">Subscribe for $99/month</button>`
        }
      </div>
      <div class="pm-compare">
        <table class="pm-compare-table">
          <tr><th></th><th>One-Time</th><th>Pro Monthly</th></tr>
          <tr><td>Cost per credit</td><td>$1.00</td><td class="highlight">$0.50</td></tr>
          <tr><td>Credits expire?</td><td>Never</td><td>30 days</td></tr>
          <tr><td>Mock interviews</td><td>1 per 50 credits</td><td class="highlight">4/month</td></tr>
          <tr><td>Analytics</td><td>—</td><td class="highlight">✓</td></tr>
        </table>
      </div>
    </div>

    <div id="tab-history" class="pm-tab-content" style="display:none">
      <div class="pm-card">
        <div class="pm-card-title">📋 Transaction History</div>
        ${acc.transactions.length === 0
          ? '<p style="color:#64748b;text-align:center;padding:20px">No transactions yet</p>'
          : `<div class="pm-tx-list">
              ${acc.transactions.slice().reverse().map(tx => `
                <div class="pm-tx">
                  <span class="pm-tx-icon">${tx.type === 'credit' ? '↑' : '↓'}</span>
                  <div class="pm-tx-detail">
                    <div class="pm-tx-note">${tx.note}</div>
                    <div class="pm-tx-date">${new Date(tx.date).toLocaleString()}</div>
                  </div>
                  <span class="pm-tx-amount ${tx.type}">${tx.type === 'credit' ? '+' : '-'}${tx.amount}</span>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    </div>
  `;
}

function showTab(name) {
  document.querySelectorAll('.pm-tab').forEach((t, i) => {
    const tabs = ['oneTime','subscription','history'];
    t.classList.toggle('active', tabs[i] === name);
  });
  document.querySelectorAll('.pm-tab-content').forEach(c => c.style.display = 'none');
  const target = document.getElementById(`tab-${name}`);
  if (target) target.style.display = 'block';
}

function updateSlider(val) {
  val = parseInt(val);
  document.getElementById('sliderVal').textContent = val;
  document.getElementById('sliderPrice').textContent = '$' + val.toFixed(2);
  document.getElementById('sliderInterviews').textContent = Math.floor(val / INTERVIEW_COST);
  document.getElementById('buyBtnAmount').textContent = val;
}

function setSlider(val) {
  document.getElementById('creditSlider').value = val;
  updateSlider(val);
}

function purchaseCredits() {
  const amount = parseInt(document.getElementById('creditSlider').value);
  showPaymentConfirm(amount, `$${amount}.00`, () => {
    addCredits(amount, `One-time purchase: ${amount} credits`);
    showPaymentSuccess(`${amount} credits added! You can now start mock interviews.`);
  });
}

function purchaseSubscription() {
  showPaymentConfirm(200, '$99.00/month', () => {
    const acc = getAccount();
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + SUB_EXPIRY_DAYS);
    acc.subscription = { startedAt: new Date().toISOString(), expiresAt: expiry.toISOString() };
    addCredits(SUB_CREDITS, 'Pro Monthly subscription: 200 credits');
    saveAccount(acc);
    showPaymentSuccess('Welcome to Pro! 200 credits added, valid for 30 days.');
  });
}

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
