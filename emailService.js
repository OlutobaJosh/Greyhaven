// emailService.js — Gmail API over HTTPS
const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');

class EmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.OAUTH_CLIENT_ID,
      process.env.OAUTH_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );
    this.oauth2Client.setCredentials({ refresh_token: process.env.OAUTH_REFRESH_TOKEN });
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async send(to, subject, html, attachments) {
    const from = 'GreyHaven Residential <' + process.env.OAUTH_EMAIL + '>';
    const mailOpts = { from, to, subject, html, textEncoding: 'base64' };

    // Properly convert attachments for MailComposer
    if (attachments && attachments.length) {
      mailOpts.attachments = attachments.map(function(att) {
        // Always decode base64 string to a real Buffer so MailComposer
        // creates a proper MIME attachment that email clients can download
        var buf = Buffer.isBuffer(att.content)
          ? att.content
          : Buffer.from(att.content, 'base64');
        return {
          filename: att.filename,
          content: buf,
          contentType: att.contentType || 'application/octet-stream',
          contentDisposition: 'attachment'
        };
      });
    }

    const mail = new MailComposer(mailOpts);
    const message = await mail.compile().build();
    const raw = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const result = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });
    console.log('Email sent:', result.data.id);
    return result.data;
  }
}

const emailService = new EmailService();

function fmtMoney(v) {
  if (!v) return 'As agreed';
  var n = parseFloat(v.toString().replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return v;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function baseTemplate(content) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>' +
    'body{margin:0;padding:0;background:#f5f4f0;font-family:Helvetica Neue,Arial,sans-serif;}' +
    '.wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}' +
    '.header{background:#0f1e32;padding:28px 36px;border-bottom:3px solid #c9a84c;}' +
    '.logo-name{color:#fff;font-size:22px;font-weight:700;}' +
    '.logo-tag{color:#c9a84c;font-size:10px;letter-spacing:.18em;text-transform:uppercase;display:block;margin-top:4px;}' +
    '.body{padding:36px;}' +
    '.ref-box{background:#f5f4f0;border-left:4px solid #c9a84c;padding:12px 16px;margin:20px 0;border-radius:0 4px 4px 0;}' +
    '.ref-box strong{display:block;font-size:18px;color:#0f1e32;}' +
    '.ref-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:4px;}' +
    '.btn{display:inline-block;background:#c9a84c;color:#0f1e32;text-decoration:none;padding:13px 28px;border-radius:2px;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:20px 0;}' +
    '.divider{border:none;border-top:1px solid #e8e6e1;margin:24px 0;}' +
    '.footer-bar{background:#0f1e32;padding:18px 36px;text-align:center;color:rgba(255,255,255,.4);font-size:11px;line-height:1.8;}' +
    'h2{color:#0f1e32;font-size:22px;margin:0 0 12px;}' +
    'p{color:#374151;font-size:14px;line-height:1.8;margin:8px 0;}' +
    'table{width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;}' +
    'td{padding:8px 10px;border-bottom:1px solid #e8e6e1;color:#374151;}' +
    'td:first-child{font-weight:700;color:#0f1e32;width:40%;text-transform:uppercase;font-size:11px;letter-spacing:.06em;}' +
    '.badge{display:inline-block;padding:4px 12px;border-radius:2px;font-size:11px;font-weight:700;text-transform:uppercase;}' +
    '.approved{background:#d1fae5;color:#065f46;}' +
    '.rejected{background:#fee2e2;color:#7f1d1d;}' +
    '.pay-box{margin:24px 0;padding:20px;background:#f0f7ff;border-radius:4px;border-left:4px solid #1a2e4a;}' +
    '.pay-title{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#1a2e4a;margin-bottom:12px;}' +
    '.bank-box{margin-top:16px;padding:12px;background:#fff;border-radius:4px;border:1px solid #e8e6e1;}' +
    '.bank-label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;}' +
    '</style></head><body><div class="wrap">' +
    '<div class="header"><div class="logo-name">GreyHaven</div>' +
    '<span class="logo-tag">Redefining Excellence in Apartment Living</span></div>' +
    '<div class="body">' + content + '</div>' +
    '<div class="footer-bar">GreyHaven Residential LLC &nbsp;·&nbsp; Equal Opportunity Housing Provider<br/>' +
    'This is an automated message. Please do not reply to this email.</div>' +
    '</div></body></html>';
}

function confirmationEmail(app) {
  var adminEmail = process.env.OAUTH_EMAIL || '';
  var submitted = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  var content = '<h2>We\'ve Received Your Application</h2>' +
    '<p>Hi <strong>' + app.first_name + '</strong>,</p>' +
    '<p>Thank you for applying with GreyHaven Residential. Your application has been submitted and is currently under review.</p>' +
    '<div class="ref-box"><div class="ref-label">Your Application Reference Number</div><strong>' + app.ref_number + '</strong></div>' +
    '<p>Our team reviews applications within <strong>24-48 business hours</strong>.</p>' +
    '<hr class="divider"/>' +
    '<table>' +
    '<tr><td>Full Name</td><td>' + app.first_name + ' ' + (app.middle_name || '') + ' ' + app.last_name + '</td></tr>' +
    '<tr><td>Email</td><td>' + app.email + '</td></tr>' +
    '<tr><td>Phone</td><td>' + app.phone + '</td></tr>' +
    '<tr><td>Desired Move-In</td><td>' + (app.move_in_date || 'Not specified') + '</td></tr>' +
    '<tr><td>Submitted</td><td>' + submitted + '</td></tr>' +
    '</table>' +
    '<p style="font-size:12px;color:#6b7280;margin-top:20px;">Questions? Contact us at <a href="mailto:' + adminEmail + '" style="color:#1a2e4a;">' + adminEmail + '</a></p>';
  return {
    subject: 'Application Received — Reference #' + app.ref_number,
    html: baseTemplate(content)
  };
}

function approvalEmail(app, leaseUrl, payment) {
  payment = payment || {};
  var adminEmail = process.env.OAUTH_EMAIL || '';
  var hasPayment = payment.bank_name || payment.account_number;

  var paymentRows = '';
  paymentRows += '<tr><td style="padding:8px 10px;border-bottom:1px solid #e8e6e1;font-weight:700;color:#1a2e4a;">First Month\'s Rent</td><td style="padding:8px 10px;border-bottom:1px solid #e8e6e1;font-weight:700;color:#1a2e4a;">' + fmtMoney(payment.monthly_rent) + '</td></tr>';
  paymentRows += '<tr><td style="padding:8px 10px;border-bottom:1px solid #e8e6e1;font-weight:700;color:#1a2e4a;">Security Deposit</td><td style="padding:8px 10px;border-bottom:1px solid #e8e6e1;font-weight:700;color:#1a2e4a;">' + fmtMoney(payment.security_deposit) + '</td></tr>';
  if (payment.cleaning_fee) {
    paymentRows += '<tr><td style="padding:8px 10px;font-weight:700;color:#1a2e4a;">Cleaning Fee</td><td style="padding:8px 10px;font-weight:700;color:#1a2e4a;">' + fmtMoney(payment.cleaning_fee) + '</td></tr>';
  }

  var bankRows = '';
  if (payment.bank_name) bankRows += '<tr><td style="padding:4px 0;color:#6b7280;width:40%;">Bank Name</td><td style="padding:4px 0;font-weight:700;color:#1a2e4a;">' + payment.bank_name + '</td></tr>';
  if (payment.account_name) bankRows += '<tr><td style="padding:4px 0;color:#6b7280;">Account Name</td><td style="padding:4px 0;font-weight:700;color:#1a2e4a;">' + payment.account_name + '</td></tr>';
  if (payment.account_number) bankRows += '<tr><td style="padding:4px 0;color:#6b7280;">Account Number</td><td style="padding:4px 0;font-weight:700;color:#1a2e4a;">' + payment.account_number + '</td></tr>';
  if (payment.routing_number) bankRows += '<tr><td style="padding:4px 0;color:#6b7280;">Routing Number</td><td style="padding:4px 0;font-weight:700;color:#1a2e4a;">' + payment.routing_number + '</td></tr>';
  if (payment.bank_addr) bankRows += '<tr><td style="padding:4px 0;color:#6b7280;">Bank Address</td><td style="padding:4px 0;font-weight:700;color:#1a2e4a;">' + payment.bank_addr + '</td></tr>';
  if (payment.beneficiary_addr) bankRows += '<tr><td style="padding:4px 0;color:#6b7280;">Beneficiary Address</td><td style="padding:4px 0;font-weight:700;color:#1a2e4a;">' + payment.beneficiary_addr + '</td></tr>';

  var paymentSection = '';
  if (hasPayment) {
    paymentSection = '<div class="pay-box">' +
      '<div class="pay-title">Payment Instructions</div>' +
      '<p style="font-size:13px;color:#374151;margin-bottom:12px;">Please make the following payments to secure your unit before your move-in date.</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<tr style="background:#1a2e4a;"><td style="padding:8px 10px;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;">Payment</td><td style="padding:8px 10px;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;">Amount</td></tr>' +
      paymentRows + '</table>' +
      (bankRows ? '<div class="bank-box"><div class="bank-label">Bank Transfer Details</div><table style="width:100%;font-size:13px;">' + bankRows + '</table></div>' : '') +
      '<p style="font-size:11px;color:#6b7280;margin-top:8px;">Please use reference number <strong>' + app.ref_number + '</strong> as the payment memo.</p>' +
      '</div>';
  }

  var noteSection = app.admin_notes ? '<div class="ref-box"><div class="ref-label">Note from Our Team</div>' + app.admin_notes + '</div>' : '';

  var content = '<h2>Congratulations - You\'re Approved!</h2>' +
    '<p>Hi <strong>' + app.first_name + '</strong>,</p>' +
    '<p>Your application (Ref: <strong>' + app.ref_number + '</strong>) has been <span class="badge approved">Approved</span>.</p>' +
    '<p>Please complete the steps below within <strong>12 hours</strong> to secure your unit.</p>' +
    '<div style="text-align:center;margin:24px 0;"><a href="' + leaseUrl + '" class="btn">Step 1: Review and Sign Lease Agreement</a></div>' +
    paymentSection +
    '<hr class="divider"/>' +
    '<table>' +
    '<tr><td>Step 1</td><td>Click button above to review and sign your lease</td></tr>' +
    '<tr><td>Step 2</td><td>Make payment using the bank details above</td></tr>' +
    '<tr><td>Step 3</td><td>Upload payment receipt when signing the lease</td></tr>' +
    '<tr><td>Step 4</td><td>Keys handed over on your move-in date after payment is confirmed</td></tr>' +
    '</table>' +
    noteSection +
    '<p style="font-size:12px;color:#6b7280;margin-top:20px;">Questions? <a href="mailto:' + adminEmail + '" style="color:#1a2e4a;">' + adminEmail + '</a></p>';

  return {
    subject: 'Congratulations! Your Application is Approved - Action Required',
    html: baseTemplate(content)
  };
}

function rejectionEmail(app) {
  var adminEmail = process.env.OAUTH_EMAIL || '';
  var noteSection = app.admin_notes ? '<div class="ref-box"><div class="ref-label">Reason</div>' + app.admin_notes + '</div>' : '';
  var content = '<h2>Application Status Update</h2>' +
    '<p>Hi <strong>' + app.first_name + '</strong>,</p>' +
    '<p>After careful review of your application (Ref: <strong>' + app.ref_number + '</strong>), we are unable to approve it at this time. <span class="badge rejected">Not Approved</span></p>' +
    noteSection +
    '<p>We encourage you to reapply in the future.</p>' +
    '<p style="font-size:12px;color:#6b7280;">Questions? <a href="mailto:' + adminEmail + '" style="color:#1a2e4a;">' + adminEmail + '</a></p>' +
    '<p style="font-size:12px;color:#6b7280;">GreyHaven Residential is an Equal Opportunity Housing Provider.</p>';
  return {
    subject: 'Application Update - Reference #' + app.ref_number,
    html: baseTemplate(content)
  };
}

async function sendEmail(to, emailObj) {
  return emailService.send(to, emailObj.subject, emailObj.html, emailObj.attachments || null);
}

module.exports = { sendEmail, confirmationEmail, approvalEmail, rejectionEmail };

