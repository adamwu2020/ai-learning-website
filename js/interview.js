// ============================================================
//  Mock Interview Engine
// ============================================================

const QUESTIONS_PER_INTERVIEW = 10;
const INTERVIEW_COST_CREDITS  = 50;

let interviewState = {
  active:       false,
  questions:    [],
  currentIdx:   0,
  answers:      [],
  startTime:    null,
  moduleId:     'all',
  results:      null,
};

// ── Module Config ──────────────────────────────────────────
const MODULE_NAMES = {
  all:  'All Modules',
  mod1: 'Module 1 — Using LLMs',
  mod2: 'Module 2 — Prompt Engineering',
  mod3: 'Module 3 — Few-Shot Learning',
  mod4: 'Module 4 — Supervised Fine-Tuning',
  mod5: 'Module 5 — RL with LLM-as-Judge',
  mod6: 'Module 6 — RAG Systems',
  mod7: 'Module 7 — Agent Systems',
};

// ── Open the Interview Setup Screen ───────────────────────
function openInterviewSetup() {
  navigate('interview');
  renderInterviewSetup();
}

function renderInterviewSetup() {
  const credits    = (typeof getCreditsValue === 'function') ? getCreditsValue() : getCredits();
  const subscribed = (typeof hasActiveSubscription === 'function') && hasActiveSubscription();
  const hasCredits = subscribed || credits >= INTERVIEW_COST_CREDITS;

  document.getElementById('interview-content').innerHTML = `
    <div class="iv-setup-hero">
      <div class="iv-hero-icon">🎯</div>
      <h1>Mock Interview</h1>
      <p>Practice with ${QUESTIONS_PER_INTERVIEW} randomly sampled questions. Get instant model answers to compare with your own.${subscribed ? ' <strong>Included in your subscription.</strong>' : ` Each session costs <strong>${INTERVIEW_COST_CREDITS} credits</strong>.`}</p>
    </div>

    <div class="iv-credit-bar">
      <div class="iv-credit-info">
        ${subscribed
          ? `<span>✅ Active subscription — mock interviews included</span>`
          : `<span>💰 Your balance:</span>
             <strong class="credit-balance">${credits} credits</strong>
             ${!hasCredits ? '<span class="iv-low-credit">— Need 50 more credits to start</span>' : ''}`
        }
      </div>
      ${!subscribed ? `<button class="iv-buy-btn" onclick="openPaymentModal()">${hasCredits ? '+ Buy More' : '🔒 Buy Credits'}</button>` : ''}
    </div>

    <div class="iv-setup-grid">
      <div class="iv-setup-card">
        <h3>📚 Select Module</h3>
        <div class="iv-module-select">
          ${Object.entries(MODULE_NAMES).map(([id, name]) => `
            <label class="iv-module-option">
              <input type="radio" name="moduleSelect" value="${id}" ${id === 'all' ? 'checked' : ''}>
              <span>${name}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="iv-setup-card">
        <h3>⚙️ Session Settings</h3>
        <div class="iv-settings">
          <label class="iv-setting-row">
            <span>Questions per session</span>
            <select id="qCount" class="iv-select">
              <option value="5">5 questions</option>
              <option value="10" selected>10 questions</option>
              <option value="15">15 questions</option>
              <option value="20">20 questions</option>
            </select>
          </label>
          <label class="iv-setting-row">
            <span>Difficulty filter</span>
            <select id="diffFilter" class="iv-select">
              <option value="all">All difficulties</option>
              <option value="easy">Easy only</option>
              <option value="medium">Medium only</option>
              <option value="hard">Hard only</option>
              <option value="medium+hard">Medium + Hard</option>
            </select>
          </label>
          <label class="iv-setting-row">
            <span>Show timer</span>
            <input type="checkbox" id="showTimer" checked style="width:auto">
          </label>
        </div>

        <div class="iv-cost-box">
          ${subscribed
            ? `<div class="iv-cost-row"><span>Session cost</span><strong style="color:var(--success)">✓ Covered by subscription</strong></div>`
            : `<div class="iv-cost-row"><span>Session cost</span><strong>${INTERVIEW_COST_CREDITS} credits</strong></div>
               <div class="iv-cost-row"><span>Your balance</span><strong class="credit-balance" style="color:${hasCredits ? 'var(--success)' : 'var(--danger)'}">${credits} credits</strong></div>
               ${hasCredits ? `<div class="iv-cost-row"><span>After session</span><strong>${credits - INTERVIEW_COST_CREDITS} credits</strong></div>` : ''}`
          }
        </div>

        <button id="startInterviewBtn" class="iv-start-btn ${!hasCredits ? 'iv-start-locked' : ''}"
          onclick="${hasCredits ? 'startInterview()' : 'openPaymentModal()'}">
          ${hasCredits ? '🚀 Start Mock Interview' : '🔒 Purchase Subscription to Start'}
        </button>
      </div>
    </div>

    <div class="iv-how-it-works">
      <h3>How it works</h3>
      <div class="iv-steps">
        <div class="iv-step"><div class="iv-step-num">1</div><div>Answer each question in your own words — type freely, as you would in a real interview.</div></div>
        <div class="iv-step"><div class="iv-step-num">2</div><div>After each answer, the model answer is revealed. Rate yourself 1–5 to track progress.</div></div>
        <div class="iv-step"><div class="iv-step-num">3</div><div>Review your session summary with scores and areas to improve.</div></div>
      </div>
    </div>
  `;
}

// ── Start Interview ────────────────────────────────────────
async function startInterview() {
  // Subscribers (including coupon trial) get free mock interviews
  const subscribed = (typeof hasActiveSubscription === 'function') && hasActiveSubscription();
  if (!subscribed) {
    const deduct = (typeof serverDeductCredits === 'function') ? serverDeductCredits : deductCredits;
    const ok = await deduct(INTERVIEW_COST_CREDITS, 'Mock interview session');
    if (!ok) { openPaymentModal(); return; }
  }

  const moduleId  = document.querySelector('input[name="moduleSelect"]:checked')?.value || 'all';
  const qCount    = parseInt(document.getElementById('qCount')?.value || '10');
  const diff      = document.getElementById('diffFilter')?.value || 'all';
  const showTimer = document.getElementById('showTimer')?.checked ?? true;

  // Sample questions
  let pool = QUESTION_BANK[moduleId] || QUESTION_BANK.all;

  if (diff !== 'all') {
    const allowed = diff === 'medium+hard' ? ['medium','hard'] : [diff];
    pool = pool.filter(q => allowed.includes(q.difficulty));
  }

  if (pool.length === 0) {
    alert('No questions match these filters. Please adjust your settings.');
    addCredits(INTERVIEW_COST_CREDITS, 'Refund — no questions matched filter');
    return;
  }

  // Fisher-Yates shuffle, take first qCount
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(qCount, pool.length));

  interviewState = {
    active:     true,
    questions:  shuffled,
    currentIdx: 0,
    answers:    [],
    startTime:  Date.now(),
    moduleId,
    showTimer,
    results:    null,
  };

  renderQuestion();
}

// ── Render Current Question ────────────────────────────────
function renderQuestion() {
  const { questions, currentIdx, showTimer } = interviewState;
  const q = questions[currentIdx];
  const total = questions.length;
  const progress = Math.round((currentIdx / total) * 100);

  const diffColor = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' }[q.difficulty];
  const diffLabel = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[q.difficulty];

  document.getElementById('interview-content').innerHTML = `
    <div class="iv-progress-bar-wrap">
      <div class="iv-progress-info">
        <span>Question ${currentIdx + 1} of ${total}</span>
        <span class="iv-diff-badge" style="background:${diffColor}20;color:${diffColor}">${diffLabel}</span>
        ${showTimer ? `<span id="iv-timer" class="iv-timer">0:00</span>` : ''}
      </div>
      <div class="iv-progress-track">
        <div class="iv-progress-fill" style="width:${progress}%"></div>
      </div>
    </div>

    <div class="iv-question-card">
      <div class="iv-q-num">Q${currentIdx + 1}</div>
      <div class="iv-q-text">${q.q}</div>
      <div class="iv-q-tags">
        ${q.tags.map(t => `<span class="iv-tag">${t}</span>`).join('')}
      </div>
    </div>

    <div class="iv-answer-section">
      <label class="iv-answer-label">Your Answer</label>
      <textarea id="userAnswer" class="iv-textarea"
        placeholder="Type your answer here... Explain as clearly as you would in a real technical interview."
        rows="8"></textarea>
      <div class="iv-answer-actions">
        <span id="wordCount" class="iv-word-count">0 words</span>
        <button class="iv-submit-btn" onclick="submitAnswer()">
          Submit Answer <span style="opacity:0.7">→</span>
        </button>
      </div>
    </div>

    <div class="iv-skip-row">
      <button class="iv-skip-btn" onclick="skipQuestion()">Skip this question →</button>
    </div>
  `;

  // Word counter
  document.getElementById('userAnswer').addEventListener('input', function() {
    const words = this.value.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById('wordCount').textContent = words + ' words';
  });

  // Timer
  if (showTimer) {
    let elapsed = 0;
    interviewState.timerInterval = setInterval(() => {
      elapsed++;
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      const el = document.getElementById('iv-timer');
      if (el) el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      else clearInterval(interviewState.timerInterval);
    }, 1000);
  }

  document.getElementById('userAnswer').focus();
}

// ── Submit Answer → GPT Grading → Show Result ─────────────
async function submitAnswer() {
  clearInterval(interviewState.timerInterval);
  const answer = document.getElementById('userAnswer')?.value.trim() || '';
  const q = interviewState.questions[interviewState.currentIdx];

  interviewState._pendingAnswer = answer;

  const isLast = interviewState.currentIdx + 1 >= interviewState.questions.length;

  // Show answers + loading state while GPT grades
  document.getElementById('interview-content').innerHTML = `
    <div class="iv-reveal-card">
      <div class="iv-reveal-header">
        <div class="iv-q-num">Q${interviewState.currentIdx + 1}</div>
        <div class="iv-q-text">${q.q}</div>
      </div>

      <div class="iv-two-col">
        <div class="iv-answer-box iv-your-answer">
          <div class="iv-answer-box-label">👤 Your Answer</div>
          <div class="iv-answer-text">${answer || '<em style="color:#94a3b8">Skipped</em>'}</div>
        </div>
        <div class="iv-answer-box iv-model-answer">
          <div class="iv-answer-box-label">🤖 Model Answer</div>
          <div class="iv-answer-text">${q.a}</div>
        </div>
      </div>

      <div id="iv-grade-section" class="iv-grade-section">
        <div class="iv-grade-loading">
          <span class="iv-grade-spinner"></span> Grading your answer with AI…
        </div>
      </div>

      <div id="iv-next-section" style="display:none;margin-top:16px;text-align:center">
        <button class="iv-submit-btn" onclick="nextQuestion()">
          ${isLast ? 'See Results 🏆' : 'Next Question →'}
        </button>
      </div>
    </div>
  `;

  // Call grading API
  try {
    const data = await apiFetch('/interview/grade', {
      method: 'POST',
      body: { question: q.q, userAnswer: answer, groundTruth: q.a },
    });
    interviewState._pendingRating = data.score;
    renderGradeResult(data.score, data.feedback);
  } catch (err) {
    interviewState._pendingRating = 0;
    renderGradeResult(null, err.message);
  }
}

function renderGradeResult(score, feedback) {
  const gradeEl = document.getElementById('iv-grade-section');
  if (!gradeEl) return;

  const scoreColors = { 5:'#10b981', 4:'#6366f1', 3:'#f59e0b', 2:'#f97316', 1:'#ef4444', 0:'#94a3b8' };
  const scoreLabels = { 5:'Excellent', 4:'Very Good', 3:'Good', 2:'Fair', 1:'Poor', 0:'Not Scored' };

  if (score === null) {
    gradeEl.innerHTML = `
      <div class="iv-grade-error">
        ⚠️ AI grading unavailable: ${feedback}
      </div>`;
  } else {
    const color = scoreColors[score] || '#94a3b8';
    const label = scoreLabels[score] || '';
    gradeEl.innerHTML = `
      <div class="iv-grade-result">
        <div class="iv-grade-score-row">
          <div class="iv-grade-score-badge" style="background:${color}18;border:2px solid ${color};color:${color}">
            <span class="iv-grade-num">${score}</span><span class="iv-grade-denom">/5</span>
          </div>
          <div class="iv-grade-label" style="color:${color}">${label}</div>
        </div>
        <div class="iv-grade-feedback">
          <div class="iv-grade-feedback-title">AI Feedback</div>
          <div class="iv-grade-feedback-text">${feedback}</div>
        </div>
      </div>`;
  }

  document.getElementById('iv-next-section').style.display = 'block';
}

function skipQuestion() {
  clearInterval(interviewState.timerInterval);
  interviewState._pendingAnswer = '';
  interviewState._pendingRating = 0;
  nextQuestion();
}

function nextQuestion() {
  // Save answer
  const q = interviewState.questions[interviewState.currentIdx];
  interviewState.answers.push({
    question: q,
    userAnswer: interviewState._pendingAnswer || '',
    rating: interviewState._pendingRating || 0,
  });
  interviewState._pendingAnswer = '';
  interviewState._pendingRating = 0;

  interviewState.currentIdx++;

  if (interviewState.currentIdx >= interviewState.questions.length) {
    showResults();
  } else {
    renderQuestion();
  }
}

// ── Results Screen ─────────────────────────────────────────
function showResults() {
  clearInterval(interviewState.timerInterval);
  const { answers, startTime, moduleId, questions } = interviewState;

  const totalRated = answers.filter(a => a.rating > 0).length;
  const avgRating  = totalRated > 0
    ? (answers.reduce((s, a) => s + a.rating, 0) / totalRated).toFixed(1)
    : '—';
  const duration   = Math.round((Date.now() - startTime) / 60000);
  const skipped    = answers.filter(a => !a.userAnswer).length;

  // Save to history
  const session = {
    date:       new Date().toISOString(),
    module:     MODULE_NAMES[moduleId],
    questions:  questions.length,
    avgRating,
    duration,
    answers:    answers.map(a => ({ qId: a.question.id, rating: a.rating })),
  };
  const history = JSON.parse(localStorage.getItem('ai-learn-interview-history') || '[]');
  history.push(session);
  localStorage.setItem('ai-learn-interview-history', JSON.stringify(history.slice(-20)));

  const ratingBars = [5,4,3,2,1].map(r => {
    const count = answers.filter(a => a.rating === r).length;
    const pct   = questions.length > 0 ? Math.round((count / questions.length) * 100) : 0;
    const colors = {5:'#10b981', 4:'#6366f1', 3:'#f59e0b', 2:'#f97316', 1:'#ef4444'};
    const labels = {5:'Excellent', 4:'Very Good', 3:'Good', 2:'Fair', 1:'Poor'};
    return `
      <div class="iv-bar-row">
        <span class="iv-bar-label">${r} — ${labels[r]}</span>
        <div class="iv-bar-track">
          <div class="iv-bar-fill" style="width:${pct}%;background:${colors[r]}"></div>
        </div>
        <span class="iv-bar-count">${count}</span>
      </div>`;
  }).join('');

  const performanceLabel =
    avgRating >= 4.5 ? 'Excellent! 🏆 You\'re interview-ready!'
    : avgRating >= 3.5 ? 'Great job! 👍 Minor gaps to review.'
    : avgRating >= 2.5 ? 'Good progress! 📚 Review key concepts.'
    : '📖 Keep studying — practice makes perfect!';

  document.getElementById('interview-content').innerHTML = `
    <div class="iv-results">
      <div class="iv-results-hero">
        <div class="iv-results-icon">🏆</div>
        <h1>Interview Complete!</h1>
        <p>${performanceLabel}</p>
      </div>

      <div class="iv-results-stats">
        <div class="iv-stat-box">
          <div class="iv-stat-val">${avgRating}</div>
          <div class="iv-stat-label">Avg AI Score</div>
        </div>
        <div class="iv-stat-box">
          <div class="iv-stat-val">${questions.length - skipped}</div>
          <div class="iv-stat-label">Answered</div>
        </div>
        <div class="iv-stat-box">
          <div class="iv-stat-val">${skipped}</div>
          <div class="iv-stat-label">Skipped</div>
        </div>
        <div class="iv-stat-box">
          <div class="iv-stat-val">${duration}m</div>
          <div class="iv-stat-label">Duration</div>
        </div>
      </div>

      <div class="iv-results-card">
        <h3>Rating Distribution</h3>
        <div class="iv-bars">${ratingBars}</div>
      </div>

      <div class="iv-results-card">
        <h3>Question Review <span style="font-size:13px;font-weight:400;color:#64748b">— AI scored</span></h3>
        <div class="iv-review-list">
          ${answers.map((a, i) => {
            const colors = {5:'#10b981', 4:'#6366f1', 3:'#f59e0b', 2:'#f97316', 1:'#ef4444', 0:'#94a3b8'};
            const labels = {5:'Excellent', 4:'Very Good', 3:'Good', 2:'Fair', 1:'Poor', 0:'Skipped'};
            return `
              <details class="iv-review-item">
                <summary>
                  <span class="iv-review-num">Q${i+1}</span>
                  <span class="iv-review-q">${a.question.q.substring(0, 70)}...</span>
                  <span class="iv-review-rating" style="background:${colors[a.rating]}20;color:${colors[a.rating]}">${labels[a.rating]}</span>
                </summary>
                <div class="iv-review-detail">
                  <div class="iv-review-section">
                    <strong>Your Answer:</strong>
                    <p>${a.userAnswer || '<em>Skipped</em>'}</p>
                  </div>
                  <div class="iv-review-section">
                    <strong>Model Answer:</strong>
                    <p>${a.question.a}</p>
                  </div>
                </div>
              </details>
            `;
          }).join('')}
        </div>
      </div>

      <div class="iv-results-actions">
        <button class="nav-btn" onclick="renderInterviewSetup()">← New Interview</button>
        <button class="nav-btn primary" onclick="navigate('home')">🏠 Back to Home</button>
      </div>
    </div>
  `;

  interviewState.active = false;
}

// ── Question Browser (Q&A Reference) ──────────────────────
function renderQuestionBrowser(moduleId = 'all') {
  const questions = QUESTION_BANK[moduleId] || QUESTION_BANK.all;
  const stats = {
    easy:   questions.filter(q => q.difficulty === 'easy').length,
    medium: questions.filter(q => q.difficulty === 'medium').length,
    hard:   questions.filter(q => q.difficulty === 'hard').length,
  };

  document.getElementById('interview-content').innerHTML = `
    <div class="section-header">
      <div class="section-badge" style="--badge-bg:#ecfeff; --badge-color:#0e7490;">📚 Question Bank</div>
      <h1>Browse Interview Questions</h1>
      <p>All ${questions.length} questions for ${MODULE_NAMES[moduleId]}. Click any question to expand the model answer.</p>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      ${Object.entries(MODULE_NAMES).map(([id, name]) => `
        <button onclick="renderQuestionBrowser('${id}')"
          style="padding:6px 14px;border-radius:20px;border:1px solid ${id === moduleId ? '#6366f1' : '#e2e8f0'};background:${id === moduleId ? '#6366f1' : '#fff'};color:${id === moduleId ? '#fff' : '#64748b'};cursor:pointer;font-size:12.5px;font-weight:600">
          ${id === 'all' ? 'All' : name.split(' — ')[0]}
        </button>
      `).join('')}
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px">
      <span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600">Easy: ${stats.easy}</span>
      <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600">Medium: ${stats.medium}</span>
      <span style="background:#fee2e2;color:#991b1b;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600">Hard: ${stats.hard}</span>
    </div>

    <div class="iv-qbrowser">
      ${questions.map((q, i) => {
        const dc = {easy:'#10b981', medium:'#f59e0b', hard:'#ef4444'}[q.difficulty];
        return `
          <details class="iv-qb-item">
            <summary>
              <span class="iv-qb-num">${i+1}</span>
              <span class="iv-qb-q">${q.q}</span>
              <span class="iv-diff-badge" style="background:${dc}20;color:${dc};flex-shrink:0">${q.difficulty}</span>
            </summary>
            <div class="iv-qb-answer">${q.a}</div>
          </details>`;
      }).join('')}
    </div>
  `;
}
