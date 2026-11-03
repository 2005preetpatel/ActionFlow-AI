// Rule-based fallback used only when no Gemini key is configured (AI_PROVIDER=heuristic).
// It is intentionally simple and every result is labelled provider="heuristic" in the UI.

const has = (text, words) => words.some((w) => text.includes(w));

const ACTION_CUES = /\b(please|kindly|could you|can you|need you to|make sure|send|share|update|fix|prepare|review|schedule|confirm)\b/i;

export function analyzeHeuristically(message) {
  const text = `${message.subject} ${message.content}`.toLowerCase();

  let category = 'other';
  if (has(text, ['down', 'outage', 'not working', 'failing', 'breach', 'security'])) category = 'urgent_issue';
  else if (has(text, ['invoice', 'payment', 'billing', 'refund'])) category = 'billing';
  else if (has(text, ['complain', 'disappointed', 'unacceptable', 'issue with', 'delay'])) category = 'complaint';
  else if (has(text, ['meeting', 'call', 'reschedule', 'invite', 'sync'])) category = 'meeting';
  else if (has(text, ['follow up', 'following up', 'reminder', 'any update'])) category = 'follow_up';
  else if (has(text, ['newsletter', 'unsubscribe', 'offer', 'discount'])) category = 'promotional';
  else if (has(text, ['thank', 'thanks', 'noted', 'appreciate'])) category = 'acknowledgement';
  else if (has(text, ['fyi', 'notice', 'policy', 'holiday', 'release notes', 'receipt'])) category = 'information';
  else if (ACTION_CUES.test(text)) category = 'client_request';

  const passive = ['information', 'acknowledgement', 'promotional'].includes(category);
  const requiresAction = !passive && ACTION_CUES.test(text);
  const priority = category === 'urgent_issue' || has(text, ['urgent', 'asap', 'immediately']) ? 'high' : passive ? 'low' : 'medium';

  const firstSentence = message.content.split(/(?<=[.!?])\s+/)[0].slice(0, 220);
  const actionSentences = requiresAction
    ? message.content.split(/(?<=[.!?])\s+/).filter((s) => ACTION_CUES.test(s)).slice(0, 3)
    : [];

  return {
    message_id: message.id,
    summary: firstSentence,
    category,
    intent: message.subject || category.replace('_', ' '),
    priority,
    priority_reason: 'Keyword rules (heuristic mode)',
    sentiment: has(text, ['disappointed', 'unacceptable', 'frustrat', 'angry']) ? 'negative' : has(text, ['thank', 'great']) ? 'positive' : 'neutral',
    requires_action: requiresAction,
    requires_response: requiresAction || text.includes('?'),
    suggested_reply:
      requiresAction || text.includes('?')
        ? `Hi ${message.sender_name.split(' ')[0]},\n\nThank you for your message regarding "${message.subject}". We have noted your request and will get back to you shortly with an update.\n\nBest regards,\nActionFlow Team`
        : null,
    // The heuristic never guesses deadlines.
    tasks: actionSentences.map((s) => ({
      title: s.replace(/^(please|kindly)\s+/i, '').replace(/[.!?]+$/, '').slice(0, 80),
      description: s,
      priority,
      due_date: null,
      due_date_evidence: null,
    })),
  };
}
