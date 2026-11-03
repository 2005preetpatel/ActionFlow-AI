import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { query, transaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { similarity } from '../lib/text.js';
import { analyzeBatch } from '../ai/analyzer.js';
import { generate, lastModelUsed } from '../ai/gemini.js';
import { DAILY_SYSTEM, REPLY_SYSTEM, SEARCH_SCHEMA, SEARCH_SYSTEM, dailyPrompt, replyPrompt, searchPrompt } from '../ai/prompts.js';
import { messagesForAnalysis } from './messages.js';
import { DUPLICATE_THRESHOLD, findDuplicate, openTasksForDuplicateCheck } from './tasks.js';

/**
 * Stores one message's analysis and its tasks.
 * Re-analysis replaces only AI tasks the user has not touched; edited/manual tasks are kept.
 */
async function persistAnalysis(message, analysis, provider, model) {
  return transaction(async (conn) => {
    await conn.query(
      `INSERT INTO message_analyses
         (message_id, summary, category, intent, priority, requires_response, requires_action, sentiment, suggested_reply, reasoning, provider, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE summary = VALUES(summary), category = VALUES(category), intent = VALUES(intent),
         priority = VALUES(priority), requires_response = VALUES(requires_response), requires_action = VALUES(requires_action),
         sentiment = VALUES(sentiment), suggested_reply = VALUES(suggested_reply), reasoning = VALUES(reasoning),
         provider = VALUES(provider), model = VALUES(model), analyzed_at = CURRENT_TIMESTAMP`,
      [
        message.id,
        analysis.summary,
        analysis.category,
        analysis.intent,
        analysis.priority,
        analysis.requires_response ? 1 : 0,
        analysis.requires_action ? 1 : 0,
        analysis.sentiment,
        analysis.suggested_reply,
        analysis.priority_reason || null,
        provider,
        model,
      ],
    );

    await conn.query("DELETE FROM tasks WHERE message_id = ? AND source = 'ai' AND user_modified = 0", [message.id]);
    const [kept] = await conn.query('SELECT title FROM tasks WHERE message_id = ?', [message.id]);
    const candidates = await openTasksForDuplicateCheck(conn);

    let created = 0;
    for (const task of analysis.tasks) {
      if (kept.some((k) => similarity(k.title, task.title) >= DUPLICATE_THRESHOLD)) continue; // user already has it
      const dup = findDuplicate(task.title, candidates, { excludeMessageId: message.id });
      const [res] = await conn.query(
        `INSERT INTO tasks (message_id, title, description, priority, due_date, due_date_evidence, source, duplicate_of)
         VALUES (?, ?, ?, ?, ?, ?, 'ai', ?)`,
        [message.id, task.title, task.description, task.priority, task.due_date, task.due_date_evidence, dup?.id ?? null],
      );
      if (!dup) candidates.push({ id: res.insertId, title: task.title, message_id: message.id });
      created += 1;
    }
    return created;
  });
}

// ---------------------------------------------------------------------------
// Background analysis jobs (in-memory; one at a time keeps us inside free-tier rate limits)
// ---------------------------------------------------------------------------

const jobs = new Map();
let activeJobId = null;

const publicJob = (job) => {
  const { messages, ...rest } = job;
  return rest;
};

async function runJob(job) {
  const size = config.ai.batchSize;
  try {
    for (let i = 0; i < job.messages.length; i += size) {
      const batch = job.messages.slice(i, i + size);
      job.current = batch.map((m) => m.id);
      try {
        const { results, failures, provider, model } = await analyzeBatch(batch);
        for (const m of batch) {
          if (results.has(m.id)) {
            job.tasksCreated += await persistAnalysis(m, results.get(m.id), provider, model);
            job.analyzed += 1;
          } else {
            job.errors.push({ messageId: m.id, error: failures.get(m.id) });
          }
        }
      } catch (err) {
        for (const m of batch) job.errors.push({ messageId: m.id, error: err.message });
      }
      job.processed = Math.min(i + size, job.total);
    }
    job.status = job.errors.length && !job.analyzed ? 'failed' : 'completed';
  } catch (err) {
    job.status = 'failed';
    job.errors.push({ error: err.message });
  } finally {
    job.current = [];
    job.finishedAt = new Date().toISOString();
    activeJobId = null;
  }
}

export async function startAnalysisJob({ messageIds, reanalyze }) {
  if (activeJobId) return publicJob(jobs.get(activeJobId));

  const messages = await messagesForAnalysis({ ids: messageIds, onlyUnanalyzed: !reanalyze });
  const job = {
    id: randomUUID(),
    status: messages.length ? 'running' : 'completed',
    provider: config.ai.provider,
    model: config.ai.provider === 'gemini' ? config.ai.model : null,
    total: messages.length,
    processed: 0,
    analyzed: 0,
    tasksCreated: 0,
    current: [],
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: messages.length ? null : new Date().toISOString(),
    messages,
  };
  jobs.set(job.id, job);
  if (messages.length) {
    activeJobId = job.id;
    runJob(job); // fire and forget; progress is polled via getJob
  }
  return publicJob(job);
}

export function getJob(id) {
  const job = jobs.get(id);
  if (!job) throw new HttpError(404, 'Job not found');
  return publicJob(job);
}

export const activeJob = () => (activeJobId ? publicJob(jobs.get(activeJobId)) : null);

/** Synchronous single-message analysis (used by the "Analyze" button on a message). */
export async function analyzeOne(messageId) {
  const [message] = await messagesForAnalysis({ ids: [messageId] });
  if (!message) throw new HttpError(404, `Message ${messageId} not found`);
  const { results, failures, provider, model } = await analyzeBatch([message]);
  if (!results.has(message.id)) throw new HttpError(502, failures.get(message.id) || 'Analysis failed');
  const tasksCreated = await persistAnalysis(message, results.get(message.id), provider, model);
  return { tasksCreated };
}

// ---------------------------------------------------------------------------
// Other AI features
// ---------------------------------------------------------------------------

const requireGemini = (feature) => {
  if (config.ai.provider !== 'gemini') throw new HttpError(503, `${feature} needs GEMINI_API_KEY (currently in heuristic mode)`);
};

export async function regenerateReply(messageId, tone = 'professional', instructions = '') {
  requireGemini('Reply generation');
  const [message] = await messagesForAnalysis({ ids: [messageId] });
  if (!message) throw new HttpError(404, `Message ${messageId} not found`);
  const reply = await generate({ system: REPLY_SYSTEM, prompt: replyPrompt(message, tone, instructions), temperature: 0.6 });
  await query('UPDATE message_analyses SET suggested_reply = ? WHERE message_id = ?', [reply, messageId]);
  return reply;
}

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export async function createDailySummary() {
  requireGemini('Daily summary');
  const today = todayIso();
  const tasks = await query(
    `SELECT t.id, t.title, t.priority, t.status, t.due_date, m.sender_name AS sender, m.subject
       FROM tasks t LEFT JOIN messages m ON m.id = t.message_id
      WHERE t.status <> 'completed' AND t.duplicate_of IS NULL
      ORDER BY FIELD(t.priority, 'high', 'medium', 'low'), t.due_date IS NULL, t.due_date
      LIMIT 60`,
  );
  const awaitingReply = await query(
    `SELECT m.id, m.sender_name AS sender, m.subject, a.priority
       FROM messages m JOIN message_analyses a ON a.message_id = m.id
      WHERE a.requires_response = 1 ORDER BY FIELD(a.priority, 'high', 'medium', 'low') LIMIT 20`,
  );
  const [counts] = await query(
    `SELECT SUM(status = 'completed') AS completed, SUM(status <> 'completed') AS open,
            SUM(status <> 'completed' AND due_date < ?) AS overdue FROM tasks`,
    [today],
  );
  const stats = { open: Number(counts.open || 0), completed: Number(counts.completed || 0), overdue: Number(counts.overdue || 0) };
  const content = await generate({
    system: DAILY_SYSTEM,
    prompt: dailyPrompt(today, { stats, openTasks: tasks, messagesAwaitingReply: awaitingReply }),
    temperature: 0.3,
  });
  const res = await query('INSERT INTO daily_summaries (summary_date, content, stats, provider, model) VALUES (?, ?, ?, ?, ?)', [
    today,
    content,
    JSON.stringify(stats),
    'gemini',
    lastModelUsed,
  ]);
  return { id: res.insertId, summaryDate: today, content, stats, createdAt: new Date().toISOString() };
}

export async function latestDailySummary() {
  const [row] = await query('SELECT * FROM daily_summaries ORDER BY id DESC LIMIT 1');
  return row ? { id: row.id, summaryDate: row.summary_date, content: row.content, stats: row.stats, createdAt: row.created_at } : null;
}

/** Turns a natural-language query into structured filters (Gemini) - the caller then runs them. */
export async function interpretSearch(text) {
  requireGemini('Smart search');
  const f = await generate({ system: SEARCH_SYSTEM, prompt: searchPrompt(text, todayIso()), schema: SEARCH_SCHEMA, temperature: 0 });
  const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const arr = (a) => (Array.isArray(a) && a.length ? a.join(',') : undefined);
  return {
    explanation: f.explanation,
    filters: {
      search: f.keywords || undefined,
      status: arr(f.statuses),
      priority: arr(f.priorities),
      category: arr(f.categories),
      dueFrom: day(f.due_from),
      dueTo: day(f.due_to),
      sender: f.sender || undefined,
      requiresResponse: f.requires_response === true ? 'yes' : undefined,
    },
  };
}

export async function getStats() {
  const [m] = await query(
    `SELECT COUNT(*) AS total, COUNT(a.message_id) AS analyzed,
            SUM(a.requires_response = 1) AS awaiting_reply, SUM(a.priority = 'high') AS high_count
       FROM messages m LEFT JOIN message_analyses a ON a.message_id = m.id`,
  );
  const [t] = await query(
    `SELECT COUNT(*) AS total, SUM(status = 'pending') AS pending, SUM(status = 'in_progress') AS in_progress,
            SUM(status = 'completed') AS completed, SUM(priority = 'high' AND status <> 'completed') AS high_open,
            SUM(status <> 'completed' AND due_date < CURDATE()) AS overdue,
            SUM(duplicate_of IS NOT NULL AND status <> 'completed') AS duplicates
       FROM tasks`,
  );
  const categories = await query('SELECT category, COUNT(*) AS count FROM message_analyses GROUP BY category ORDER BY count DESC');
  const n = (v) => Number(v || 0);
  return {
    messages: { total: n(m.total), analyzed: n(m.analyzed), unanalyzed: n(m.total) - n(m.analyzed), awaitingReply: n(m.awaiting_reply), highPriority: n(m.high_count) },
    tasks: {
      total: n(t.total),
      pending: n(t.pending),
      inProgress: n(t.in_progress),
      completed: n(t.completed),
      highOpen: n(t.high_open),
      overdue: n(t.overdue),
      duplicates: n(t.duplicates),
    },
    categories: categories.map((c) => ({ category: c.category, count: n(c.count) })),
    ai: { provider: config.ai.provider, model: config.ai.provider === 'gemini' ? config.ai.model : null },
    activeJob: activeJob(),
  };
}
