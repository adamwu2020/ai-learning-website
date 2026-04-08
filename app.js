// ============================================================
//  AI Learning Website - Navigation & Interactivity
// ============================================================

const MODULES = [
  { id: 'home',      label: 'Home',                  icon: '🏠', num: '' },
  { id: 'mod1',      label: 'Using LLMs',             icon: '🤖', num: 'Module 01' },
  { id: 'mod2',      label: 'Prompt Engineering',      icon: '✍️',  num: 'Module 02' },
  { id: 'mod3',      label: 'Few-Shot Learning',       icon: '🎯', num: 'Module 03' },
  { id: 'mod4',      label: 'Supervised Fine-Tuning',  icon: '🔧', num: 'Module 04' },
  { id: 'mod5',      label: 'RL with LLM-as-Judge',    icon: '🏆', num: 'Module 05' },
  { id: 'mod6',      label: 'RAG Systems',             icon: '🔍', num: 'Module 06' },
  { id: 'mod7',      label: 'Agent Systems',           icon: '🕸️', num: 'Module 07' },
  { id: 'interview', label: 'Mock Interview',          icon: '🎯', num: 'Practice', special: true },
];

const GATED_IDS = new Set(['mod1','mod2','mod3','mod4','mod5','mod6','mod7','interview']);


let completed = new Set(JSON.parse(localStorage.getItem('ai-learn-completed') || '[]'));
let current = 'home';

// ── Navigate ───────────────────────────────────────────────
// Single function — no overrides, no chains
function navigate(id) {
  console.log('[nav] navigate called:', id, '| currentUser:', typeof currentUser !== 'undefined' ? (currentUser ? currentUser.email : 'null') : 'UNDEFINED', '| trial_active:', typeof currentUser !== 'undefined' && currentUser ? currentUser.trial_active : 'N/A');
  // Trial / subscription gate for module IDs
  if (GATED_IDS.has(id)) {
    const accessOk = (typeof hasModuleAccess === 'function')
      ? hasModuleAccess()
      : true; // auth.js not loaded yet → allow through

    console.log('[nav] gated:', id, '| accessOk:', accessOk);
    if (!accessOk) {
      showPaywall(id);
      return;
    }
  }

  // Show the requested section
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';  // clear any forced display
  });
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';  // force visible regardless of CSS cascade
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  current = id;
  buildSidebar();
  updateProgress();
  history.pushState({}, '', '#' + id);

  // Interview-specific init
  if (id === 'interview' && typeof renderInterviewSetup === 'function') {
    if (typeof interviewState === 'undefined' || !interviewState.active) {
      renderInterviewSetup();
    }
  }
}

// ── Paywall ────────────────────────────────────────────────
function showPaywall(attemptedId) {
  // Navigate to the paywall section directly
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  const pw = document.getElementById('paywall');
  if (pw) {
    pw.classList.add('active');
    pw.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  current = 'paywall';
  buildSidebar();
  history.pushState({}, '', '#paywall');

  const name = MODULE_NAMES[attemptedId] || 'this module';
  const el = document.getElementById('paywall-content');
  if (!el) return;
  el.innerHTML = `
    <div class="pw-wrap">
      <div class="pw-icon">🔒</div>
      <div class="pw-label">Free Trial Ended</div>
      <h1 class="pw-title">Unlock <span class="pw-mod-name">${name}</span></h1>
      <p class="pw-sub">Your 7-day free trial has ended. Upgrade to continue learning — all 7 modules, 350+ Q&amp;As, and mock interviews.</p>
      <div class="pw-plans">
        <div class="pw-plan">
          <div class="pw-plan-icon">💰</div>
          <div class="pw-plan-name">Pay-as-you-go</div>
          <div class="pw-plan-price"><span class="pw-big">$1</span><span class="pw-unit">/credit</span></div>
          <div class="pw-plan-note">50 credits = 1 full module unlock</div>
          <ul class="pw-plan-features">
            <li>✓ Access individual modules</li>
            <li>✓ Credits never expire</li>
            <li>✓ Buy only what you need</li>
          </ul>
          <button class="pw-btn-outline" onclick="openPaymentModal()">Buy Credits</button>
        </div>
        <div class="pw-plan pw-plan-featured">
          <div class="pw-plan-badge">Best Value</div>
          <div class="pw-plan-icon">⚡</div>
          <div class="pw-plan-name">Pro Monthly</div>
          <div class="pw-plan-price"><span class="pw-big">$99</span><span class="pw-unit">/mo</span></div>
          <div class="pw-plan-note">200 credits · valid 30 days</div>
          <ul class="pw-plan-features">
            <li>✓ Unlimited module access</li>
            <li>✓ 4 mock interviews/month</li>
            <li>✓ All 350 Q&amp;As</li>
          </ul>
          <button class="pw-btn-primary" onclick="openPaymentModal()">Go Pro →</button>
        </div>
      </div>
      <button class="pw-back-btn" onclick="navigate('home')">← Back to Home</button>
    </div>
  `;
}

// ── Build Sidebar ──────────────────────────────────────────
function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const courseModules   = MODULES.filter(m => !m.special);
  const practiceModules = MODULES.filter(m => m.special);

  sidebar.innerHTML = `<div class="sidebar-section-label">Course Modules</div>`;
  courseModules.forEach(m => {
    const item = document.createElement('div');
    item.className = `nav-item ${m.id === current ? 'active' : ''}`;
    item.dataset.id = m.id;
    const isDone = completed.has(m.id) && m.id !== 'home';
    item.innerHTML = `
      <div class="nav-icon">${m.icon}</div>
      <div>
        <div class="nav-label">${m.label}</div>
        ${m.num ? `<div class="nav-num">${m.num}</div>` : ''}
      </div>
      ${m.id !== 'home' ? `<div class="nav-check ${isDone ? 'done' : ''}">✓</div>` : ''}
    `;
    item.addEventListener('click', () => navigate(m.id));
    sidebar.appendChild(item);
  });

  const practiceLabel = document.createElement('div');
  practiceLabel.className = 'sidebar-section-label';
  practiceLabel.style.marginTop = '12px';
  practiceLabel.textContent = 'Practice';
  sidebar.appendChild(practiceLabel);

  practiceModules.forEach(m => {
    const item = document.createElement('div');
    item.className = `nav-item nav-item-practice ${m.id === current ? 'active' : ''}`;
    item.innerHTML = `
      <div class="nav-icon" style="background:rgba(99,102,241,0.2)">${m.icon}</div>
      <div>
        <div class="nav-label">${m.label}</div>
        <div class="nav-num">${m.num}</div>
      </div>
      <div class="nav-credit-pill"><span class="credit-balance" style="font-size:10px">0 cr</span></div>
    `;
    item.addEventListener('click', () => navigate(m.id));
    sidebar.appendChild(item);

    const browseItem = document.createElement('div');
    browseItem.className = 'nav-item';
    browseItem.style.paddingLeft = '48px';
    browseItem.innerHTML = `<div style="font-size:12.5px;color:#475569">📚 Browse Q&A</div>`;
    browseItem.addEventListener('click', () => {
      navigate('interview');
      if (typeof renderQuestionBrowser === 'function') renderQuestionBrowser('all');
      setIvTab('browse');
    });
    sidebar.appendChild(browseItem);
  });
}

// ── Progress ───────────────────────────────────────────────
function updateProgress() {
  const total = MODULES.length - 1;
  const done  = completed.size;
  const pct   = Math.round((done / total) * 100);
  const fill  = document.querySelector('.progress-fill');
  const info  = document.querySelector('.progress-info');
  if (fill) fill.style.width = pct + '%';
  if (info) info.textContent = `${done}/${total} modules`;
}

function markDone(id) {
  completed.add(id);
  localStorage.setItem('ai-learn-completed', JSON.stringify([...completed]));
  buildSidebar();
  updateProgress();
  const btn = document.querySelector(`#${id} .done-btn`);
  if (btn) { btn.textContent = '✓ Completed!'; btn.classList.add('completed'); btn.disabled = true; }
}

// ── Copy Code ──────────────────────────────────────────────
document.addEventListener('click', (e) => {
  // Copy button
  if (e.target.classList.contains('copy-btn')) {
    const block = e.target.closest('.code-block');
    const code  = block?.querySelector('code')?.innerText;
    if (code) navigator.clipboard.writeText(code).then(() => {
      e.target.textContent = 'Copied!';
      e.target.classList.add('copied');
      setTimeout(() => { e.target.textContent = 'Copy'; e.target.classList.remove('copied'); }, 2000);
    });
    return;
  }

  // Module card click (app home section)
  const card = e.target.closest('.module-card[data-target]');
  if (card) { navigate(card.dataset.target); return; }

  // Nav buttons ([data-nav])
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) { navigate(navBtn.dataset.nav); return; }

  // Done buttons ([data-done])
  const doneBtn = e.target.closest('[data-done]');
  if (doneBtn) { markDone(doneBtn.dataset.done); return; }
});

// ── Interview Tab Toggle ───────────────────────────────────
function setIvTab(name) {
  document.querySelectorAll('.iv-tab-btn').forEach(b => {
    b.classList.toggle('iv-tab-active', b.textContent.toLowerCase().includes(
      name === 'practice' ? 'practice' : 'question'
    ));
  });
  if (name === 'browse' && typeof renderQuestionBrowser === 'function') renderQuestionBrowser('all');
  else if (typeof renderInterviewSetup === 'function') renderInterviewSetup();
}

// ── Init ───────────────────────────────────────────────────
function init() {
  buildSidebar();
  updateProgress();
  completed.forEach(id => {
    const btn = document.querySelector(`#${id} .done-btn`);
    if (btn) { btn.textContent = '✓ Completed!'; btn.classList.add('completed'); btn.disabled = true; }
  });
}

// Called by auth.js after login/session-restore
function initAppNav() {
  navigate('home');
}

// ── Patch payment functions to prefer server when logged in ─
document.addEventListener('DOMContentLoaded', () => {
  const origBuyCredits  = typeof purchaseCredits      !== 'undefined' ? purchaseCredits      : null;
  const origSubscribe   = typeof purchaseSubscription !== 'undefined' ? purchaseSubscription : null;

  if (origBuyCredits) {
    window.purchaseCredits = function() {
      if (typeof currentUser !== 'undefined' && currentUser) {
        const amount = parseInt(document.getElementById('creditSlider')?.value || '50');
        showPaymentConfirm(amount, `$${amount}.00`, async () => {
          try {
            await serverAddCredits(amount, `One-time purchase: ${amount} credits`);
            await syncCreditsFromServer();
            showPaymentSuccess(`${amount} credits added to your account!`);
          } catch (err) { alert('Error: ' + err.message); }
        });
      } else { origBuyCredits(); }
    };
  }

  if (origSubscribe) {
    window.purchaseSubscription = function() {
      if (typeof currentUser !== 'undefined' && currentUser) {
        showPaymentConfirm(200, '$99.00/month', async () => {
          try {
            await serverSubscribe();
            showPaymentSuccess('Welcome to Pro! 200 credits added, valid for 30 days.');
          } catch (err) { alert('Error: ' + err.message); }
        });
      } else { origSubscribe(); }
    };
  }
});

document.addEventListener('DOMContentLoaded', init);
