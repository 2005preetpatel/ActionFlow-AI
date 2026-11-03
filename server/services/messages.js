import { query, transaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { extraFields, validateImportDocument } from '../lib/messageSchema.js';

const toUtcDatetime = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');

async function insertMessages(conn, messages, source, batchId) {
  if (!messages.length) return { inserted: [], existing: [] };
  const ids = messages.map((m) => m.id);
  const [rows] = await conn.query('SELECT id FROM messages WHERE id IN (?)', [ids]);
  const existingIds = new Set(rows.map((r) => r.id));
  const fresh = messages.filter((m) => !existingIds.has(m.id));

  if (fresh.length) {
    await conn.query(
      `INSERT INTO messages
         (id, type, sender_name, sender_email, recipient, subject, sent_at, date_raw, content, attachments, extra, source, import_batch_id)
       VALUES ?`,
      [
        fresh.map((m) => [
          m.id,
          m.type,
          m.sender.name,
          m.sender.email,
          m.recipient,
          m.subject,
          toUtcDatetime(m.date),
          m.date,
          m.content,
          JSON.stringify(m.attachments),
          extraFields(m) ? JSON.stringify(extraFields(m)) : null,
          source,
          batchId,
        ]),
      ],
    );
  }
  return { inserted: fresh.map((m) => m.id), existing: [...existingIds] };
}

/** Validates an uploaded JSON document and stores valid, new messages in MySQL. */
export async function importDocument(doc, filename) {
  const { fatal, valid, errors } = validateImportDocument(doc);
  if (fatal) throw new HttpError(422, fatal);

  return transaction(async (conn) => {
    const total = doc.messages.length;
    const [batch] = await conn.query('INSERT INTO import_batches (source, filename, total_count) VALUES (?, ?, ?)', [
      'json',
      filename || null,
      total,
    ]);
    const { inserted, existing } = await insertMessages(conn, valid, 'json', batch.insertId);
    await conn.query('UPDATE import_batches SET imported = ?, skipped = ?, failed = ?, errors = ? WHERE id = ?', [
      inserted.length,
      existing.length,
      errors.length,
      errors.length ? JSON.stringify(errors) : null,
      batch.insertId,
    ]);
    return { batchId: batch.insertId, total, imported: inserted.length, skipped: existing, failed: errors, importedIds: inserted };
  });
}

/** Manual entry uses exactly the same validation as the JSON import. */
export async function createManualMessage(input) {
  const message = {
    id: input.id || `MAN${Date.now().toString(36).toUpperCase()}`,
    type: input.type,
    sender: input.sender,
    recipient: input.recipient,
    subject: input.subject ?? '',
    date: input.date || new Date().toISOString(),
    content: input.content,
    attachments: input.attachments ?? [],
  };
  const { valid, errors } = validateImportDocument({ messages: [message] });
  if (errors.length) throw new HttpError(400, 'Invalid message', errors[0].problems);

  return transaction(async (conn) => {
    const [batch] = await conn.query(
      'INSERT INTO import_batches (source, filename, total_count, imported) VALUES (?, NULL, 1, 1)',
      ['manual'],
    );
    const { existing } = await insertMessages(conn, valid, 'manual', batch.insertId);
    if (existing.length) throw new HttpError(409, `A message with id "${message.id}" already exists`);
    return valid[0].id;
  });
}

const MESSAGE_COLUMNS = `
  m.id, m.type, m.sender_name, m.sender_email, m.recipient, m.subject, m.sent_at, m.date_raw,
  m.content, m.attachments, m.extra, m.source, m.created_at,
  a.summary, a.category, a.intent, a.priority, a.requires_response, a.requires_action, a.sentiment,
  a.suggested_reply, a.reasoning, a.provider, a.model, a.analyzed_at,
  (SELECT COUNT(*) FROM tasks t WHERE t.message_id = m.id) AS task_count`;

const shapeMessage = (r) => ({
  id: r.id,
  type: r.type,
  sender: { name: r.sender_name, email: r.sender_email },
  recipient: r.recipient,
  subject: r.subject,
  date: r.date_raw,
  sentAt: r.sent_at,
  content: r.content,
  attachments: r.attachments ?? [],
  extra: r.extra,
  source: r.source,
  taskCount: Number(r.task_count),
  analysis: r.analyzed_at
    ? {
        summary: r.summary,
        category: r.category,
        intent: r.intent,
        priority: r.priority,
        requiresResponse: !!r.requires_response,
        requiresAction: !!r.requires_action,
        sentiment: r.sentiment,
        suggestedReply: r.suggested_reply,
        reasoning: r.reasoning,
        provider: r.provider,
        model: r.model,
        analyzedAt: r.analyzed_at,
      }
    : null,
});

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

export async function listMessages(filters = {}) {
  const where = [];
  const params = [];
  if (filters.search) {
    const like = `%${filters.search}%`;
    where.push('(m.subject LIKE ? OR m.content LIKE ? OR m.sender_name LIKE ? OR m.sender_email LIKE ? OR a.summary LIKE ?)');
    params.push(like, like, like, like, like);
  }
  if (filters.sender) {
    where.push('(m.sender_name LIKE ? OR m.sender_email LIKE ?)');
    params.push(`%${filters.sender}%`, `%${filters.sender}%`);
  }
  if (list(filters.category).length) {
    where.push('a.category IN (?)');
    params.push(list(filters.category));
  }
  if (list(filters.priority).length) {
    where.push('a.priority IN (?)');
    params.push(list(filters.priority));
  }
  if (filters.type) {
    where.push('m.type = ?');
    params.push(filters.type);
  }
  if (filters.analyzed === 'yes') where.push('a.message_id IS NOT NULL');
  if (filters.analyzed === 'no') where.push('a.message_id IS NULL');
  if (filters.requiresResponse === 'yes' || filters.requiresResponse === true) where.push('a.requires_response = 1');

  const rows = await query(
    `SELECT ${MESSAGE_COLUMNS}
       FROM messages m LEFT JOIN message_analyses a ON a.message_id = m.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${filters.sort === 'priority' ? "a.priority IS NULL, FIELD(a.priority, 'high', 'medium', 'low'), " : ''}m.sent_at DESC
      LIMIT 500`,
    params,
  );
  return rows.map(shapeMessage);
}

export async function getMessage(id) {
  const [row] = await query(
    `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN message_analyses a ON a.message_id = m.id WHERE m.id = ?`,
    [id],
  );
  if (!row) throw new HttpError(404, `Message ${id} not found`);
  return shapeMessage(row);
}

/** Raw rows in the shape the analyzer expects. */
export async function messagesForAnalysis({ ids, onlyUnanalyzed }) {
  const where = [];
  const params = [];
  if (ids?.length) {
    where.push('m.id IN (?)');
    params.push(ids);
  }
  if (onlyUnanalyzed) where.push('a.message_id IS NULL');
  return query(
    `SELECT m.* FROM messages m LEFT JOIN message_analyses a ON a.message_id = m.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.sent_at`,
    params,
  );
}

export async function deleteMessage(id) {
  const result = await query('DELETE FROM messages WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, `Message ${id} not found`);
}

export async function listImports() {
  return query('SELECT * FROM import_batches ORDER BY id DESC LIMIT 50');
}
