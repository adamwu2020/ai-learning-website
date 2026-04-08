// ============================================================
//  Mailer — Nodemailer with Ethereal fallback
// ============================================================
const nodemailer = require('nodemailer');

let transporter = null;
let testAccount = null;

async function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, SMTP_SECURE } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    // Real SMTP
    transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   parseInt(SMTP_PORT || '587'),
      secure: SMTP_SECURE === 'true',
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    });
    console.log(`📧 Mailer: using SMTP ${SMTP_HOST}`);
  } else {
    // Ethereal test account (captures emails — no real sending)
    testAccount = await nodemailer.createTestAccount();
    transporter  = nodemailer.createTransport({
      host:   'smtp.ethereal.email',
      port:   587,
      secure: false,
      auth:   { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('📧 Mailer: using Ethereal test account (no real emails sent)');
    console.log(`   Preview URL: https://ethereal.email/messages`);
    console.log(`   Login: ${testAccount.user} / ${testAccount.pass}`);
  }

  return transporter;
}

// ── Send password-reset email ──────────────────────────────
async function sendPasswordReset({ to, name, resetLink }) {
  const t = await getTransporter();

  const info = await t.sendMail({
    from:    `"AI Learning" <${process.env.EMAIL_FROM || 'noreply@ai-learning.app'}>`,
    to,
    subject: 'Reset your AI Learning password',
    text: `
Hi ${name},

You requested a password reset for your AI Learning account.

Click the link below to choose a new password (valid for 1 hour):
${resetLink}

If you didn't request this, you can safely ignore this email.

— The AI Learning Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e1b4b,#4f46e5);padding:32px 40px;text-align:center">
      <div style="font-size:36px;margin-bottom:8px">🤖</div>
      <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">AI Learning</div>
      <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px">Student's Complete Guide</div>
    </div>
    <!-- Body -->
    <div style="padding:36px 40px">
      <h1 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px">Password Reset Request</h1>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">
        Hi <strong>${name}</strong>, we received a request to reset your password. Click the button below to choose a new one.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${resetLink}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.2px">
          Reset My Password
        </a>
      </div>
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e">
          ⏰ This link expires in <strong>1 hour</strong>. After that, you'll need to request a new one.
        </p>
      </div>
      <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0">
        If you didn't request a password reset, no action is needed — your password will remain unchanged.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#94a3b8;font-size:12px;margin:0">
        Can't click the button? Copy and paste this link:<br>
        <span style="color:#6366f1;word-break:break-all">${resetLink}</span>
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  });

  // For Ethereal: log the preview URL so devs can see the email
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`\n📧 Password reset email preview: ${previewUrl}\n`);
  }

  return { messageId: info.messageId, previewUrl };
}

module.exports = { sendPasswordReset };
