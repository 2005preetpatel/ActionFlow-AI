# ActionFlow AI – Intelligent Inbox & Task Management

ActionFlow AI turns a pile of emails and chat messages into an organised, prioritised task list.
Import a JSON export (or type a message in), and Google Gemini summarises every message, classifies
its category and intent, sets a priority, decides whether a reply is needed, drafts that reply and
extracts concrete tasks — with due dates **only** when the message actually states one.

> Built for the Traction Shastra Full Stack Developer Intern assignment.
> See **[FEATURES.md](FEATURES.md)** for the full feature list, API reference, AI prompts and database design.

## Highlights

- **JSON import with validation** – strict check of the mandatory structure (unique ids, `email`/`message` type, ISO 8601 dates…), per-message error report, data stored in **MySQL**.
- **AI analysis (Gemini)** – summary, category, intent, priority + reason, sentiment, response-required flag, suggested reply. Messages are analysed in **batches** using Gemini's structured JSON output, so a 30-message inbox costs ~6 API calls.
- **Trustworthy task extraction** – no tasks for informational messages; a deadline is kept only if the model quotes the exact deadline words and those words really exist in the message (no invented dates).
- **Dashboard** – total/analysed messages, pending/in-progress/completed tasks, high-priority and overdue tasks, replies owed, category breakdown.
- **Task management** – edit title/description/priority/status/due date, inline status & priority changes, search and filters, manual tasks.
- **Bonus features** – Kanban board (drag & drop), duplicate task detection, AI smart search (plain English → filters), AI daily briefing, task dependencies (with cycle protection and completion blocking), CSV export, manual message entry, reply rewriting in different tones.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Tailwind CSS v4, lucide-react icons |
| Backend | Node.js 20+ / Express 4 (REST API), zod validation |
| Database | MySQL 8 (`mysql2` driver, raw parameterised SQL) |
| AI | Google Gemini API (`gemini-3.5-flash` by default) via REST with structured JSON output |

*Why Node.js instead of Laravel?* The brief lets candidates choose their stack. I used one language (JavaScript) end-to-end
to move fast within 24 hours while keeping a clean layered structure (routes → services → AI/db).

## Project structure

```
ActionFlow-AI/
├── client/                 React app (Vite root)
│   └── src/
│       ├── pages/          Dashboard, Inbox, Tasks, Board (Kanban), Import
│       ├── components/     TaskModal, TaskRow, shared UI
│       └── api.js          Typed wrapper around the REST API
├── server/
│   ├── index.js            Express app + error handling + serves the built client
│   ├── routes.js           All REST endpoints (/api/...)
│   ├── services/           messages.js, tasks.js, analysis.js (business logic + SQL)
│   ├── ai/                 gemini.js (client), prompts.js (prompts + JSON schemas), analyzer.js (guards), heuristic.js
│   ├── lib/                messageSchema.js (JSON validation), text.js (similarity, dates), http.js
│   ├── scripts/            setup-db.js, import-sample.js
│   └── tests/              node:test unit tests
├── database/schema.sql     MySQL schema (6 tables)
├── sample_messages.json    30 fictional messages (AI-generated dataset)
├── docker-compose.yml      Optional MySQL 8 container
├── .env.example
├── FEATURES.md
└── README.md
```

## Setup

### Prerequisites

- **Node.js 20+** and npm
- **MySQL 8** – any of: a local MySQL/XAMPP install, the included `docker-compose.yml`, or a cloud MySQL
- A free **Gemini API key** from <https://aistudio.google.com/app/apikey>

### 1. Install

```bash
git clone https://github.com/2005preetpatel/ActionFlow-AI.git
cd ActionFlow-AI
npm install
```

### 2. Configure

```bash
cp .env.example .env     # Windows: copy .env.example .env
```

Edit `.env`:

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | API port | `4000` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection | `127.0.0.1`, `3306`, `actionflow`, `actionflow`, `actionflow` |
| `GEMINI_API_KEY` | Your Gemini key (never commit it) | – |
| `GEMINI_MODEL` | Gemini model id | `gemini-3.5-flash` |
| `GEMINI_FALLBACK_MODELS` | Comma-separated models tried when the main one is overloaded (503) or retired (404) | `gemini-3.1-flash-lite,gemini-3.8-flash` |
| `AI_BATCH_SIZE` | Messages per Gemini request (1–10) | `5` |
| `AI_PROVIDER` | `gemini`, or `heuristic` to run without a key | `gemini` |

If `GEMINI_API_KEY` is empty the app still runs in a clearly labelled **heuristic mode** (keyword rules), so the UI can be explored offline.

### 3. Database

**Option A – Docker**

```bash
docker compose up -d     # MySQL 8.4 on port 3306; schema is applied automatically
```

**Option B – existing MySQL** (create a user that matches `.env`, or use root):

```sql
CREATE DATABASE actionflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'actionflow'@'localhost' IDENTIFIED BY 'actionflow';
GRANT ALL PRIVILEGES ON actionflow.* TO 'actionflow'@'localhost';
```

then apply the schema:

```bash
npm run db:setup         # runs database/schema.sql  (npm run db:reset drops and recreates the tables)
```

You can also import `database/schema.sql` directly with MySQL Workbench / phpMyAdmin.

`database/actionflow_dump.sql` is a full SQL export (schema + data) taken after importing `sample_messages.json`
and running the Gemini analysis, so the AI results can be inspected even without an API key:

```bash
mysql -u actionflow -p actionflow < database/actionflow_dump.sql
```

### 4. Run

```bash
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4000/api/health>

Production-style single server: `npm run build && npm start` → <http://localhost:4000>.

### 5. Try it

1. Open **Import** and drop `sample_messages.json` (or run `npm run import:sample`).
2. Click **Analyze inbox** – a progress bar shows the batched Gemini analysis.
3. Explore the **Dashboard**, open messages in the **Inbox** (summary, priority reason, suggested reply, tasks),
   manage work in **Tasks** and the **Kanban board**, try **Smart search** and the **AI daily briefing**, and export CSV.

## Tests

```bash
npm test
```

Covers JSON validation (sample dataset + invalid cases), the anti-hallucination deadline guard, no-action filtering, duplicate detection and date handling.

## Security notes

- API keys live only in `.env` (git-ignored); `.env.example` contains no secrets.
- The Gemini key is sent in the `x-goog-api-key` header, never in URLs.
- All SQL is parameterised; request bodies are validated with zod.
- All sample data is fictional.
