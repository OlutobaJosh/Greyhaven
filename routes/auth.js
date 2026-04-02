// routes/auth.js — Admin login
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { q }   = require('../db');

router.post('/login', async (req, res) => { // added async
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const admin = await q.getAdminByEmail(email.toLowerCase()); // added await
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '8h' }
  );
  res.json({ success: true, token, admin: { id: admin.id, email: admin.email, name: admin.name } });
});

router.get('/me', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    res.json({ admin: decoded });
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
});

module.exports = router;
