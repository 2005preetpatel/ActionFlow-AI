import { Router } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { query } from './db.js';
import { asyncHandler, parseOr400 } from './lib/http.js';
import * as analysis from './services/analysis.js';
import * as messages from './services/messages.js';
import * as tasks from './services/tasks.js';

export const api = Router();

const priority = z.enum(['high', 'medium', 'low']);
const status = z.enum(['pending', 'in_progress', 'completed']);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const taskId = (req) => parseOr400(z.coerce.number().int().positive(), req.params.id);

// ---- Health & dashboard ----------------------------------------------------

api.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let db = 'ok';
    try {
      await query('SELECT 1');
    } catch (err) {
      db = err.message;
    }
    res.json({ status: db === 'ok' ? 'ok' : 'degraded', db, ai: { provider: config.ai.provider, model: config.ai.model } });
  }),
);

api.get('/stats', asyncHandler(async (_req, res) => res.json(await analysis.getStats())));

// ---- Messages -------------------------------------------------------------

// Body: { filename?: string, data: <parsed sample_messages.json> } or the document itself.
api.post(
  '/messages/import',
  asyncHandler(async (req, res) => {
    const doc = req.body && 'data' in req.body ? req.body.data : req.body;
    const result = await messages.importDocument(doc, req.body?.filename);
    res.status(201).json(result);
  }),
);

api.get('/messages/imports', asyncHandler(async (_req, res) => res.json(await messages.listImports())));

api.get('/messages', asyncHandler(async (req, res) => res.json(await messages.listMessages(req.query))));

api.post(
  '/messages',
  asyncHandler(async (req, res) => {
    const id = await messages.createManualMessage(req.body || {});
    if (req.query.analyze === 'true') await analysis.analyzeOne(id);
    res.status(201).json(await messages.getMessage(id));
  }),
);

api.get(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    const message = await messages.getMessage(req.params.id);
    res.json({ ...message, tasks: await tasks.listTasks({ messageId: message.id }) });
  }),
);

api.delete(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    await messages.deleteMessage(req.params.id);
    res.status(204).end();
  }),
);

api.post(
  '/messages/:id/analyze',
  asyncHandler(async (req, res) => {
    const result = await analysis.analyzeOne(req.params.id);
    res.json({ ...result, message: await messages.getMessage(req.params.id) });
  }),
);

api.post(
  '/messages/:id/reply',
  asyncHandler(async (req, res) => {
    const body = parseOr400(
      z.object({ tone: z.enum(['professional', 'friendly', 'brief', 'apologetic', 'formal']).default('professional'), instructions: z.string().max(500).optional() }),
      req.body || {},
    );
    res.json({ reply: await analysis.regenerateReply(req.params.id, body.tone, body.instructions) });
  }),
);

// ---- AI analysis jobs -----------------------------------------------------

api.post(
  '/analysis/run',
  asyncHandler(async (req, res) => {
    const body = parseOr400(z.object({ messageIds: z.array(z.string()).optional(), reanalyze: z.boolean().default(false) }), req.body || {});
    res.status(202).json(await analysis.startAnalysisJob(body));
  }),
);

api.get('/analysis/jobs/:id', (req, res, next) => {
  try {
    res.json(analysis.getJob(req.params.id));
  } catch (err) {
    next(err);
  }
});

// ---- Tasks ----------------------------------------------------------------

api.get('/tasks', asyncHandler(async (req, res) => res.json(await tasks.listTasks(req.query))));

api.get(
  '/tasks/export.csv',
  asyncHandler(async (req, res) => {
    const csv = tasks.tasksToCsv(await tasks.listTasks(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="actionflow-tasks-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }),
);

api.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const body = parseOr400(
      z.object({
        title: z.string().trim().min(1).max(255),
        description: z.string().max(5000).optional(),
        priority: priority.default('medium'),
        status: status.default('pending'),
        dueDate: day.nullish(),
        messageId: z.string().nullish(),
      }),
      req.body || {},
    );
    res.status(201).json(await tasks.createTask(body));
  }),
);

api.get('/tasks/:id', asyncHandler(async (req, res) => res.json(await tasks.getTask(taskId(req)))));

api.patch(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const patch = parseOr400(
      z
        .object({
          title: z.string().trim().min(1).max(255).optional(),
          description: z.string().max(5000).nullish(),
          priority: priority.optional(),
          status: status.optional(),
          dueDate: z.union([day, z.literal(''), z.null()]).optional(),
          duplicateOf: z.null().optional(), // only clearing ("not a duplicate") is allowed
        })
        .strict(),
      req.body || {},
    );
    res.json(await tasks.updateTask(taskId(req), patch));
  }),
);

api.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    await tasks.deleteTask(taskId(req));
    res.status(204).end();
  }),
);

api.post(
  '/tasks/:id/dependencies',
  asyncHandler(async (req, res) => {
    const { dependsOnId } = parseOr400(z.object({ dependsOnId: z.coerce.number().int().positive() }), req.body || {});
    res.status(201).json(await tasks.addDependency(taskId(req), dependsOnId));
  }),
);

api.delete(
  '/tasks/:id/dependencies/:dependsOnId',
  asyncHandler(async (req, res) => {
    const dependsOnId = parseOr400(z.coerce.number().int().positive(), req.params.dependsOnId);
    res.json(await tasks.removeDependency(taskId(req), dependsOnId));
  }),
);

// ---- Smart search & daily summary ----------------------------------------

api.post(
  '/search/smart',
  asyncHandler(async (req, res) => {
    const { query: text } = parseOr400(z.object({ query: z.string().trim().min(2).max(300) }), req.body || {});
    const { explanation, filters } = await analysis.interpretSearch(text);
    const [taskResults, messageResults] = await Promise.all([tasks.listTasks(filters), messages.listMessages(filters)]);
    res.json({ explanation, filters, tasks: taskResults, messages: messageResults });
  }),
);

api.get('/summaries/latest', asyncHandler(async (_req, res) => res.json(await analysis.latestDailySummary())));
api.post('/summaries/daily', asyncHandler(async (_req, res) => res.status(201).json(await analysis.createDailySummary())));
