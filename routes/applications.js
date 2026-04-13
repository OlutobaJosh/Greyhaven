// routes/applications.js — All async for Turso
const express    = require('express');
const router     = express.Router();
const rateLimit  = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { q }      = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendEmail, confirmationEmail, approvalEmail, rejectionEmail } = require('../emailService');

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many applications submitted. Please try again later.' }
});

function genRef() {
  return `GH-${new Date().getFullYear()}-${Math.random().toString(36).substr(2,8).toUpperCase()}`;
}

// ── POST /api/applications — Submit ──────────────────────────────────────────
router.post('/', submitLimiter, async (req, res) => {
  try {
    const b = req.body;
    const required = ['first_name','last_name','phone','email'];
    for (const f of required) {
      if (!b[f]?.toString().trim()) return res.status(400).json({ error: `Missing required field: ${f}` });
    }

    const app = await q.insertApplication({
      ref_number:         genRef(),
      first_name:         b.first_name?.trim(),
      middle_name:        b.middle_name?.trim() || null,
      last_name:          b.last_name?.trim(),
      dob:                b.dob || null,
      drivers_license:    b.drivers_license?.trim() || null,
      phone:              b.phone?.trim(),
      email:              b.email?.trim().toLowerCase(),
      move_in_date:       b.move_in_date || null,
      lease_term:         b.lease_term || null,
      lease_end_date:     b.lease_end_date || null,
      other_occupants:    b.other_occupants || null,
      pets:               b.pets || null,
      vehicles:           b.vehicles || null,
      crime_history:      b.crime_history || null,
      bankruptcy_history: b.bankruptcy_history || null,
      eviction_history:   b.eviction_history || null,
      company:            b.company?.trim() || null,
      job_title:          b.job_title?.trim() || null,
      employed_duration:  b.employed_duration || null,
      gross_income:       b.gross_income || null,
      emp_address:        b.emp_address || null,
      emp_city:           b.emp_city || null,
      emp_state:          b.emp_state || null,
      supervisor:         b.supervisor || null,
      res_type:           b.res_type || null,
      res_bedrooms:       b.res_bedrooms || null,
      res_rent:           b.res_rent || null,
      res_address:        b.res_address || null,
      res_city:           b.res_city || null,
      res_state:          b.res_state || null,
      res_zip:            b.res_zip || null,
      res_duration:       b.res_duration || null,
      res_lease_exp:      b.res_lease_exp || null,
      res_why_moving:     b.res_why_moving || null,
      ref1_name:          b.ref1_name || null,
      ref1_rel:           b.ref1_rel || null,
      ref1_phone:         b.ref1_phone || null,
      ref2_name:          b.ref2_name || null,
      ref2_rel:           b.ref2_rel || null,
      ref2_phone:         b.ref2_phone || null,
    });

    sendEmail(app.email, confirmationEmail(app))
      .then(() => q.logEmail(app.id, 'confirmation', app.email, 1))
      .catch(err => { console.error('Email error:', err.message); q.logEmail(app.id, 'confirmation', app.email, 0); });

    res.status(201).json({ success: true, ref_number: app.ref_number, message: 'Application submitted! Check your email.' });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Failed to submit application.' });
  }
});

// ── GET /api/applications — List all (admin) ─────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    let apps = await q.getAllApplications();
    const { status, search } = req.query;
    if (status && status !== 'all') apps = apps.filter(a => a.status === status);
    if (search) {
      const s = search.toLowerCase();
      apps = apps.filter(a =>
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(s) ||
        a.email?.toLowerCase().includes(s) ||
        a.ref_number?.toLowerCase().includes(s)
      );
    }
    res.json({ applications: apps, total: apps.length });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch applications' }); }
});

// ── GET /api/applications/stats ───────────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try { res.json(await q.getStats()); }
  catch (err) { res.status(500).json({ error: 'Failed to fetch stats' }); }
});

// ── GET /api/applications/:id ─────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const app = await q.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const emailLog = await q.getEmailLog(app.id);
    res.json({ application: app, emailLog });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch application' }); }
});

// ── PUT /api/applications/:id/approve ────────────────────────────────────────
router.put('/:id/approve', requireAuth, async (req, res) => {
  try {
    const app = await q.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    if (app.status === 'approved') return res.status(400).json({ error: 'Already approved' });

    const leaseToken = uuidv4();
    const leaseUrl   = `${process.env.APP_URL || 'http://localhost:3000'}/lease?token=${leaseToken}`;

    await q.updateStatus({
      id: app.id, status: 'approved',
      admin_notes: req.body.notes || null,
      lease_token: leaseToken,
      reviewed_by: req.admin.email,
      monthly_rent: req.body.monthly_rent || null,
      security_deposit: req.body.security_deposit || null,
      cleaning_fee: req.body.cleaning_fee || null,
      unit_address: req.body.unit_address || null,
    });

    const paymentDetails = {
      bank_name:        req.body.bank_name || null,
      account_name:     req.body.account_name || null,
      account_number:   req.body.account_number || null,
      routing_number:   req.body.routing_number || null,
      bank_addr:        req.body.bank_addr || null,
      beneficiary_addr: req.body.beneficiary_addr || null,
      monthly_rent:     req.body.monthly_rent || null,
      security_deposit: req.body.security_deposit || null,
      cleaning_fee:     req.body.cleaning_fee || null,
    };

    sendEmail(app.email, approvalEmail(app, leaseUrl, paymentDetails))
      .then(() => q.logEmail(app.id, 'approved', app.email, 1))
      .catch(err => { console.error('Email error:', err.message); q.logEmail(app.id, 'approved', app.email, 0); });

    res.json({ success: true, message: 'Approved. Email sent.', leaseUrl });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to approve' }); }
});

// ── PUT /api/applications/:id/reject ─────────────────────────────────────────
router.put('/:id/reject', requireAuth, async (req, res) => {
  try {
    const app = await q.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    if (app.status === 'rejected') return res.status(400).json({ error: 'Already rejected' });

    await q.updateStatus({ id: app.id, status: 'rejected', admin_notes: req.body.notes || null, lease_token: null, reviewed_by: req.admin.email });

    const updated = await q.getApplicationById(app.id);
    sendEmail(app.email, rejectionEmail(updated))
      .then(() => q.logEmail(app.id, 'rejected', app.email, 1))
      .catch(err => { console.error('Email error:', err.message); q.logEmail(app.id, 'rejected', app.email, 0); });

    res.json({ success: true, message: 'Rejected. Notification sent.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to reject' }); }
});

// ── GET /api/applications/lease/:token — Public ───────────────────────────────
router.get('/lease/:token', async (req, res) => {
  try {
    const app = await q.getApplicationByLeaseToken(req.params.token);
    if (!app || app.status !== 'approved') return res.status(404).json({ error: 'Lease not found' });
    res.json({
      ref_number: app.ref_number, first_name: app.first_name, last_name: app.last_name,
      email: app.email, move_in_date: app.move_in_date, admin_notes: app.admin_notes,
      monthly_rent: app.monthly_rent, security_deposit: app.security_deposit,
      cleaning_fee: app.cleaning_fee, unit_address: app.unit_address, phone: app.phone,
      lease_term: app.lease_term,
      lease_end_date: app.lease_end_date,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to retrieve lease' }); }
});

// ── POST /api/applications/lease/:token/confirm — Tenant signs + uploads receipt
router.post('/lease/:token/confirm', async (req, res) => {
  try {
    const app = await q.getApplicationByLeaseToken(req.params.token);
    if (!app || app.status !== 'approved') {
      return res.status(404).json({ error: 'Lease not found or not approved' });
    }

    const { tenant_name, tenant_email, tenant_phone, receipt_data, receipt_name, receipt_type, signed_at } = req.body;
    if (!tenant_name || !receipt_data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const adminEmail = process.env.OAUTH_EMAIL || process.env.ADMIN_EMAIL;
    const signedDate = new Date(signed_at).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const adminHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>' +
      'body{margin:0;padding:0;background:#f5f4f0;font-family:Helvetica Neue,Arial,sans-serif;}' +
      '.wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;}' +
      '.header{background:#0f1e32;padding:24px 32px;border-bottom:3px solid #c9a84c;}' +
      '.logo{color:#fff;font-size:20px;font-weight:700;}' +
      '.body{padding:32px;}' +
      'h2{color:#0f1e32;font-size:20px;margin:0 0 12px;}' +
      'p{color:#374151;font-size:14px;line-height:1.8;margin:6px 0;}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;}' +
      'td{padding:8px 10px;border-bottom:1px solid #e8e6e1;color:#374151;}' +
      'td:first-child{font-weight:700;color:#0f1e32;width:40%;font-size:11px;text-transform:uppercase;letter-spacing:.06em;}' +
      '.badge{display:inline-block;padding:4px 12px;border-radius:2px;font-size:11px;font-weight:700;background:#d1fae5;color:#065f46;}' +
      '.att-box{background:#f0f7ff;border-left:4px solid #1a2e4a;padding:12px 16px;margin-top:16px;border-radius:0 4px 4px 0;font-size:13px;}' +
      '</style></head><body><div class="wrap">' +
      '<div class="header"><div class="logo">GreyHaven — Lease Signed Notification</div></div>' +
      '<div class="body">' +
      '<h2>Lease Agreement Signed ✅</h2>' +
      '<p>A tenant has signed their lease agreement and submitted payment proof. The receipt is attached to this email.</p>' +
      '<table>' +
      '<tr><td>Tenant Name</td><td>' + tenant_name + '</td></tr>' +
      '<tr><td>Tenant Email</td><td>' + tenant_email + '</td></tr>' +
      '<tr><td>Tenant Phone</td><td>' + (tenant_phone || '—') + '</td></tr>' +
      '<tr><td>Reference #</td><td>' + app.ref_number + '</td></tr>' +
      '<tr><td>Signed On</td><td>' + signedDate + '</td></tr>' +
      '<tr><td>Status</td><td><span class="badge">Lease Signed</span></td></tr>' +
      '</table>' +
      '<div class="att-box">📎 Payment receipt attached: <strong>' + (receipt_name || 'receipt') + '</strong></div>' +
      '</div></div></body></html>';

    const base64Content = receipt_data.includes(',') ? receipt_data.split(',')[1] : receipt_data;
    const attachment = {
      filename: receipt_name || 'payment-receipt',
      content: Buffer.from(base64Content, 'base64'),
      contentType: receipt_type || 'application/octet-stream',
      contentDisposition: 'attachment'
    };

    await sendEmail(adminEmail, {
      subject: 'Lease Signed — ' + tenant_name + ' (' + app.ref_number + ')',
      html: adminHtml,
      attachments: [attachment]
    });

    const tenantHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>' +
      'body{margin:0;padding:0;background:#f5f4f0;font-family:Helvetica Neue,Arial,sans-serif;}' +
      '.wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;}' +
      '.header{background:#0f1e32;padding:24px 32px;border-bottom:3px solid #c9a84c;}' +
      '.logo{color:#fff;font-size:20px;font-weight:700;}' +
      '.body{padding:32px;}' +
      'h2{color:#0f1e32;font-size:20px;margin:0 0 12px;}' +
      'p{color:#374151;font-size:14px;line-height:1.8;margin:6px 0;}' +
      '.ref-box{background:#f5f4f0;border-left:4px solid #c9a84c;padding:12px 16px;margin:16px 0;}' +
      '.ref-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:4px;}' +
      '.footer{background:#0f1e32;padding:16px 32px;text-align:center;color:rgba(255,255,255,.4);font-size:11px;}' +
      '</style></head><body><div class="wrap">' +
      '<div class="header"><div class="logo">GreyHaven Residential</div></div>' +
      '<div class="body">' +
      '<h2>Your Lease is Confirmed! 🎉</h2>' +
      '<p>Hi <strong>' + tenant_name + '</strong>,</p>' +
      '<p>We have received your signed lease agreement and payment receipt. Our team will review and be in touch within <strong>24 hours</strong>.</p>' +
      '<div class="ref-box"><div class="ref-label">Your Reference Number</div><strong>' + app.ref_number + '</strong></div>' +
      '<p>Signed on: <strong>' + signedDate + '</strong></p>' +
      '<p style="margin-top:16px;">Questions? Contact us at <a href="mailto:' + adminEmail + '" style="color:#1a2e4a;">' + adminEmail + '</a></p>' +
      '</div>' +
      '<div class="footer">GreyHaven Residential LLC · Equal Opportunity Housing Provider</div>' +
      '</div></body></html>';

    await sendEmail(tenant_email, {
      subject: 'Lease Confirmed — Welcome to GreyHaven! (' + app.ref_number + ')',
      html: tenantHtml
    });

    await q.markLeaseSigned(app.id, new Date().toISOString());
    await q.logEmail(app.id, 'lease_signed', tenant_email, 1);
    res.json({ success: true, message: 'Lease signed and confirmed. Check your email.' });

  } catch (err) {
    console.error('Lease confirm error:', err);
    res.status(500).json({ error: 'Failed to process lease confirmation: ' + err.message });
  }
});

// ── PUT /api/applications/:id/confirm-payment ─────────────────────────────────
router.put('/:id/confirm-payment', requireAuth, async (req, res) => {
  try {
    const app = await q.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    if (app.status !== 'approved') return res.status(400).json({ error: 'Application not approved' });
    if (app.payment_confirmed) return res.status(400).json({ error: 'Payment already confirmed' });

    await q.confirmPayment(app.id, req.admin.email);

    const receiptDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const receiptNumber = 'BR-' + app.ref_number + '-' + Date.now().toString().slice(-4);

    const receiptHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>' +
      'body{margin:0;padding:0;background:#f5f4f0;font-family:Helvetica Neue,Arial,sans-serif;}' +
      '.wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}' +
      '.header{background:#0f1e32;padding:28px 36px;border-bottom:3px solid #c9a84c;text-align:center;}' +
      '.logo{color:#fff;font-size:24px;font-weight:700;}' +
      '.tagline{color:#c9a84c;font-size:10px;letter-spacing:.18em;text-transform:uppercase;display:block;margin-top:4px;}' +
      '.receipt-title{color:#fff;font-size:14px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin-top:16px;padding:8px 20px;background:rgba(201,168,76,.2);border-radius:2px;display:inline-block;}' +
      '.body{padding:36px;}' +
      '.receipt-num{background:#f5f4f0;border-left:4px solid #c9a84c;padding:12px 16px;margin:20px 0;}' +
      '.receipt-num strong{display:block;font-size:20px;color:#0f1e32;}' +
      '.receipt-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:4px;}' +
      '.confirmed-badge{display:inline-block;background:#d1fae5;color:#065f46;padding:6px 16px;border-radius:2px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:8px 0;}' +
      'h2{color:#0f1e32;font-size:20px;margin:0 0 8px;}' +
      'p{color:#374151;font-size:14px;line-height:1.8;margin:6px 0;}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;}' +
      'td{padding:9px 12px;border-bottom:1px solid #e8e6e1;color:#374151;}' +
      'td:first-child{font-weight:700;color:#0f1e32;width:45%;text-transform:uppercase;font-size:11px;letter-spacing:.06em;}' +
      'tr:last-child td{border-bottom:none;}' +
      '.divider{border:none;border-top:2px solid #0f1e32;margin:24px 0;}' +
      '.footer-bar{background:#0f1e32;padding:18px 36px;text-align:center;color:rgba(255,255,255,.4);font-size:11px;line-height:1.8;}' +
      '</style></head><body><div class="wrap">' +
      '<div class="header">' +
      '<div class="logo">GreyHaven</div>' +
      '<span class="tagline">Redefining Excellence in Apartment Living</span>' +
      '<div class="receipt-title">✓ Official Booking Receipt</div>' +
      '</div>' +
      '<div class="body">' +
      '<h2>Payment Confirmed — You\'re All Set!</h2>' +
      '<p>Hi <strong>' + app.first_name + '</strong>,</p>' +
      '<p>Your payment has been confirmed and your booking is now secured. Please keep this receipt for your records.</p>' +
      '<span class="confirmed-badge">✓ Payment Confirmed</span>' +
      '<div class="receipt-num"><div class="receipt-label">Booking Receipt Number</div><strong>' + receiptNumber + '</strong></div>' +
      '<hr class="divider"/>' +
      '<p><strong>Booking Details</strong></p>' +
      '<table>' +
      '<tr><td>Tenant Name</td><td>' + app.first_name + ' ' + (app.middle_name || '') + ' ' + app.last_name + '</td></tr>' +
      '<tr><td>Application Ref</td><td>' + app.ref_number + '</td></tr>' +
      '<tr><td>Property Address</td><td>' + (app.unit_address || 'To be confirmed') + '</td></tr>' +
      '<tr><td>Move-In Date</td><td>' + (app.move_in_date || 'To be confirmed') + '</td></tr>' +
      '<tr><td>Monthly Rent</td><td>' + (app.monthly_rent ? '$' + app.monthly_rent : 'As agreed') + '</td></tr>' +
      '<tr><td>Security Deposit</td><td>' + (app.security_deposit ? '$' + app.security_deposit : 'As agreed') + '</td></tr>' +
      '<tr><td>Confirmed On</td><td>' + receiptDate + '</td></tr>' +
      '</table>' +
      '<hr class="divider"/>' +
      '<p style="font-size:13px;color:#374151;background:#f0fdf4;padding:12px 16px;border-radius:4px;border-left:4px solid #10b981;">Our team will be in touch within <strong>24 hours</strong> to arrange your key handover and complete the move-in process.</p>' +
      '<p style="margin-top:16px;font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:' + (process.env.OAUTH_EMAIL || '') + '" style="color:#1a2e4a;">' + (process.env.OAUTH_EMAIL || '') + '</a></p>' +
      '</div>' +
      '<div class="footer-bar">GreyHaven Residential LLC &nbsp;·&nbsp; Equal Opportunity Housing Provider<br/>' +
      'Receipt No: ' + receiptNumber + ' &nbsp;·&nbsp; Issued: ' + receiptDate + '</div>' +
      '</div></body></html>';

    await sendEmail(app.email, {
      subject: 'Booking Confirmed — Official Receipt (' + receiptNumber + ')',
      html: receiptHtml
    });

    await q.markReceiptSent(app.id);
    await q.logEmail(app.id, 'booking_receipt', app.email, 1);

    res.json({ success: true, message: 'Payment confirmed. Booking receipt sent to ' + app.email });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment: ' + err.message });
  }
});

module.exports = router;
