// emailService.js — Nodemailer + HTML email templates
const nodemailer = require('nodemailer');

// ── Transporter ───────────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Base email layout ─────────────────────────────────────────────────────────
function baseTemplate(content) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  body{margin:0;padding:0;background:#f5f4f0;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
  .header{background:#0f1e32;padding:28px 36px;border-bottom:3px solid #c9a84c;}
  .logo{display:flex;align-items:center;gap:10px;}
  .logo-mark{width:38px;height:38px;background:#c9a84c;clip-path:polygon(50% 0%,100% 35%,100% 100%,0 100%,0 35%);display:flex;align-items:center;justify-content:center;color:#0f1e32;font-weight:900;font-size:13px;text-align:center;line-height:1;}
  .logo-name{color:#fff;font-size:22px;font-weight:700;letter-spacing:.02em;}
  .logo-tag{color:#c9a84c;font-size:10px;letter-spacing:.18em;text-transform:uppercase;display:block;}
  .body{padding:36px;}
  .ref-box{background:#f5f4f0;border-left:4px solid #c9a84c;padding:12px 16px;margin:20px 0;border-radius:0 4px 4px 0;}
  .ref-box strong{display:block;font-size:18px;color:#0f1e32;letter-spacing:.05em;}
  .ref-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:4px;}
  .btn{display:inline-block;background:#0f1e32;color:#fff;text-decoration:none;padding:13px 28px;border-radius:2px;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:20px 0;}
  .btn-gold{background:#c9a84c;color:#0f1e32;}
  .divider{border:none;border-top:1px solid #e8e6e1;margin:24px 0;}
  .footer-bar{background:#0f1e32;padding:18px 36px;text-align:center;color:rgba(255,255,255,.4);font-size:11px;line-height:1.8;}
  h2{color:#0f1e32;font-size:22px;margin:0 0 12px;}
  p{color:#374151;font-size:14px;line-height:1.8;margin:8px 0;}
  .detail-table{width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;}
  .detail-table td{padding:8px 10px;border-bottom:1px solid #e8e6e1;color:#374151;}
  .detail-table td:first-child{font-weight:700;color:#0f1e32;width:40%;text-transform:uppercase;font-size:11px;letter-spacing:.06em;}
  .status-badge{display:inline-block;padding:4px 12px;border-radius:2px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}
  .badge-approved{background:#d1fae5;color:#065f46;}
  .badge-rejected{background:#fee2e2;color:#7f1d1d;}
  .badge-pending{background:#fef3c7;color:#78350f;}
</style>
</head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">
      <div class="logo-mark">GH</div>
      <div>
        <div class="logo-name">GreyHaven</div>
        <span class="logo-tag">Redefining Excellence in Apartment Living</span>
      </div>
    </div>
  </div>
  <div class="body">${content}</div>
  <div class="footer-bar">
    GreyHaven Residential LLC &nbsp;·&nbsp; Equal Opportunity Housing Provider<br/>
    This is an automated message. Please do not reply directly to this email.<br/>
    <a href="${process.env.APP_URL}" style="color:#c9a84c;">greyhaven Residential</a>
  </div>
</div>
</body></html>`;
}

// ── Email Templates ───────────────────────────────────────────────────────────

function confirmationEmail(app) {
  return {
    subject: `Application Received — Reference #${app.ref_number}`,
    html: baseTemplate(`
      <h2>We've Received Your Application</h2>
      <p>Hi <strong>${app.first_name}</strong>,</p>
      <p>Thank you for applying with GreyHaven Residential. Your rental application has been successfully submitted and is currently under review by our team.</p>
      <div class="ref-box">
        <div class="ref-label">Your Application Reference Number</div>
        <strong>${app.ref_number}</strong>
      </div>
      <p>Our team typically reviews applications within <strong>24–48 hours</strong>. You'll receive an email once a decision has been made.</p>
      <hr class="divider"/>
      <p><strong>Application Summary:</strong></p>
      <table class="detail-table">
        <tr><td>Full Name</td><td>${app.first_name} ${app.middle_name || ''} ${app.last_name}</td></tr>
        <tr><td>Email</td><td>${app.email}</td></tr>
        <tr><td>Phone</td><td>${app.phone}</td></tr>
        <tr><td>Desired Move-In</td><td>${app.move_in_date || 'Not specified'}</td></tr>
        <tr><td>Submitted</td><td>${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
      </table>
      <p style="font-size:12px;color:#6b7280;margin-top:20px;">If you have questions about your application, please contact us at <a href="mailto:greyhaven.residential@gmail.com" style="color:#1a2e4a;">applications@greyhaven.com</a> and include your reference number.</p>
    `)
  };
}

function approvalEmail(app, leaseUrl) {
  return {
    subject: `🎉 Application Approved — Next Steps`,
    html: baseTemplate(`
      <h2>Congratulations — You're Approved!</h2>
      <p>Hi <strong>${app.first_name}</strong>,</p>
      <p>We're pleased to inform you that your rental application (Ref: <strong>${app.ref_number}</strong>) has been <span class="status-badge badge-approved">Approved</span>.</p>
      <p>To secure your unit, please review and acknowledge your lease agreement using the button below. Your unit will be held for <strong>72 hours</strong> from the time of this email.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${leaseUrl}" class="btn btn-gold">Review & Sign Lease Agreement →</a>
      </div>
      <hr class="divider"/>
      <p><strong>Next Steps:</strong></p>
      <table class="detail-table">
        <tr><td>Step 1</td><td>Click the button above to review your lease agreement</td></tr>
        <tr><td>Step 2</td><td>Acknowledge the lease terms online</td></tr>
        <tr><td>Step 3</td><td>Our team will contact you to arrange move-in and collect the security deposit + first month's rent via <strong>Wire transfer</strong></td></tr>
        <tr><td>Step 4</td><td>Keys handed over on your move-in date</td></tr>
      </table>
      ${app.admin_notes ? `<div class="ref-box"><div class="ref-label">Note from Our Team</div>${app.admin_notes}</div>` : ''}
      <p style="font-size:12px;color:#6b7280;margin-top:20px;">If you need assistance, contact us at <a href="mailto:greyhaven.residential@gmail.com" style="color:#1a2e4a;">leasing@greyhaven.com</a>.</p>
    `)
  };
}

function rejectionEmail(app) {
  return {
    subject: `Application Update — Reference #${app.ref_number}`,
    html: baseTemplate(`
      <h2>Application Status Update</h2>
      <p>Hi <strong>${app.first_name}</strong>,</p>
      <p>Thank you for your interest in GreyHaven Residential. After careful review of your application (Ref: <strong>${app.ref_number}</strong>), we are unable to approve it at this time. <span class="status-badge badge-rejected">Not Approved</span></p>
      ${app.admin_notes ? `<div class="ref-box"><div class="ref-label">Reason</div>${app.admin_notes}</div>` : ''}
      <p>Common reasons for application decisions include income requirements, credit history, rental history, or unit availability. We encourage you to reapply in the future when circumstances may be different.</p>
      <hr class="divider"/>
      <p>If you believe this decision was made in error or would like clarification, please contact us at <a href="mailto:greyhaven.residential@gmail.com" style="color:#1a2e4a;">greyhaven.residential@gmail.com</a> with your reference number.</p>
      <p style="font-size:12px;color:#6b7280;">GreyHaven Residential is an Equal Opportunity Housing Provider. All applicants are considered regardless of race, color, religion, sex, handicap, or national origin.</p>
    `)
  };
}

// ── Send helpers ──────────────────────────────────────────────────────────────
async function sendEmail(to, { subject, html }) {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'GreyHaven Residential <no-reply@greyhaven.com>',
    to,
    subject,
    html,
  });
  return info;
}

module.exports = { sendEmail, confirmationEmail, approvalEmail, rejectionEmail };
