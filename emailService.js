// emailService.js — Uses Resend API (works on all hosting platforms)
const { Resend } = require('resend');

function getClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

// ── Base email layout ─────────────────────────────────────────────────────────
function baseTemplate(content) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  body{margin:0;padding:0;background:#f5f4f0;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
  .header{background:#0f1e32;padding:28px 36px;border-bottom:3px solid #c9a84c;}
  .logo-mark{width:38px;height:38px;background:#c9a84c;display:inline-block;vertical-align:middle;margin-right:10px;}
  .logo-name{color:#fff;font-size:22px;font-weight:700;vertical-align:middle;}
  .logo-tag{color:#c9a84c;font-size:10px;letter-spacing:.18em;text-transform:uppercase;display:block;margin-top:4px;}
  .body{padding:36px;}
  .ref-box{background:#f5f4f0;border-left:4px solid #c9a84c;padding:12px 16px;margin:20px 0;border-radius:0 4px 4px 0;}
  .ref-box strong{display:block;font-size:18px;color:#0f1e32;letter-spacing:.05em;}
  .ref-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:4px;}
  .btn{display:inline-block;background:#c9a84c;color:#0f1e32;text-decoration:none;padding:13px 28px;border-radius:2px;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:20px 0;}
  .divider{border:none;border-top:1px solid #e8e6e1;margin:24px 0;}
  .footer-bar{background:#0f1e32;padding:18px 36px;text-align:center;color:rgba(255,255,255,.4);font-size:11px;line-height:1.8;}
  h2{color:#0f1e32;font-size:22px;margin:0 0 12px;}
  p{color:#374151;font-size:14px;line-height:1.8;margin:8px 0;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;}
  td{padding:8px 10px;border-bottom:1px solid #e8e6e1;color:#374151;}
  td:first-child{font-weight:700;color:#0f1e32;width:40%;text-transform:uppercase;font-size:11px;letter-spacing:.06em;}
  .badge{display:inline-block;padding:4px 12px;border-radius:2px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}
  .approved{background:#d1fae5;color:#065f46;}
  .rejected{background:#fee2e2;color:#7f1d1d;}
</style>
</head><body>
<div class="wrap">
  <div class="header">
    <span class="logo-name">GreyHaven</span>
    <span class="logo-tag">Redefining Excellence in Apartment Living</span>
  </div>
  <div class="body">${content}</div>
  <div class="footer-bar">
    GreyHaven Residential LLC &nbsp;·&nbsp; Equal Opportunity Housing Provider<br/>
    This is an automated message. Please do not reply directly to this email.
  </div>
</div>
</body></html>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────
function confirmationEmail(app) {
  return {
    subject: `Application Received — Reference #${app.ref_number}`,
    html: baseTemplate(`
      <h2>We've Received Your Application</h2>
      <p>Hi <strong>${app.first_name}</strong>,</p>
      <p>Thank you for applying with GreyHaven Residential. Your application has been submitted and is currently under review.</p>
      <div class="ref-box">
        <div class="ref-label">Your Application Reference Number</div>
        <strong>${app.ref_number}</strong>
      </div>
      <p>Our team reviews applications within <strong>24–48 business hours</strong>. You'll receive an email once a decision has been made.</p>
      <hr class="divider"/>
      <p><strong>Application Summary:</strong></p>
      <table>
        <tr><td>Full Name</td><td>${app.first_name} ${app.middle_name||''} ${app.last_name}</td></tr>
        <tr><td>Email</td><td>${app.email}</td></tr>
        <tr><td>Phone</td><td>${app.phone}</td></tr>
        <tr><td>Desired Move-In</td><td>${app.move_in_date||'Not specified'}</td></tr>
        <tr><td>Submitted</td><td>${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
      </table>
      <p style="font-size:12px;color:#6b7280;margin-top:20px;">Questions? Contact us at <a href="mailto:${process.env.SMTP_USER}" style="color:#1a2e4a;">${process.env.SMTP_USER}</a> with your reference number.</p>
    `)
  };
}

function approvalEmail(app, leaseUrl) {
  return {
    subject: `Congratulations! Your Application is Approved`,
    html: baseTemplate(`
      <h2>Congratulations — You're Approved!</h2>
      <p>Hi <strong>${app.first_name}</strong>,</p>
      <p>Your application (Ref: <strong>${app.ref_number}</strong>) has been <span class="badge approved">Approved</span>.</p>
      <p>Please review and sign your lease agreement within <strong>72 hours</strong> to secure your unit.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${leaseUrl}" class="btn">Review & Sign Lease Agreement →</a>
      </div>
      <hr class="divider"/>
      <table>
        <tr><td>Step 1</td><td>Click button above to review your lease</td></tr>
        <tr><td>Step 2</td><td>Sign the lease digitally</td></tr>
        <tr><td>Step 3</td><td>Our team contacts you with payment instructions</td></tr>
        <tr><td>Step 4</td><td>Keys handed over on your move-in date 🎉</td></tr>
      </table>
      ${app.admin_notes ? `<div class="ref-box"><div class="ref-label">Note from Our Team</div>${app.admin_notes}</div>` : ''}
      <p style="font-size:12px;color:#6b7280;margin-top:20px;">Need help? Contact <a href="mailto:${process.env.SMTP_USER}" style="color:#1a2e4a;">${process.env.SMTP_USER}</a></p>
    `)
  };
}

function rejectionEmail(app) {
  return {
    subject: `Application Update — Reference #${app.ref_number}`,
    html: baseTemplate(`
      <h2>Application Status Update</h2>
      <p>Hi <strong>${app.first_name}</strong>,</p>
      <p>After careful review of your application (Ref: <strong>${app.ref_number}</strong>), we are unable to approve it at this time. <span class="badge rejected">Not Approved</span></p>
      ${app.admin_notes ? `<div class="ref-box"><div class="ref-label">Reason</div>${app.admin_notes}</div>` : ''}
      <p>We encourage you to reapply in the future. Questions? Contact <a href="mailto:${process.env.SMTP_USER}" style="color:#1a2e4a;">${process.env.SMTP_USER}</a></p>
      <p style="font-size:12px;color:#6b7280;">GreyHaven Residential is an Equal Opportunity Housing Provider.</p>
    `)
  };
}

// ── Send ──────────────────────────────────────────────────────────────────────
async function sendEmail(to, { subject, html }) {
  const resend = getClient();
  const from = process.env.EMAIL_FROM || 'GreyHaven Residential <onboarding@resend.dev>';
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(JSON.stringify(error));
  console.log('✅ Email sent via Resend:', data?.id);
  return data;
}

module.exports = { sendEmail, confirmationEmail, approvalEmail, rejectionEmail };
