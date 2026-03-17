# IM3 Website — Integration Reference for WhatsApp Bot

> This document describes the IM3 Website project architecture, database, and automation flows so a separate WhatsApp bot project can connect to the same database and trigger all existing processes.

---

## 1. Architecture Overview

| Layer | Stack |
|-------|-------|
| Backend | Express 5 + Node.js + TypeScript |
| Frontend | React 19 SPA (Vite, Tailwind CSS, shadcn/ui, wouter) |
| Database | PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`, `pg` Pool) |
| Connection | `DATABASE_URL` env var → `new Pool({ connectionString })` → `drizzle(pool)` |
| Auth | Passport.js local strategy + connect-pg-simple sessions |
| Email | Resend API + Claude AI for content generation |
| Calendar | Google Calendar API v3 (JWT service account, domain-wide delegation) |
| Storage | Google Drive API (folders, sheets, recordings) |
| WhatsApp | Meta Cloud API v21.0 |
| Scheduling | node-cron (email queue, WhatsApp queue, substatus updates, etc.) |
| Deployment | Railway (reverse proxy, `trust proxy` enabled) |
| Timezone | America/Bogota (UTC-5) for all scheduling |

---

## 2. Database — All Tables

Schema file: `shared/schema.ts`

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Admin auth | id, username, password (scrypt hash) |
| `diagnostics` | Full diagnostic form (30+ fields) | id, fechaCita, horaCita, empresa, industria, participante, email, telefono, objetivos[], herramientas, nivelTech, presupuesto, meetLink, meetingStatus, googleDriveUrl, sentToGhl, createdAt |
| `contacts` | CRM contacts (normalized from diagnostics) | id, diagnosticId, email, nombre, empresa, telefono, status (lead/contacted/scheduled/converted), substatus, tags[], leadScore, optedOut, createdAt |

### Communication Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `email_templates` | AI prompt templates for email sequence | id, nombre, subjectPrompt, bodyPrompt, sequenceOrder, delayDays, isActive |
| `sent_emails` | Email queue with status tracking | id, contactId, templateId, subject, body, status (pending/sent/opened/clicked/bounced/failed), scheduledFor, sentAt, retryCount |
| `whatsapp_messages` | WhatsApp queue with status tracking | id, contactId, phone, message, templateName, templateParams (JSON), mediaUrl, mediaType, status (pending/sent/delivered/read/failed), scheduledFor, sentAt, deliveredAt, readAt, whatsappMessageId, errorMessage, retryCount |

### CRM Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `contact_notes` | Internal notes per contact | id, contactId, content, authorId, createdAt |
| `tasks` | Follow-up reminders | id, contactId, title, description, dueDate, priority (low/medium/high), status (pending/completed), completedAt |
| `activity_log` | Audit trail | id, contactId, type, description, metadata (JSON), createdAt |
| `ai_insights_cache` | Per-contact AI analysis | id, contactId, insight (JSON: summary, nextActions[], talkingPoints[], riskLevel, riskReason, estimatedValue), generatedAt |
| `deals` | Revenue pipeline | id, contactId, title, value (USD), stage (qualification/proposal/negotiation/closed_won/closed_lost), lostReason, expectedCloseDate, closedAt |
| `notifications` | In-app admin notifications | id, type, title, description, contactId, isRead, createdAt |
| `appointments` | Manual meetings | id, contactId, title, date (YYYY-MM-DD), time, duration (min), meetLink, googleCalendarEventId, status, recordingUrl, transcriptUrl |

### Marketing Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `abandoned_leads` | Emails captured but form not completed | id, email, capturedAt, converted, emailSent |
| `newsletter_subscribers` | Newsletter list | id, email, isActive, subscribedAt |
| `newsletter_sends` | Newsletter campaigns | id, subject, content, blogPostId, sentAt, recipientCount |
| `blog_categories` | Blog taxonomy | id, name, slug |
| `blog_posts` | Blog articles | id, title, slug, excerpt, content, categoryId, tags[], status (draft/published), publishedAt |

---

## 3. Diagnostic Form Fields

The WhatsApp bot must collect these fields. All map to `diagnostics` table columns.

### Step 0 — Cita (Appointment)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fechaCita` | string | ✅ | Date "YYYY-MM-DD" |
| `horaCita` | string | ✅ | Time "HH:MM AM/PM" or "HH:MM" |

### Step 1 — Información General
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `empresa` | string | ✅ | Company name |
| `industria` | string | ✅ | Industry |
| `anosOperacion` | string | ✅ | Years in operation |
| `empleados` | string | ✅ | Employee count |
| `ciudades` | string | ✅ | Cities of operation |
| `participante` | string | ✅ | Contact person name |
| `email` | string | ✅ | Email address |
| `telefono` | string | ❌ | Phone number |

### Step 2 — Contexto
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `objetivos` | string[] | ✅ | Business objectives (multi-select) |
| `resultadoEsperado` | string | ✅ | Expected outcome |

### Step 3 — Modelo de Negocio
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productos` | string | ✅ | Products/services |
| `volumenMensual` | string | ✅ | Monthly volume |
| `clientePrincipal` | string | ✅ | Main client type |
| `clientePrincipalOtro` | string | ❌ | Other client (if "otro" selected) |

### Step 4 — Adquisición
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `canalesAdquisicion` | string[] | ✅ | Acquisition channels (multi-select) |
| `canalAdquisicionOtro` | string | ❌ | Other channel |
| `canalPrincipal` | string | ✅ | Primary channel |

### Step 5 — Herramientas
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `herramientas` | string | ✅ | Current tools/stack |
| `conectadas` | string | ✅ | Are tools connected? |
| `conectadasDetalle` | string | ❌ | Connection details |

### Step 6 — Madurez Tecnológica
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `nivelTech` | string | ✅ | Tech maturity level |
| `usaIA` | string | ✅ | Uses AI? |
| `usaIAParaQue` | string | ❌ | What AI is used for |
| `comodidadTech` | string | ✅ | Comfort with technology |
| `familiaridad` | JSON | ✅ | `{ automatizacion, crm, ia, integracion, desarrollo }` — each a string rating |

### Step 7 — Prioridades
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `areaPrioridad` | string[] | ✅ | Priority areas (multi-select) |
| `presupuesto` | string | ✅ | Budget range |

---

## 4. What Happens When a Diagnostic is Submitted

**Endpoint:** `POST /api/diagnostic` (in `server/routes.ts` lines 140-475)

This is the **critical integration point**. When the form is submitted, 12 things happen:

### The Complete Flow

```
Form Submit
  │
  ├─ 1. INSERT → diagnostics table
  │
  ├─ 2. ASYNC → createDiagnosticInDrive() → Google Drive folder + sheet
  │         └─ updates diagnostics.googleDriveUrl
  │
  ├─ 3. ASYNC → GHL webhook (if GHL_WEBHOOK_URL set)
  │         └─ updates diagnostics.sentToGhl = true
  │
  ├─ 4. ASYNC → createCalendarEvent() → Google Calendar + Meet link
  │         └─ updates diagnostics.meetLink
  │
  ├─ 5. INSERT → contacts table (linked via diagnosticId)
  │
  ├─ 6. calculateLeadScore() → updates contacts.leadScore
  │
  ├─ 7. INSERT → 2 tasks (review diagnostic + post-meeting follow-up)
  │
  ├─ 8. INSERT → notification (type: "new_lead")
  │
  ├─ 9. INSERT → 7 sent_emails records (with calculated scheduledFor times)
  │
  ├─ 10. INSERT → 4 whatsapp_messages records (with calculated scheduledFor times)
  │
  ├─ 11. UPDATE → abandonedLeads.converted = true (if email existed)
  │
  └─ 12. INSERT → activityLog entries for all actions
```

### Email Sequence Timing

| # | Template Name | When Sent |
|---|--------------|-----------|
| 0 | `confirmacion` | Immediately |
| 1 | `caso_exito` | Next day 10:00 AM COT |
| 2 | `insight_educativo` | Day 3 at 10:00 AM COT |
| 3 | `prep_agenda` | 24h before appointment |
| 4 | `recordatorio_6h` | 6h before appointment |
| 5 | `micro_recordatorio` | 1h before appointment |
| 6 | `seguimiento_post` | 5h after appointment |

- Templates 4-5 use fixed HTML (not AI-generated)
- All others use Claude AI to generate personalized subject + body
- Emails skip if not enough time before appointment

### WhatsApp Sequence Timing

| Template Name | Type | When Sent |
|--------------|------|-----------|
| `im3_bienvenida` | Meta template | 30 min after form |
| `im3_recordatorio` | Meta template | 20h before appointment |
| `im3_recordatorio_hora` | Meta template | 1h before appointment |
| _(AI-generated)_ | Free-form text | 2h after appointment |

- Template messages must be pre-approved in Meta WhatsApp Manager
- Free-form text only works within 24h service window

---

## 5. Cron Jobs

All defined in `server/email-scheduler.ts`:

| Schedule | Function | What It Does |
|----------|----------|-------------|
| Every 5 min | `processEmailQueue()` | Sends pending emails from `sent_emails` where `scheduledFor <= now` |
| Every 5 min | `processWhatsAppQueue()` | Sends pending WhatsApp from `whatsapp_messages` where `scheduledFor <= now` |
| Every 30 min | `updateContactSubstatuses()` | Updates contact substatus based on activity patterns |
| Every 30 min | `checkOverdueTasks()` | Creates notifications for overdue tasks |
| Every 30 min | `processPostMeetingRecordings()` | Searches Drive for Meet recordings, moves to client folders |
| Monday 7 AM COT | `sendWeeklyNewsletter()` | Sends newsletter digest to active subscribers |

**Important:** These cron jobs run in THIS project's server process. The WhatsApp bot does NOT need to run them — it just needs to insert records into the database and the crons will process them automatically.

---

## 6. Integration Strategy for WhatsApp Bot

### Option A: Direct Database Insert (Recommended)

The WhatsApp bot connects to the **same PostgreSQL database** using `DATABASE_URL` and:

1. Collects all diagnostic fields via WhatsApp conversation
2. Inserts into `diagnostics` table
3. Inserts into `contacts` table (with `diagnosticId` link)
4. Inserts scheduled records into `sent_emails` table (use timing logic from `server/email-scheduler.ts` → `calculateEmailTime()`)
5. Inserts scheduled records into `whatsapp_messages` table (use timing logic from `server/whatsapp.ts` → `calculateWhatsAppSchedule()`)
6. Inserts into `tasks`, `notifications`, `activityLog` tables
7. Calls Google Calendar API for Meet link (or delegates to this server)
8. Calls Google Drive API for folder creation (or delegates to this server)

**Pros:** No network dependency between services, bot works even if website is down
**Cons:** Must replicate the insertion logic, needs Google API credentials

### Option B: Call the API Endpoint

The WhatsApp bot calls `POST https://im3systems.com/api/diagnostic` with the complete JSON payload. Everything triggers automatically.

**Pros:** Zero duplication, single source of truth
**Cons:** Requires website to be running, network latency, needs auth handling

### Hybrid Approach

Bot inserts diagnostic + contact into DB directly, then calls a lightweight webhook endpoint on this server to trigger Google Calendar/Drive operations (which need service account credentials that should stay on one server).

---

## 7. Environment Variables

### Both projects need (shared):
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
WHATSAPP_TOKEN=<Meta Cloud API token>
WHATSAPP_PHONE_ID=<WhatsApp Business phone number ID>
WHATSAPP_VERIFY_TOKEN=<webhook verification string>
ANTHROPIC_API_KEY=<Claude API key>
```

### Only this project needs:
```
RESEND_API_KEY=<Resend email API key>
EMAIL_FROM=IM3 Systems <info@im3systems.com>
ADMIN_EMAIL=info@im3systems.com
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service account email>
GOOGLE_PRIVATE_KEY=<service account private key>
GOOGLE_DRIVE_FOLDER_ID=<root Drive folder ID>
GOOGLE_DRIVE_IMPERSONATE=<email to impersonate>
SESSION_SECRET=<session encryption key>
ADMIN_USERNAME=<CRM login>
ADMIN_PASSWORD=<CRM password>
BASE_URL=https://im3systems.com
GHL_WEBHOOK_URL=<GoHighLevel webhook (optional)>
```

---

## 8. Key Server Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `shared/schema.ts` | All DB table definitions | Table objects + TypeScript types |
| `server/db.ts` | DB connection + migrations | `db`, `pool`, `runMigrations()` |
| `server/routes.ts` | All API endpoints | `POST /api/diagnostic` + 40+ admin endpoints |
| `server/email-scheduler.ts` | Cron job processors | `processEmailQueue()`, `processWhatsAppQueue()`, `calculateEmailTime()` |
| `server/whatsapp.ts` | WhatsApp Business API | `sendWhatsAppText()`, `sendWhatsAppTemplate()`, `sendWhatsAppAudio()`, `calculateWhatsAppSchedule()`, `formatPhoneForWhatsApp()` |
| `server/google-calendar.ts` | Calendar + Meet links | `createCalendarEvent()` |
| `server/google-drive.ts` | Drive folder/sheet mgmt | `createDiagnosticInDrive()`, `moveRecordingToClientFolder()` |
| `server/lead-scoring.ts` | Lead quality scoring | `calculateLeadScore()` |
| `server/email-ai.ts` | AI content generation | `generateEmailContent()`, `generateWhatsAppMessage()` |
| `server/seed-templates.ts` | Email template definitions | 8 templates with prompts |
| `server/email-sender.ts` | Resend email sending | `sendEmail()`, `isEmailConfigured()` |
| `server/date-utils.ts` | Date parsing helpers | `parseFechaCita()` |
| `server/auth.ts` | Passport.js auth | `setupAuth()`, `requireAuth` middleware |
| `drizzle.config.ts` | Drizzle ORM config | Schema path, output dir |

---

## 9. Key Dependencies

```
drizzle-orm ^0.39.3        — ORM
pg ^8.16.3                 — PostgreSQL driver
@anthropic-ai/sdk ^0.78.0  — Claude AI
resend ^6.9.3              — Email sending
googleapis ^171.4.0        — Google Calendar/Drive
node-cron ^4.2.1           — Task scheduling
zod ^3.25.76               — Validation
express ^5.0.1             — HTTP server
```

---

## 10. Phone Number Format

Colombian phone numbers are handled by `formatPhoneForWhatsApp()` in `server/whatsapp.ts`:

- Input: `"3001234567"` → Output: `"573001234567"`
- Input: `"+57 300 123 4567"` → Output: `"573001234567"`
- Input: `"57300123456"` → Output: `"573001234567"` (already has country code)
- 10-digit numbers get `57` prefix
- All formatting characters stripped

WhatsApp API expects E.164 format without the `+` prefix.
