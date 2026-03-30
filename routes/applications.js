// routes/applications.js
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { q }    = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendEmail, confirmationEmail, approvalEmail, rejectionEmail } = require('../emailService');

function genRef() {
  return `GH-${new Date().getFullYear()}-${Math.random().toString(36).substr(2,8).toUpperCase()}`;
}

// POST /api/applications — Submit
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const required = ['first_name','last_name','phone','email'];
    for (const f of required) {
      if (!b[f]?.toString().trim()) return res.status(400).json({ error: `Missing required field: ${f}` });
    }

    const app = q.insertApplication({
      ref_number:          genRef(),
      first_name:          b.first_name?.trim(),
      middle_name:         b.middle_name?.trim() || null,
      last_name:           b.last_name?.trim(),
      dob:                 b.dob || null,
      drivers_license:     b.drivers_license?.trim() || null,
      phone:               b.phone?.trim(),
      email:               b.email?.trim().toLowerCase(),
      move_in_date:        b.move_in_date || null,
      other_occupants:     b.other_occupants || null,
      pets:                b.pets || null,
      vehicles:            b.vehicles || null,
      crime_history:       b.crime_history || null,
      bankruptcy_history:  b.bankruptcy_history || null,
      eviction_history:    b.eviction_history || null,
      company:             b.company?.trim() || null,
      job_title:           b.job_title?.trim() || null,
      employed_duration:   b.employed_duration || null,
      gross_income:        b.gross_income || null,
      emp_address:         b.emp_address || null,
      emp_city:            b.emp_city || null,
      emp_state:           b.emp_state || null,
      supervisor:          b.supervisor || null,
      res_type:            b.res_type || null,
      res_bedrooms:        b.res_bedrooms || null,
      res_rent:            b.res_rent || null,
      res_address:         b.res_address || null,
      res_city:            b.res_city || null,
      res_state:           b.res_state || null,
      res_zip:             b.res_zip || null,
      res_duration:        b.res_duration || null,
      res_lease_exp:       b.res_lease_exp || null,
      res_why_moving:      b.res_why_moving || null,
      ref1_name:           b.ref1_name || null,
      ref1_rel:            b.ref1_rel || null,
      ref1_phone:          b.ref1_phone || null,
      ref2_name:           b.ref2_name || null,
      ref2_rel:            b.ref2_rel || null,
      ref2_phone:          b.ref2_phone || null,
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

// GET /api/applications — List all (admin)
router.get('/', requireAuth, (req, res) => {
  try {
    let apps = q.getAllApplications();
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

// GET /api/applications/stats
router.get('/stats', requireAuth, (req, res) => {
  try { res.json(q.getStats()); }
  catch (err) { res.status(500).json({ error: 'Failed to fetch stats' }); }
});

// GET /api/applications/:id
router.get('/:id', requireAuth, (req, res) => {
  try {
    const app = q.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const emailLog = q.getEmailLog(app.id);
    res.json({ application: app, emailLog });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch application' }); }
});

// PUT /api/applications/:id/approve
router.put('/:id/approve', requireAuth, async (req, res) => {
  try {
    const app = q.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    if (app.status === 'approved') return res.status(400).json({ error: 'Already approved' });

    const leaseToken = uuidv4();
    const leaseUrl   = `${process.env.APP_URL || 'http://localhost:3000'}/lease?token=${leaseToken}`;

    q.updateStatus({
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
      bank_name:      req.body.bank_name || null,
      account_name:   req.body.account_name || null,
      account_number: req.body.account_number || null,
      routing_number: req.body.routing_number || null,
      monthly_rent:   req.body.monthly_rent || null,
      security_deposit: req.body.security_deposit || null,
      cleaning_fee:   req.body.cleaning_fee || null,
      bank_addr:      req.body.bank_addr || null,
      beneficiary_addr: req.body.beneficiary_addr || null,
    };
    sendEmail(app.email, approvalEmail(app, leaseUrl, paymentDetails))
      .then(() => q.logEmail(app.id, 'approved', app.email, 1))
      .catch(err => { console.error('Email error:', err.message); q.logEmail(app.id, 'approved', app.email, 0); });

    res.json({ success: true, message: 'Approved. Email sent.', leaseUrl });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to approve' }); }
});

// PUT /api/applications/:id/reject
router.put('/:id/reject', requireAuth, async (req, res) => {
  try {
    const app = q.getApplicationById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    if (app.status === 'rejected') return res.status(400).json({ error: 'Already rejected' });

    q.updateStatus({ id: app.id, status: 'rejected', admin_notes: req.body.notes || null, lease_token: null, reviewed_by: req.admin.email });

    const updated = q.getApplicationById(app.id);
    sendEmail(app.email, rejectionEmail(updated))
      .then(() => q.logEmail(app.id, 'rejected', app.email, 1))
      .catch(err => { console.error('Email error:', err.message); q.logEmail(app.id, 'rejected', app.email, 0); });

    res.json({ success: true, message: 'Rejected. Notification sent.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to reject' }); }
});

// GET /api/applications/lease/:token — Public
router.get('/lease/:token', (req, res) => {
  try {
    const app = q.getApplicationByLeaseToken(req.params.token);
    if (!app || app.status !== 'approved') return res.status(404).json({ error: 'Lease not found' });
    res.json({
      ref_number: app.ref_number, first_name: app.first_name, last_name: app.last_name,
      email: app.email, move_in_date: app.move_in_date, admin_notes: app.admin_notes,
      monthly_rent: app.monthly_rent, security_deposit: app.security_deposit,
      cleaning_fee: app.cleaning_fee, unit_address: app.unit_address,
      phone: app.phone,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to retrieve lease' }); }
});


// POST /api/applications/lease/:token/confirm — Tenant signs + uploads receipt
router.post('/lease/:token/confirm', async (req, res) => {
  try {
    const app = q.getApplicationByLeaseToken(req.params.token);
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

    // Build confirmation email to admin with receipt attached info
    const isImage = receipt_type && receipt_type.startsWith('image/');
    const receiptSection = isImage
      ? '<p>Receipt preview is embedded below.</p><div style="margin-top:12px;"><img src="' + receipt_data + '" style="max-width:100%;max-height:400px;border-radius:4px;border:1px solid #e8e6e1;" alt="Payment Receipt"/></div>'
      : '<p>A PDF receipt was uploaded. File name: <strong>' + receipt_name + '</strong></p>';

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
      '</style></head><body><div class="wrap">' +
      '<div class="header"><div class="logo">GreyHaven — Lease Signed Notification</div></div>' +
      '<div class="body">' +
      '<h2>Lease Agreement Signed ✅</h2>' +
      '<p>A tenant has signed their lease agreement and submitted payment proof.</p>' +
      '<table>' +
      '<tr><td>Tenant Name</td><td>' + tenant_name + '</td></tr>' +
      '<tr><td>Tenant Email</td><td>' + tenant_email + '</td></tr>' +
      '<tr><td>Tenant Phone</td><td>' + (tenant_phone || '—') + '</td></tr>' +
      '<tr><td>Reference #</td><td>' + app.ref_number + '</td></tr>' +
      '<tr><td>Signed On</td><td>' + signedDate + '</td></tr>' +
      '<tr><td>Status</td><td><span class="badge">Lease Signed</span></td></tr>' +
      '</table>' +
      '<p><strong>Payment Receipt:</strong></p>' +
      receiptSection +
      '</div></div></body></html>';

    // Send to admin
    await sendEmail(adminEmail, {
      subject: 'Lease Signed — ' + tenant_name + ' (' + app.ref_number + ')',
      html: adminHtml
    });

    // Send confirmation to tenant
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
      '<p>We have received your signed lease agreement and payment receipt. Our team will review and contact you within <strong>1-2 business days</strong> to confirm your move-in details.</p>' +
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

    q.logEmail(app.id, 'lease_signed', tenant_email, 1);
    res.json({ success: true, message: 'Lease signed and confirmed. Check your email.' });

  } catch (err) {
    console.error('Lease confirm error:', err);
    res.status(500).json({ error: 'Failed to process lease confirmation: ' + err.message });
  }
});

module.exports = router;
