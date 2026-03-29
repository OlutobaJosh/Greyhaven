// server.js — GreyHaven Residential API Server
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const { initDB, seedAdmin } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1); // Required for Render/Railway reverse proxy
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : '*',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 100, message: { error: 'Too many requests.' } });
const submitLimiter = rateLimit({ windowMs: 60*60*1000, max: 10, message: { error: 'Too many applications submitted.' } });
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' })); // 10mb needed for base64 receipt images
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',                       require('./routes/auth'));
app.use('/api/applications', submitLimiter, require('./routes/applications'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'GreyHaven Residential', timestamp: new Date().toISOString() });
});


// Serve lease page at /lease?token=xxx (without .html)
app.get('/lease', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lease.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start: init DB first, then listen ────────────────────────────────────────
initDB().then(() => {
  seedAdmin();
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║       GreyHaven Residential — Server          ║
╠═══════════════════════════════════════════════╣
║  Running on   : http://localhost:${PORT}         ║
║  Admin Portal : http://localhost:${PORT}/admin.html ║
╚═══════════════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});
