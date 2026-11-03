import { query, transaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { similarity } from '../lib/text.js';

export const DUPLICATE_THRESHOLD = 0.5;

/** Finds the most similar open task (by title), ignoring tasks from the same message. */
export function findDuplicate(title, candidates, { excludeMessageId } = {}) {
  let best = null;
  for (const c of candidates) {
    if (excludeMessageId && c.message_id === excludeMessageId) continue;
    const score = similarity(title, c.title);
    if (score >= DUPLICATE_THRESHOLD && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best;
}

/** Open tasks used as the comparison set for duplicate detection. */
export async function openTasksForDuplicateCheck(conn) {
  const [rows] = await conn.query(
    "SELECT id, title, message_id FROM tasks WHERE status <> 'completed' AND duplicate_of IS NULL",
  );
  return rows;
}

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

const shapeTask = (r) => ({
  id: r.id,
  messageId: r.message_id,
  title: r.title,
  description: r.description,
  priority: r.priority,
  status: r.status,
  dueDate: r.due_date,
  dueDateEvidence: r.due_date_evidence,
  source: r.source,
  userModified: !!r.user_modified,
  duplicateOf: r.duplicate_of ? { id: r.duplicate_of, title: r.duplicate_title } : null,
  dependsOn: r.depends_on ? String(r.depends_on).split(',').map(Number) : [],
  blockedBy: r.blocked_by ? String(r.blocked_by).split(',').map(Number) : [],
  message: r.message_id ? { id: r.message_id, subject: r.message_subject, sender: r.message_sender, category: r.category } : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
});

const TASK_SELECT = `
  SELECT t.*, d.title AS duplicate_title,
         m.subject AS message_subject, m.sender_name AS message_sender, a.category,
         (SELECT GROUP_CONCAT(td.depends_on_id ORDER BY td.depends_on_id) FROM task_dependencies td WHERE td.task_id = t.id) AS depends_on,
         (SELECT GROUP_CONCAT(td.depends_on_id ORDER BY td.depends_on_id)
            FROM task_dependencies td JOIN tasks dt ON dt.id = td.depends_on_id
           WHERE td.task_id = t.id AND dt.status <> 'completed') AS blocked_by
    FROM tasks t
    LEFT JOIN tasks d ON d.id = t.duplicate_of
    LEFT JOIN messages m ON m.id = t.message_id
    LEFT JOIN message_analyses a ON a.message_id = t.message_id`;

const SORTS = {
  priority: "FIELD(t.priority, 'high', 'medium', 'low'), t.due_date IS NULL, t.due_date",
  due: "t.due_date IS NULL, t.due_date, FIELD(t.priority, 'high', 'medium', 'low')",
  newest: 't.created_at DESC, t.id DESC',
};

export async function listTasks(f = {}) {
  const where = [];
  const params = [];
  const keywords = f.search || f.keywords;
  if (keywords) {
    const like = `%${keywords}%`;
    where.push('(t.title LIKE ? OR t.description LIKE ? OR m.subject LIKE ? OR m.sender_name LIKE ?)');
    params.push(like, like, like, like);
  }
  for (const [key, column] of [
    ['status', 't.status'],
    ['priority', 't.priority'],
    ['category', 'a.category'],
  ]) {
    const values = list(f[key]);
    if (values.length) {
      where.push(`${column} IN (?)`);
      params.push(values);
    }
  }
  if (f.messageId) {
    where.push('t.message_id = ?');
    params.push(f.messageId);
  }
  if (f.sender) {
    where.push('(m.sender_name LIKE ? OR m.sender_email LIKE ?)');
    params.push(`%${f.sender}%`, `%${f.sender}%`);
  }
  if (f.dueFrom) {
    where.push('t.due_date >= ?');
    params.push(f.dueFrom);
  }
  if (f.dueTo) {
    where.push('t.due_date <= ?');
    params.push(f.dueTo);
  }
  if (f.due === 'overdue') where.push("t.due_date < CURDATE() AND t.status <> 'completed'");
  if (f.due === 'week') where.push('t.due_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY');
  if (f.due === 'none') where.push('t.due_date IS NULL');
  if (f.duplicates === 'yes') where.push('t.duplicate_of IS NOT NULL');

  const rows = await query(
    `${TASK_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${SORTS[f.sort] || SORTS.priority} LIMIT 1000`,
    params,
  );
  return rows.map(shapeTask);
}

export async function getTask(id) {
  const [row] = await query(`${TASK_SELECT} WHERE t.id = ?`, [id]);
  if (!row) throw new HttpError(404, `Task #${id} not found`);
  return shapeTask(row);
}

export async function createTask(input) {
  const id = await transaction(async (conn) => {
    if (input.messageId) {
      const [[msg]] = await conn.query('SELECT id FROM messages WHERE id = ?', [input.messageId]);
      if (!msg) throw new HttpError(400, `Message ${input.messageId} does not exist`);
    }
    const dup = findDuplicate(input.title, await openTasksForDuplicateCheck(conn));
    const [res] = await conn.query(
      `INSERT INTO tasks (message_id, title, description, priority, status, due_date, source, user_modified, duplicate_of, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', 1, ?, ?)`,
      [
        input.messageId || null,
        input.title,
        input.description || null,
        input.priority,
        input.status,
        input.dueDate || null,
        dup?.id ?? null,
        input.status === 'completed' ? new Date() : null,
      ],
    );
    return res.insertId;
  });
  return getTask(id);
}

export async function updateTask(id, patch) {
  const current = await getTask(id);

  if (patch.status === 'completed' && current.status !== 'completed' && current.blockedBy.length) {
    throw new HttpError(409, `Task #${id} is blocked by unfinished task(s): ${current.blockedBy.map((d) => `#${d}`).join(', ')}`);
  }

  const sets = [];
  const params = [];
  const map = { title: 'title', description: 'description', priority: 'priority', status: 'status', dueDate: 'due_date' };
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(patch[key] === '' ? null : patch[key]);
    }
  }
  if (patch.dueDate !== undefined) sets.push('due_date_evidence = NULL'); // user-set date replaces AI evidence
  if (patch.duplicateOf === null) sets.push('duplicate_of = NULL');
  if (patch.status !== undefined) {
    sets.push(patch.status === 'completed' ? 'completed_at = COALESCE(completed_at, NOW())' : 'completed_at = NULL');
  }
  if (!sets.length) return current;
  sets.push('user_modified = 1');

  await query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return getTask(id);
}

export async function deleteTask(id) {
  const res = await query('DELETE FROM tasks WHERE id = ?', [id]);
  if (!res.affectedRows) throw new HttpError(404, `Task #${id} not found`);
}

/** Adds "taskId depends on dependsOnId", rejecting self-references and cycles. */
export async function addDependency(taskId, dependsOnId) {
  if (taskId === dependsOnId) throw new HttpError(400, 'A task cannot depend on itself');
  await getTask(taskId);
  await getTask(dependsOnId);

  const edges = await query('SELECT task_id, depends_on_id FROM task_dependencies');
  const next = new Map();
  for (const e of edges) next.set(e.task_id, [...(next.get(e.task_id) || []), e.depends_on_id]);
  // A cycle exists if dependsOnId already (transitively) depends on taskId.
  const stack = [dependsOnId];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (node === taskId) throw new HttpError(409, `Adding this dependency would create a cycle (#${dependsOnId} already depends on #${taskId})`);
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(next.get(node) || []));
  }

  await query('INSERT IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', [taskId, dependsOnId]);
  return getTask(taskId);
}

export async function removeDependency(taskId, dependsOnId) {
  await query('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?', [taskId, dependsOnId]);
  return getTask(taskId);
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function tasksToCsv(tasks) {
  const header = ['ID', 'Title', 'Description', 'Priority', 'Status', 'Due Date', 'Deadline Evidence', 'Source', 'Message ID', 'Message Subject', 'Sender', 'Depends On', 'Possible Duplicate Of', 'Created At', 'Completed At'];
  const lines = tasks.map((t) =>
    [
      t.id,
      t.title,
      t.description,
      t.priority,
      t.status,
      t.dueDate,
      t.dueDateEvidence,
      t.source,
      t.message?.id,
      t.message?.subject,
      t.message?.sender,
      t.dependsOn.map((d) => `#${d}`).join(' '),
      t.duplicateOf ? `#${t.duplicateOf.id}` : '',
      t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      t.completedAt instanceof Date ? t.completedAt.toISOString() : t.completedAt,
    ]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`; // BOM so Excel reads UTF-8
}
