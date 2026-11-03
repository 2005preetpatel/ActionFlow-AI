import { z } from 'zod';
import { config } from '../config.js';
import { containsPhrase, isIsoDay } from '../lib/text.js';
import { generate, lastModelUsed } from './gemini.js';
import { analyzeHeuristically } from './heuristic.js';
import { ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, CATEGORIES, analysisPrompt } from './prompts.js';

const priority = z.enum(['high', 'medium', 'low']).catch('medium');

const analysisShape = z.object({
  message_id: z.string(),
  summary: z.string().min(1),
  category: z.enum(CATEGORIES).catch('other'),
  intent: z.string().min(1).catch('Unspecified'),
  priority,
  priority_reason: z.string().nullish(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).catch('neutral'),
  requires_action: z.boolean(),
  requires_response: z.boolean(),
  suggested_reply: z.string().nullish(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().nullish(),
        priority,
        due_date: z.string().nullish(),
        due_date_evidence: z.string().nullish(),
      }),
    )
    .catch([]),
});

/**
 * Post-processing guards so the stored result never contradicts the source message:
 *  - no tasks for messages the model itself marked as needing no action;
 *  - a due date survives only if the quoted deadline words really occur in the message;
 *  - no reply text when no response is required.
 */
export function applyGuards(analysis, message) {
  const source = `${message.subject}\n${message.content}`;
  const tasks = analysis.requires_action
    ? analysis.tasks.slice(0, 5).map((t) => {
        const evidenceOk = t.due_date_evidence && containsPhrase(source, t.due_date_evidence);
        const dateOk = evidenceOk && isIsoDay(t.due_date);
        return {
          title: t.title.trim().slice(0, 255),
          description: t.description?.trim() || null,
          priority: t.priority,
          due_date: dateOk ? t.due_date : null,
          due_date_evidence: dateOk ? t.due_date_evidence.trim().slice(0, 255) : null,
        };
      })
    : [];

  return {
    ...analysis,
    suggested_reply: analysis.requires_response ? analysis.suggested_reply?.trim() || null : null,
    tasks,
  };
}

/**
 * Analyzes a batch of messages in one AI request.
 * Returns { results: Map<messageId, analysis>, failures: Map<messageId, reason>, provider, model }.
 */
export async function analyzeBatch(messages) {
  const results = new Map();
  const failures = new Map();

  if (config.ai.provider === 'heuristic') {
    for (const m of messages) results.set(m.id, applyGuards(analyzeHeuristically(m), m));
    return { results, failures, provider: 'heuristic', model: null };
  }

  const output = await generate({ system: ANALYSIS_SYSTEM, prompt: analysisPrompt(messages), schema: ANALYSIS_SCHEMA });
  const byId = new Map(messages.map((m) => [m.id, m]));

  for (const raw of output?.analyses ?? []) {
    const parsed = analysisShape.safeParse(raw);
    if (!parsed.success || !byId.has(parsed.data.message_id)) continue;
    results.set(parsed.data.message_id, applyGuards(parsed.data, byId.get(parsed.data.message_id)));
  }
  for (const m of messages) {
    if (!results.has(m.id)) failures.set(m.id, 'AI response did not include a valid analysis for this message');
  }
  return { results, failures, provider: 'gemini', model: lastModelUsed };
}
