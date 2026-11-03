import { describeLocalDate } from '../lib/text.js';

export const CATEGORIES = [
  'client_request',
  'complaint',
  'meeting',
  'follow_up',
  'urgent_issue',
  'billing',
  'information',
  'acknowledgement',
  'promotional',
  'other',
];

// ---------------------------------------------------------------------------
// 1. Message analysis + task extraction (batched)
// ---------------------------------------------------------------------------

export const ANALYSIS_SYSTEM = `You are ActionFlow AI, an assistant that triages a team inbox for a busy professional services company.
For every message you receive, produce a faithful analysis and extract ONLY the concrete actions the recipient team must take.

Rules (follow strictly):
1. Base everything on the message text. Never assume facts that are not written.
2. category must be one of: ${CATEGORIES.join(', ')}.
   - urgent_issue: something is broken/blocked right now (outage, payment failure, security incident).
   - acknowledgement: thank-you notes, "noted", confirmations that need nothing further.
   - promotional: newsletters, marketing, automated promotions.
   - information: FYI notices, policy updates, release notes, automated receipts.
3. priority:
   - high: outages, security/data issues, failing payments, legal risk, an upset client escalating, or a stated deadline within ~2 days of the message date.
   - medium: normal client work, meetings, follow-ups, deadlines further out.
   - low: FYI, acknowledgements, promotional or no-action messages.
4. requires_action = true only if the team must DO something. requires_response = true only if the sender expects a reply.
   Informational, promotional and acknowledgement messages normally have requires_action = false and NO tasks.
5. tasks: one task per distinct deliverable the team must complete (max 5). Do not create tasks for "read this", "note this",
   or for replying alone. Title: imperative, max 10 words. Description: 1-2 sentences with the specifics from the message.
6. Deadlines: set due_date (YYYY-MM-DD) ONLY when the message explicitly states a date or relative time ("by Friday",
   "before Thursday", "end of day tomorrow", "7 November"). Resolve relative expressions against the message's sent date
   (weekday given). due_date_evidence must quote the exact deadline words from the message. If no deadline is stated —
   including vague wording like "soon", "when you can", "ASAP" — set due_date and due_date_evidence to null. NEVER invent a deadline.
7. suggested_reply: when requires_response is true, write a concise, polite, professional reply (60-120 words) from the team,
   acknowledging specifics and next steps without promising dates the message did not mention. End with "Best regards,\\nActionFlow Team".
   Otherwise null.
8. summary: one or two sentences. intent: a short phrase (e.g. "Request staging URL for payment integration").
9. Return one analysis per input message, using the exact message_id given.`;

const taskSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    due_date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD or null' },
    due_date_evidence: { type: 'STRING', nullable: true, description: 'Exact deadline words quoted from the message' },
  },
  required: ['title', 'description', 'priority', 'due_date', 'due_date_evidence'],
  propertyOrdering: ['title', 'description', 'priority', 'due_date_evidence', 'due_date'],
};

export const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    analyses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          message_id: { type: 'STRING' },
          summary: { type: 'STRING' },
          category: { type: 'STRING', enum: CATEGORIES },
          intent: { type: 'STRING' },
          priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          priority_reason: { type: 'STRING' },
          sentiment: { type: 'STRING', enum: ['positive', 'neutral', 'negative'] },
          requires_action: { type: 'BOOLEAN' },
          requires_response: { type: 'BOOLEAN' },
          suggested_reply: { type: 'STRING', nullable: true },
          tasks: { type: 'ARRAY', items: taskSchema },
        },
        required: [
          'message_id',
          'summary',
          'category',
          'intent',
          'priority',
          'priority_reason',
          'sentiment',
          'requires_action',
          'requires_response',
          'suggested_reply',
          'tasks',
        ],
        propertyOrdering: [
          'message_id',
          'summary',
          'category',
          'intent',
          'priority',
          'priority_reason',
          'sentiment',
          'requires_action',
          'requires_response',
          'tasks',
          'suggested_reply',
        ],
      },
    },
  },
  required: ['analyses'],
};

export function analysisPrompt(messages) {
  const blocks = messages.map(
    (m) => `<message id="${m.id}">
type: ${m.type}
from: ${m.sender_name} <${m.sender_email}>
to: ${m.recipient}
sent: ${describeLocalDate(m.date_raw)}
subject: ${m.subject}
attachments: ${m.attachments?.length ? m.attachments.map((a) => (typeof a === 'string' ? a : a.filename || a.name || 'file')).join(', ') : 'none'}
content:
${m.content}
</message>`,
  );
  return `Analyze these ${messages.length} message(s):\n\n${blocks.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// 2. Reply regeneration with a chosen tone
// ---------------------------------------------------------------------------

export const REPLY_SYSTEM = `You write email/chat replies on behalf of "ActionFlow Team".
Be accurate to the original message, never promise dates or facts that are not given, keep it under 140 words.
Return only the reply text, no subject line, no markdown.`;

export function replyPrompt(message, tone, instructions) {
  return `Tone: ${tone}.${instructions ? `\nExtra instructions from the user: ${instructions}` : ''}

Original ${message.type} from ${message.sender_name} (${message.sender_email}), sent ${describeLocalDate(message.date_raw)}:
Subject: ${message.subject}
${message.content}`;
}

// ---------------------------------------------------------------------------
// 3. Daily task summary
// ---------------------------------------------------------------------------

export const DAILY_SYSTEM = `You are a concise chief-of-staff. Write a daily briefing for a team lead based ONLY on the task and inbox data given.
Format as plain text with these sections, using "- " bullets:
Top priorities today (max 5, most urgent first, mention due dates and task ids like #12),
Overdue / at risk,
Waiting on replies,
Quick wins.
Skip a section with "- None" when empty. Under 220 words. Do not invent tasks or dates.`;

export function dailyPrompt(today, data) {
  return `Today is ${today}.\n\nData (JSON):\n${JSON.stringify(data)}`;
}

// ---------------------------------------------------------------------------
// 4. Smart search: natural language -> structured filters
// ---------------------------------------------------------------------------

export const SEARCH_SYSTEM = `Convert a natural-language search over a task/inbox app into structured filters.
Only set a filter when the query clearly implies it; leave others null. "keywords" are content words to match in text
(exclude words already captured by filters such as "urgent", "pending", "this week"). Dates must be YYYY-MM-DD,
resolved relative to the given today date. "explanation" is a one-line description of how you interpreted the query.`;

export const SEARCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    keywords: { type: 'STRING', nullable: true },
    statuses: { type: 'ARRAY', items: { type: 'STRING', enum: ['pending', 'in_progress', 'completed'] } },
    priorities: { type: 'ARRAY', items: { type: 'STRING', enum: ['high', 'medium', 'low'] } },
    categories: { type: 'ARRAY', items: { type: 'STRING', enum: CATEGORIES } },
    due_from: { type: 'STRING', nullable: true },
    due_to: { type: 'STRING', nullable: true },
    sender: { type: 'STRING', nullable: true },
    requires_response: { type: 'BOOLEAN', nullable: true },
    explanation: { type: 'STRING' },
  },
  required: ['keywords', 'statuses', 'priorities', 'categories', 'due_from', 'due_to', 'sender', 'requires_response', 'explanation'],
};

export function searchPrompt(query, today) {
  return `Today is ${today}. Query: ${JSON.stringify(query)}`;
}
