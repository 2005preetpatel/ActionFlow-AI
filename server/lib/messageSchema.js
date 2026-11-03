import { z } from 'zod';

// ISO 8601 date-time with an explicit offset (Z or +hh:mm), e.g. 2026-11-02T10:30:00+05:30.
// The offset is required so the instant is unambiguous when we store it in UTC.
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

const isoDate = z
  .string({ required_error: 'is required' })
  .regex(ISO_8601, 'must be an ISO 8601 date-time with timezone, e.g. 2026-11-02T10:30:00+05:30')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'is not a real calendar date');

const nonEmpty = (max) => z.string({ required_error: 'is required' }).trim().min(1, 'must not be empty').max(max);

const MANDATORY_KEYS = new Set(['id', 'type', 'sender', 'recipient', 'subject', 'date', 'content', 'attachments']);

export const messageSchema = z
  .object({
    id: nonEmpty(64).regex(/^[\w.-]+$/, 'may only contain letters, digits, "_", "-" and "."'),
    type: z.enum(['email', 'message'], { errorMap: () => ({ message: 'must be "email" or "message"' }) }),
    sender: z.object(
      {
        name: nonEmpty(255),
        email: z.string({ required_error: 'is required' }).trim().email('must be a valid email address').max(320),
      },
      { required_error: 'is required', invalid_type_error: 'must be an object with name and email' },
    ),
    recipient: nonEmpty(320),
    subject: z.string({ required_error: 'is required' }).max(500),
    date: isoDate,
    content: nonEmpty(20000),
    attachments: z.array(z.any(), { required_error: 'is required', invalid_type_error: 'must be an array' }),
  })
  .passthrough(); // extra fields are allowed and preserved

/** Collects fields beyond the mandatory structure so nothing from the source is lost. */
export function extraFields(message) {
  const extra = Object.fromEntries(Object.entries(message).filter(([k]) => !MANDATORY_KEYS.has(k)));
  return Object.keys(extra).length ? extra : null;
}

/**
 * Validates a parsed JSON document against the mandatory structure.
 * Structural problems (no messages array) reject the whole file; individual bad
 * messages are reported and skipped so one typo does not block the import.
 */
export function validateImportDocument(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { fatal: 'Root must be a JSON object containing a "messages" array.' };
  }
  if (!Array.isArray(doc.messages)) {
    return { fatal: 'Root object must contain a "messages" array.' };
  }
  if (doc.messages.length === 0) {
    return { fatal: '"messages" array is empty.' };
  }

  const valid = [];
  const errors = [];
  const seen = new Set();

  doc.messages.forEach((raw, index) => {
    const label = raw && typeof raw === 'object' && typeof raw.id === 'string' ? raw.id : `#${index + 1}`;
    const result = messageSchema.safeParse(raw);
    if (!result.success) {
      errors.push({
        index,
        id: label,
        problems: result.error.issues.map((i) => `${i.path.join('.') || 'message'} ${i.message}`),
      });
      return;
    }
    if (seen.has(result.data.id)) {
      errors.push({ index, id: label, problems: [`id "${result.data.id}" is duplicated in this file`] });
      return;
    }
    seen.add(result.data.id);
    valid.push(result.data);
  });

  return { valid, errors };
}
