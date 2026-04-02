// db.js — Turso (hosted SQLite) — data persists forever, free tier
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

let client;

// ── Initialize connection ─────────────────────────────────────────────────────
async function initDB() {
  if (client) return client;

  const url   = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url || !token) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables are required');
  }

  client = createClient({ url, authToken: token });
  console.log('✅ Connected to Turso database');

  await createSchema();
  await seedAdmin();
  return client;
}

// ── Helper: run a write statement ─────────────────────────────────────────────
async function run(sql, params) {
  const result = await client.execute({ sql, args: params || [] });
  return result.lastInsertRowid ? Number(result.lastInsertRowid) : null;
}

// ── Helper: get one row ───────────────────────────────────────────────────────
async function get(sql, params) {
  const result = await client.execute({ sql, args: params || [] });
  return result.rows[0] || null;
}

// ── Helper: get all rows ──────────────────────────────────────────────────────
async function all(sql, params) {
  const result = await client.execute({ sql, args: params || [] });
  return result.rows;
}

// ── Schema ────────────────────────────────────────────────────────────────────
async function createSchema() {
  await client.execute(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    dob TEXT,
    drivers_license TEXT,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    move_in_date TEXT,
    other_occupants TEXT,
    pets TEXT,
    vehicles TEXT,
    crime_history TEXT,
    bankruptcy_history TEXT,
    eviction_history TEXT,
    company TEXT,
    job_title TEXT,
    employed_duration TEXT,
    gross_income TEXT,
    emp_address TEXT,
    emp_city TEXT,
    emp_state TEXT,
    supervisor TEXT,
    res_type TEXT,
    res_bedrooms TEXT,
    res_rent TEXT,
    res_address TEXT,
    res_city TEXT,
    res_state TEXT,
    res_zip TEXT,
    res_duration TEXT,
    res_lease_exp TEXT,
    res_why_moving TEXT,
    ref1_name TEXT,
    ref1_rel TEXT,
    ref1_phone TEXT,
    ref2_name TEXT,
    ref2_rel TEXT,
    ref2_phone TEXT,
    admin_notes TEXT,
    lease_token TEXT UNIQUE,
    monthly_rent TEXT,
    security_deposit TEXT,
    cleaning_fee TEXT,
    unit_address TEXT,
    lease_signed_at TEXT,
    payment_confirmed INTEGER DEFAULT 0,
    payment_confirmed_at TEXT,
    booking_receipt_sent INTEGER DEFAULT 0,
    submitted_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    reviewed_by TEXT
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER,
    type TEXT NOT NULL,
    to_email TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')),
    success INTEGER DEFAULT 1
  )`);

  console.log('✅ Schema ready');
}

// ── Seed admin ────────────────────────────────────────────────────────────────
async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@greyhaven.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const existing   = await get('SELECT id FROM admins WHERE email = ?', [adminEmail]);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 12);
    await run('INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)',
        [adminEmail, hash, 'GreyHaven Admin']);
    console.log('✅ Admin created: ' + adminEmail);
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────
const q = {
  async insertApplication(app) {
    const cols = Object.keys(app);
    const vals = Object.values(app);
    const id = await run(
      'INSERT INTO applications (' + cols.join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')',
      vals
    );
    if (id) return this.getApplicationById(id);
    return get('SELECT * FROM applications WHERE ref_number = ?', [app.ref_number]);
  },

  getAllApplications() {
    return all('SELECT * FROM applications ORDER BY submitted_at DESC');
  },

  getApplicationById(id) {
    return get('SELECT * FROM applications WHERE id = ?', [id]);
  },

  getApplicationByRef(ref) {
    return get('SELECT * FROM applications WHERE ref_number = ?', [ref]);
  },

  getApplicationByLeaseToken(token) {
    return get('SELECT * FROM applications WHERE lease_token = ?', [token]);
  },

  async updateStatus(p) {
    await run(
      `UPDATE applications SET
        status = ?,
        admin_notes = ?,
        lease_token = ?,
        reviewed_at = datetime('now'),
        reviewed_by = ?,
        monthly_rent = ?,
        security_deposit = ?,
        cleaning_fee = ?,
        unit_address = ?
      WHERE id = ?`,
      [p.status, p.admin_notes, p.lease_token, p.reviewed_by,
       p.monthly_rent || null, p.security_deposit || null,
       p.cleaning_fee || null, p.unit_address || null, p.id]
    );
  },

  getStats() {
    return get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM applications`);
  },

  getAdminByEmail(email) {
    return get('SELECT * FROM admins WHERE email = ?', [email]);
  },

  logEmail(app_id, type, to_email, success) {
    return run('INSERT INTO email_log (app_id, type, to_email, success) VALUES (?, ?, ?, ?)',
        [app_id, type, to_email, success]);
  },

  getEmailLog(app_id) {
    return all('SELECT * FROM email_log WHERE app_id = ? ORDER BY sent_at DESC', [app_id]);
  },

  markLeaseSigned(id, signed_at) {
    return run('UPDATE applications SET lease_signed_at = ? WHERE id = ?', [signed_at, id]);
  },

  confirmPayment(id, confirmed_by) {
    return run(
      `UPDATE applications SET
        payment_confirmed = 1,
        payment_confirmed_at = datetime('now'),
        reviewed_by = ?
      WHERE id = ?`,
      [confirmed_by, id]
    );
  },

  markReceiptSent(id) {
    return run('UPDATE applications SET booking_receipt_sent = 1 WHERE id = ?', [id]);
  }
};

module.exports = { initDB, q, seedAdmin };
