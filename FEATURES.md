# ActionFlow AI – Features

Short, exact description of what was built and how it works.

**Legend:** ✅ Completed · 🟡 Partially completed · ❌ Not implemented

## 1. Feature status overview

| Area | Feature | Status |
|---|---|---|
| Import | JSON file import with validation into MySQL (mandatory) | ✅ |
| Import | Manual message entry (optional) | ✅ |
| Import | Gmail integration (optional) | ❌ |
| AI | Summary, category, intent, priority, response-required, suggested reply | ✅ |
| AI | Task extraction (title, description, priority, due date, source message, status) | ✅ |
| AI | No tasks for informational messages; no invented deadlines | ✅ |
| Dashboard | Totals, analysed count, pending/completed, high-priority highlight | ✅ |
| Tasks | Edit tasks, change priority, update status | ✅ |
| Tasks | Search and filtering (messages and tasks) | ✅ |
| Bonus | Kanban task board (drag & drop) | ✅ |
| Bonus | Duplicate task detection | ✅ |
| Bonus | Smart search (natural language → filters) | ✅ |
| Bonus | AI-generated daily task summary | ✅ |
| Bonus | Task dependencies | ✅ |
| Bonus | CSV export | ✅ |
| Extra | Reply rewriting in a chosen tone | ✅ |
| Extra | Heuristic offline mode when no API key is set | ✅ |
| Extra | Import history with validation report | ✅ |
| Extra | Authentication / multi-user accounts | ❌ |
| Extra | Real-time background queue (Redis/worker) | 🟡 in-memory job runner only |

## 2. Implemented features – how they work

### 2.1 JSON import (mandatory) ✅
- Upload (drag & drop or file picker) on the **Import** page, or `npm run import:sample`.
- The browser parses the file and posts it to `POST /api/messages/import`.
- `server/lib/messageSchema.js` validates with **zod**:
  - root must be an object containing a non-empty `messages` array (otherwise the whole file is rejected with 422);
  - every message: `id` (unique within the file), `type` = `email` | `message`, `sender.name`, valid `sender.email`,
    `recipient`, `subject`, `date` = ISO 8601 date-time with timezone (e.g. `2026-11-02T10:30:00+05:30`), non-empty `content`, `attachments` array;
  - extra fields are allowed and preserved in the `messages.extra` JSON column.
- Invalid messages are reported individually (`id` + reason) and skipped; valid ones are inserted in one transaction.
  Ids already in the database are skipped (re-importing is safe / idempotent).
- Dates are stored as UTC `DATETIME` **and** the original string (`date_raw`) is kept so the sender's offset is not lost.
- Every import is logged in `import_batches` and shown in **Import history**.

### 2.2 Manual message entry ✅
Form on the Import page → `POST /api/messages` (same validation as JSON import). Option "Analyze with AI right away".

### 2.3 AI analysis ✅
- Triggered by **Analyze inbox** (all unanalysed), **Analyze imported messages**, or **Analyze / Re-analyze** on one message.
- Bulk analysis runs as a background job (`POST /api/analysis/run`) that the UI polls for progress.
- Messages are sent in batches of `AI_BATCH_SIZE` (default 5) per Gemini request → fewer calls, stays within free-tier limits.
  Rate-limit (429) and 5xx responses are retried with back-off using Google's suggested `retryDelay`;
  if the model is overloaded (503) or retired (404) the request automatically moves to the next model in `GEMINI_FALLBACK_MODELS`.
  The model that actually answered is stored with each analysis.
- Gemini's **structured output** (`responseMimeType: application/json` + `responseSchema`) guarantees JSON;
  the server validates it again with zod.
- Per message the AI returns: `summary`, `category` (10 fixed categories), `intent`, `priority` (high/medium/low) + `priority_reason`,
  `sentiment`, `requires_action`, `requires_response`, `suggested_reply`, `tasks[]`.
- Each analysis stores the provider and model that produced it (shown in the UI).

### 2.4 Intelligent task generation ✅
Each task has title, description, priority, optional due date, link to the original message and status (Pending / In Progress / Completed).

Safeguards in `server/ai/analyzer.js → applyGuards()`:
1. **No unnecessary tasks** – if the model marks a message `requires_action = false` (FYI, newsletters, thank-you notes), all tasks are dropped.
2. **No invented deadlines** – the model must return `due_date_evidence`, the exact words that state the deadline. The server keeps
   the date only if that phrase really appears in the message subject/content and the date is a valid `YYYY-MM-DD`; otherwise `due_date = NULL`.
   The evidence is shown in the task modal and as a tooltip in the task table.
3. Relative deadlines ("before Thursday", "EOD tomorrow") are resolved against the **message's sent date**, which is given to the model with its weekday.
4. Max 5 tasks per message; no reply is stored when no response is required.
5. **Re-analysis is safe** – it replaces only AI tasks the user has not edited (`user_modified = 0`); edited and manual tasks are kept.

### 2.5 Dashboard ✅
Cards: total messages, analysed messages (+coverage %), pending (+in progress), completed (+%), open high-priority, overdue,
messages awaiting a reply, possible duplicates. High-priority task list (highlighted red), messages-by-category chart,
AI daily briefing and smart search. Banner prompts to analyse un-analysed messages.

### 2.6 Task management ✅
- **Tasks** page: table with inline priority and status dropdowns, click a task to open the edit modal
  (title, description, priority, status, due date, dependencies, source message, duplicate resolution, delete).
- **New task** button for manual tasks.
- Filters: text search (title, description, sender, subject), status (incl. "open"), priority, due (overdue / next 7 days / none),
  category, only-duplicates; sorting by priority, due date or newest. Filters live in the URL (shareable).
- High-priority open tasks are highlighted everywhere; overdue dates are shown in red.

### 2.7 Inbox ✅
Message list with search, category, priority, analysed/not, needs-reply filter and priority sort. Detail panel shows the
original message and attachments, the AI analysis (summary, category, priority + reason, response required, sentiment, intent),
the suggested reply (copy button, rewrite in a tone) and the tasks extracted from it.

### 2.8 Bonus features
- **Kanban board ✅** – three columns (Pending / In Progress / Completed), native HTML5 drag & drop with optimistic update and rollback on error, card filter.
- **Duplicate task detection ✅** – when a task is created, its title is compared with open tasks from *other* messages using
  word-set (Jaccard) similarity after removing stop-words; ≥ 0.5 marks it "Possible duplicate of #id". The user can confirm
  "Not a duplicate" or delete it. (The sample data contains two people requesting the same Q4 report to demonstrate this.)
- **Smart search ✅** – plain-English query (e.g. "high priority tasks due this week") → Gemini converts it into structured filters
  (keywords, statuses, priorities, categories, due range, sender, needs reply) with an explanation → the normal filtered queries run on tasks and messages.
- **AI daily briefing ✅** – collects open tasks, overdue counts and messages awaiting reply, asks Gemini for a short briefing
  (Top priorities / Overdue / Waiting on replies / Quick wins) and stores it in `daily_summaries`.
- **Task dependencies ✅** – "task A depends on task B". Self-dependencies and cycles are rejected (graph walk). A task cannot be
  marked completed while a dependency is unfinished (HTTP 409, shown as a toast); blocked tasks show a lock badge.
- **CSV export ✅** – exports the currently filtered task list (UTF-8 with BOM for Excel, proper quoting).
- **Gmail integration ❌** – not implemented (see section 8).

## 3. Application modules

| Module | File(s) | Responsibility |
|---|---|---|
| Config | `server/config.js` | Reads `.env`, chooses AI provider (Gemini or heuristic) |
| DB access | `server/db.js` | mysql2 connection pool, transaction helper |
| Validation | `server/lib/messageSchema.js` | Mandatory JSON structure validation |
| Text utils | `server/lib/text.js` | Similarity, phrase matching, date description |
| Messages service | `server/services/messages.js` | Import, manual entry, list/filter, detail, delete |
| Tasks service | `server/services/tasks.js` | CRUD, filters, dependencies (cycle check), duplicates, CSV |
| Analysis service | `server/services/analysis.js` | Background jobs, persisting analyses/tasks, replies, daily summary, smart search, stats |
| Gemini client | `server/ai/gemini.js` | REST call, retries/back-off, JSON parsing |
| Prompts | `server/ai/prompts.js` | System prompts + response schemas |
| Analyzer | `server/ai/analyzer.js` | Batch analysis, zod validation of AI output, guards |
| Heuristic | `server/ai/heuristic.js` | Keyword fallback when no API key (never sets deadlines) |
| API | `server/routes.js`, `server/index.js` | REST endpoints, error handling, static hosting |
| UI | `client/src/pages/*` | Dashboard, Inbox, Tasks, Kanban Board, Import |
| UI components | `client/src/components/*` | Task modal (edit/dependencies/duplicates), task row, badges, toasts |

## 4. API endpoints

All under `/api`. JSON in/out; errors are `{ "error": string, "details"?: string[] }`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | DB connectivity + AI provider |
| GET | `/stats` | Dashboard counters, categories, active job |
| POST | `/messages/import` | Validate + import a JSON document (`{ filename, data }`) |
| GET | `/messages/imports` | Import history |
| GET | `/messages` | List messages. Query: `search, category, priority, type, analyzed=yes\|no, requiresResponse=yes, sender, sort=date\|priority` |
| POST | `/messages` | Manual message (`?analyze=true` to analyse immediately) |
| GET | `/messages/:id` | Message + analysis + its tasks |
| DELETE | `/messages/:id` | Delete message (tasks are kept, unlinked) |
| POST | `/messages/:id/analyze` | Analyse / re-analyse one message synchronously |
| POST | `/messages/:id/reply` | Rewrite suggested reply (`{ tone, instructions? }`) |
| POST | `/analysis/run` | Start background analysis (`{ messageIds?, reanalyze? }`) |
| GET | `/analysis/jobs/:id` | Job progress (processed, analysed, tasks created, errors) |
| GET | `/tasks` | List tasks. Query: `search, status, priority, category, due=overdue\|week\|none, dueFrom, dueTo, messageId, sender, duplicates=yes, sort=priority\|due\|newest` (comma-separated multi-values) |
| GET | `/tasks/export.csv` | CSV export with the same filters |
| POST | `/tasks` | Create manual task |
| GET | `/tasks/:id` | Task detail |
| PATCH | `/tasks/:id` | Update title, description, priority, status, dueDate, or clear `duplicateOf` |
| DELETE | `/tasks/:id` | Delete task |
| POST | `/tasks/:id/dependencies` | Add dependency (`{ dependsOnId }`), cycle-checked |
| DELETE | `/tasks/:id/dependencies/:dependsOnId` | Remove dependency |
| POST | `/search/smart` | Natural-language search (`{ query }`) → filters + matching tasks and messages |
| GET | `/summaries/latest` | Latest AI daily briefing |
| POST | `/summaries/daily` | Generate a new daily briefing |

## 5. AI features, prompts and workflow

Provider: **Google Gemini** (`GEMINI_MODEL`, default `gemini-3.5-flash`) over REST
(`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, key in `x-goog-api-key` header).
All prompts are in `server/ai/prompts.js`.

**Analysis workflow**

```
Import → MySQL (messages) → [Analyze] → batch of 5 messages
   → Gemini (system prompt + messages with sender, sent date+weekday, subject, attachments, content)
   → structured JSON (responseSchema) → zod validation → guards (no-action / deadline evidence)
   → MySQL (message_analyses + tasks) → duplicate check against open tasks
```

**Analysis system prompt (summary of rules)**
1. Base everything on the text; never assume.
2. Category from a fixed list (client_request, complaint, meeting, follow_up, urgent_issue, billing, information, acknowledgement, promotional, other).
3. Priority rubric: *high* = outages, security, failing payments, legal risk, escalations, deadline within ~2 days; *medium* = normal client work/meetings; *low* = FYI/no action.
4. `requires_action` / `requires_response` decided separately; informational messages get no tasks.
5. One task per distinct deliverable (max 5), imperative titles, no "reply" tasks.
6. Due date only when explicitly stated, resolved from the message's sent date, with the exact quoted evidence; vague words ("soon", "ASAP") → null.
7. Suggested reply (60–120 words) only when a response is required, without promising unstated dates.

Other prompts: **reply rewrite** (tone: professional / friendly / brief / apologetic / formal), **daily briefing**
(fixed sections, only from given data), **smart search** (query → filter JSON with schema, relative dates resolved from today).

**Heuristic fallback:** with no API key, keyword rules produce a basic analysis, labelled "heuristic mode" in the UI. It never sets due dates.

## 6. Database tables (MySQL 8 – `database/schema.sql`)

| Table | Purpose |
|---|---|
| `import_batches` | One row per JSON import / manual entry: counts and validation errors (JSON) |
| `messages` | Imported messages: mandatory fields, UTC `sent_at` + original `date_raw`, attachments (JSON), extra fields (JSON), source. FULLTEXT index on subject/content/sender |
| `message_analyses` | 1:1 AI result per message: summary, category, intent, priority, flags, sentiment, suggested reply, priority reason, provider/model |
| `tasks` | Tasks: title, description, priority, status, due date + evidence, source (ai/manual), `user_modified`, `duplicate_of`, timestamps, `completed_at` |
| `task_dependencies` | Many-to-many "task depends on task" with cascade delete and self-reference check |
| `daily_summaries` | Stored AI daily briefings with stats snapshot |

## 7. Third-party integrations and libraries

| Library / service | Use |
|---|---|
| Google Gemini API | All AI features |
| MySQL 8 + `mysql2` | Database and driver |
| Express 4 | REST API |
| zod | Request and import validation, AI output validation |
| dotenv | Environment configuration |
| React 18, React Router 6 | Frontend SPA |
| Vite 6 | Dev server / build |
| Tailwind CSS 4 | Styling |
| lucide-react | Icons |
| concurrently | Run API + web in dev |
| Docker Compose (optional) | Local MySQL container |

AI tools were used during development (coding assistant and generation of the fictional `sample_messages.json`), as allowed by the brief.

## 8. Planned but not completed

| Feature | Status | Notes |
|---|---|---|
| Gmail integration (OAuth + Gmail API) | ❌ Not implemented | Planned as another importer writing to the same `messages` table with `source = 'gmail'` (the enum value already exists). Skipped to focus on core quality within 24 h. |
| Persistent job queue | 🟡 Partial | Analysis jobs run in-process and are tracked in memory; a server restart loses progress (messages already analysed stay saved; re-running continues with the rest). |
| User accounts / authentication | ❌ Not implemented | Single-user local app. |
| Sending replies | ❌ Not implemented | Suggested replies can be copied; they are not sent. |
