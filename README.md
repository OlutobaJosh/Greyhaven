# GreyHaven Residential — Full Stack Application

A complete property management web platform with:
- **Public site** — multi-step rental application form + sample lease viewer
- **REST API** — Express.js backend with SQLite database
- **Admin dashboard** — review, approve, reject applications with automated emails
- **Email system** — Nodemailer with beautiful HTML templates (confirmation, approval, rejection)

---

## 🗂 Project Structure

```
GreyHaven/
├── server.js              ← Express app entry point
├── db.js                  ← SQLite database + queries
├── emailService.js        ← Nodemailer + HTML email templates
├── middleware/
│   └── auth.js            ← JWT authentication middleware
├── routes/
│   ├── auth.js            ← POST /api/auth/login, GET /api/auth/me
│   └── applications.js    ← Full CRUD for applications
├── public/
│   ├── index.html         ← Public-facing website (home, apply, lease)
│   └── admin.html         ← Admin portal
├── .env.example           ← Environment variable template
├── package.json
└── GreyHaven.db           ← Auto-created SQLite database (on first run)
```

---

## 🚀 Setup & Installation

### 1. Install dependencies

```bash
cd GreyHaven
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
PORT=3000
JWT_SECRET=a_very_long_random_secret_here
ADMIN_EMAIL=admin@GreyHaven.com
ADMIN_PASSWORD=YourSecurePassword123!

# Gmail SMTP (recommended)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password   # See note below
EMAIL_FROM=GreyHaven Residential <no-reply@GreyHaven.com>
APP_URL=http://localhost:3000
```

> **Gmail App Password**: Go to myaccount.google.com → Security → 2-Step Verification → App Passwords. Create one for "Mail". Use that 16-character code as `SMTP_PASS`.

### 3. Run the server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

### 4. Open in browser

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Public site |
| `http://localhost:3000/admin.html` | Admin portal |

---

## 🔄 Application Workflow

```
Applicant fills form → POST /api/applications
        ↓
  Stored in SQLite + confirmation email sent to applicant
        ↓
  Admin logs into /admin.html
        ↓
  Admin reviews → clicks Approve or Reject
        ↓
  ┌─────────────────┐    ┌──────────────────────┐
  │   APPROVED       │    │     REJECTED          │
  │                 │    │                      │
  │ • Unique lease  │    │ • Rejection email    │
  │   token created │    │   sent to applicant  │
  │ • Approval email│    └──────────────────────┘
  │   sent with     │
  │   lease link    │
  │ • Applicant     │
  │   reviews lease │
  │   online        │
  └─────────────────┘
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin login → returns JWT |
| GET  | `/api/auth/me` | Verify token |

### Applications (public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/applications` | Submit new application |
| GET  | `/api/applications/lease/:token` | Get lease data by token |

### Applications (admin — requires JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/applications` | List all (filter by ?status=pending/approved/rejected) |
| GET  | `/api/applications/stats` | Dashboard stats |
| GET  | `/api/applications/:id` | Single application + email log |
| PUT  | `/api/applications/:id/approve` | Approve + send email |
| PUT  | `/api/applications/:id/reject` | Reject + send email |

---

## 🌐 Deploying to Production

### Option A: Railway (easiest)
1. Push to GitHub
2. Connect repo at railway.app
3. Add environment variables in Railway dashboard
4. Deploy — Railway auto-detects Node.js

### Option B: Render
1. Push to GitHub
2. New Web Service at render.com → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env vars in dashboard

### Option C: VPS (DigitalOcean, Linode)
```bash
# Install PM2 for process management
npm install -g pm2
pm2 start server.js --name GreyHaven
pm2 save
pm2 startup

# Use Nginx as reverse proxy
# Point domain to localhost:3000
```

---

## 🔒 Security Notes

- JWT tokens expire after 8 hours
- Rate limiting: 100 req/15min globally, 5 applications/hour per IP
- Helmet.js adds security headers
- Passwords hashed with bcrypt (12 rounds)
- Change `JWT_SECRET` and `ADMIN_PASSWORD` before deploying

---

## 📧 Email Testing (no real SMTP)

Use **Mailtrap** (mailtrap.io) for development — it catches emails without sending them:

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_pass
```

Sign up free at mailtrap.io, create an inbox, and copy the SMTP credentials.

