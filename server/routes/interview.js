// ============================================================
//  Interview Grading — GPT-powered answer evaluation
// ============================================================
const express = require('express');
const OpenAI  = require('openai');
const { authMiddleware } = require('./auth');

const router = express.Router();

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey: key });
}

// ── POST /api/interview/grade ──────────────────────────────
// Body: { question, userAnswer, groundTruth }
// Returns: { score: 0-5, feedback: string }
router.post('/grade', authMiddleware, async (req, res) => {
  const { question, userAnswer, groundTruth } = req.body;

  if (!question || !groundTruth) {
    return res.status(400).json({ error: 'question and groundTruth are required' });
  }

  if (!userAnswer || !userAnswer.trim()) {
    return res.json({ score: 0, feedback: 'No answer was provided.' });
  }

  let openai;
  try {
    openai = getOpenAI();
  } catch {
    return res.status(503).json({ error: 'AI grading is not configured. Add OPENAI_API_KEY to server .env.' });
  }

  const prompt = `You are an expert technical interviewer grading a candidate's answer.

Question:
${question}

Ground Truth Answer (reference):
${groundTruth}

Candidate's Answer:
${userAnswer}

Score the candidate's answer from 0 to 5 using this rubric:
- 5: Complete, accurate, and well-articulated. Covers all key points.
- 4: Mostly correct with minor omissions or imprecise wording.
- 3: Partially correct. Covers the main idea but misses important details.
- 2: Shows some understanding but has significant gaps or errors.
- 1: Minimal relevant content. Major misunderstanding of the topic.
- 0: Irrelevant, blank, or completely incorrect.

Respond with a JSON object only — no extra text:
{"score": <integer 0-5>, "feedback": "<2-3 sentences explaining the score, what was good, and what was missing>"}`;

  try {
    const completion = await openai.chat.completions.create({
      model:           process.env.OPENAI_GRADE_MODEL || 'gpt-4o-mini',
      messages:        [{ role: 'user', content: prompt }],
      temperature:     0.2,
      max_tokens:      300,
      response_format: { type: 'json_object' },
    });

    const text   = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(text);

    const score    = Math.min(5, Math.max(0, Math.round(Number(parsed.score))));
    const feedback = String(parsed.feedback || '').trim();

    res.json({ score, feedback });
  } catch (err) {
    console.error('OpenAI grading error:', err.message);
    if (err.status === 429) {
      return res.status(429).json({ error: 'AI grading rate limit reached. Please wait a moment and try again.' });
    }
    res.status(500).json({ error: 'Grading failed: ' + err.message });
  }
});

module.exports = { router };
