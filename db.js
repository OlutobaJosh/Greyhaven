// db.js — Works locally (file-based) AND on Railway (persistent volume)
const path = require('path');
const fs   = require('fs');
const bcrypt = require('bcryptjs');

// Railway mounts persistent volumes at /data — fall back to local dir
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_PATH  = path.join(DATA_DIR, 'greyhaven.db');

let SQL, db;

async function initDB() {
  if (db) return db;
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log(`📂 Loaded existing DB from: ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`🆕 Created new DB at: ${DB_PATH}`);
  }
  createSchema();
  runMigrations();
  return db;
}

function save() {
  if (!db) return;
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch(e) {
    console.error('DB save error:', e.message);
  }
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.id || null;
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function createSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
    dob TEXT, drivers_license TEXT, phone TEXT NOT NULL, email TEXT NOT NULL,
    move_in_date TEXT, other_occupants TEXT, pets TEXT, vehicles TEXT,
    crime_history TEXT, bankruptcy_history TEXT, eviction_history TEXT,
    company TEXT, job_title TEXT, employed_duration TEXT, gross_income TEXT,
    emp_address TEXT, emp_city TEXT, emp_state TEXT, supervisor TEXT,
    res_type TEXT, res_bedrooms TEXT, res_rent TEXT, res_address TEXT,
    res_city TEXT, res_state TEXT, res_zip TEXT, res_duration TEXT,
    res_lease_exp TEXT, res_why_moving TEXT,
    ref1_name TEXT, ref1_rel TEXT, ref1_phone TEXT,
    ref2_name TEXT, ref2_rel TEXT, ref2_phone TEXT,
    admin_notes TEXT, lease_token TEXT UNIQUE,
    monthly_rent TEXT, security_deposit TEXT, cleaning_fee TEXT, unit_address TEXT,
    submitted_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT, reviewed_by TEXT
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER, type TEXT NOT NULL, to_email TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')), success INTEGER DEFAULT 1
  );`);
  save();
}

function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@greyhaven.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const existing   = get('SELECT id FROM admins WHERE email = ?', [adminEmail]);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 12);
    run('INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)',
        [adminEmail, hash, 'GreyHaven Admin']);
    console.log(`✅ Admin created: ${adminEmail}`);
  }
}

const q = {
  insertApplication(app) {
    const cols = Object.keys(app);
    const vals = Object.values(app);
    const id = run(
      `INSERT INTO applications (${cols.join(', ')}) VALUES (${cols.map(()=>'?').join(', ')})`,
      vals
    );
    if (id) return this.getApplicationById(id);
    return get('SELECT * FROM applications WHERE ref_number = ?', [app.ref_number]);
  },
  getAllApplications:          ()      => all('SELECT * FROM applications ORDER BY submitted_at DESC'),
  getApplicationById:          (id)    => get('SELECT * FROM applications WHERE id = ?', [id]),
  getApplicationByRef:         (ref)   => get('SELECT * FROM applications WHERE ref_number = ?', [ref]),
  getApplicationByLeaseToken:  (token) => get('SELECT * FROM applications WHERE lease_token = ?', [token]),
  updateStatus({ id, status, admin_notes, lease_token, reviewed_by, monthly_rent, security_deposit, cleaning_fee, unit_address }) {
    run(`UPDATE applications SET status=?, admin_notes=?, lease_token=?,
         reviewed_at=datetime('now'), reviewed_by=?,
         monthly_rent=?, security_deposit=?, cleaning_fee=?, unit_address=?
         WHERE id=?`,
        [status, admin_notes, lease_token, reviewed_by,
         monthly_rent||null, security_deposit||null, cleaning_fee||null, unit_address||null, id]);
  },
  getStats() {
    return get(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected
      FROM applications`);
  },
  getAdminByEmail: (email) => get('SELECT * FROM admins WHERE email = ?', [email]),
  logEmail(app_id, type, to_email, success) {
    run('INSERT INTO email_log (app_id, type, to_email, success) VALUES (?,?,?,?)',
        [app_id, type, to_email, success]);
  },
  getEmailLog: (app_id) => all('SELECT * FROM email_log WHERE app_id=? ORDER BY sent_at DESC', [app_id]),
};

module.exports = { initDB, q, seedAdmin };
