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

app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : '*',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Global rate limit — 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests.' }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add MIME type for WebP images
app.use((req, res, next) => {
  if (req.url.endsWith('.webp')) {
    res.type('image/webp');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',         require('./routes/auth'));
// submitLimiter is now applied INSIDE applications.js on the POST route only
app.use('/api/applications', require('./routes/applications'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'GreyHaven Residential', timestamp: new Date().toISOString() });
});

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

initDB().then(() => {
  seedAdmin();
  // ── AI CHAT ROUTE ──────────────────────────────────────────────
// Add this to server.js after your existing routes

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const systemPrompt = `You are the GreyHaven Residential virtual assistant — a helpful, professional, and friendly AI for GreyHaven Residential property management.

You help with:
- Rental application process and requirements
- Required documents (ID, paystubs, references, credit check)
- Lease signing and lease terms
- Rent payment methods and due dates
- Maintenance request submission
- Move-in and move-out procedures
- Pet policies
- Parking and amenities
- Contact information and office hours
- General property questions

GreyHaven Residential key info:
- Applications submitted online via the website
- Required documents: government-issued ID, 2 recent paystubs or proof of income, 2 references
- Lease is signed digitally on the platform
- Maintenance requests submitted through the resident portal
- Office hours: Monday to Friday, 9 AM to 5 PM
- Response time for maintenance: 24-48 hours for non-emergency, same day for emergency

Keep answers concise, helpful, and professional. If you don't know something specific, direct the user to contact GreyHaven directly.
Do not make up specific prices, addresses, or unit details you don't know.`;

  const messages = [
    ...(history || []),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.5,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Groq error:', err);
      return res.status(500).json({ error: 'AI service unavailable.' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({ error: 'No response from AI.' });
    }

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});
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
