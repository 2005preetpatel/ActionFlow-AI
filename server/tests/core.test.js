// Unit tests for the logic that does not need MySQL or Gemini: run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateImportDocument } from '../lib/messageSchema.js';
import { applyGuards } from '../ai/analyzer.js';
import { analyzeHeuristically } from '../ai/heuristic.js';
import { findDuplicate } from '../services/tasks.js';
import { describeLocalDate, similarity } from '../lib/text.js';

const valid = {
  id: 'MSG001',
  type: 'email',
  sender: { name: 'Rahul Sharma', email: 'rahul@example.com' },
  recipient: 'team@example.com',
  subject: 'Website Launch',
  date: '2026-11-02T10:30:00+05:30',
  content: 'Please complete the payment gateway integration and share the staging URL before Thursday.',
  attachments: [],
};

test('sample_messages.json is fully valid', () => {
  const doc = JSON.parse(readFileSync(new URL('../../sample_messages.json', import.meta.url), 'utf8'));
  const { fatal, valid: ok, errors } = validateImportDocument(doc);
  assert.equal(fatal, undefined);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.ok(ok.length >= 20 && ok.length <= 30);
});

test('rejects documents without a messages array', () => {
  assert.match(validateImportDocument({}).fatal, /messages/);
  assert.match(validateImportDocument([]).fatal, /Root/);
});

test('reports invalid messages individually and keeps valid ones', () => {
  const { valid: ok, errors } = validateImportDocument({
    messages: [
      valid,
      { ...valid, id: 'MSG002', type: 'sms' },
      { ...valid, id: 'MSG003', date: '02/11/2026' },
      { ...valid, id: 'MSG004', sender: { name: 'X' } },
      { ...valid }, // duplicate id
      { ...valid, id: 'MSG005', priority: 'extra fields are allowed' },
    ],
  });
  assert.deepEqual(ok.map((m) => m.id), ['MSG001', 'MSG005']);
  assert.equal(errors.length, 4);
  assert.match(errors[0].problems[0], /type/);
  assert.match(errors[1].problems[0], /ISO 8601/);
  assert.match(errors[2].problems[0], /sender.email/);
  assert.match(errors[3].problems[0], /duplicated/);
});

test('guards drop invented deadlines and tasks for no-action messages', () => {
  const message = { id: 'MSG001', subject: valid.subject, content: valid.content };
  const base = { requires_action: true, requires_response: true, suggested_reply: 'Hi', tasks: [] };

  const kept = applyGuards(
    { ...base, tasks: [{ title: 'Integrate gateway', priority: 'high', due_date: '2026-11-05', due_date_evidence: 'before Thursday' }] },
    message,
  );
  assert.equal(kept.tasks[0].due_date, '2026-11-05');

  const invented = applyGuards(
    { ...base, tasks: [{ title: 'Integrate gateway', priority: 'high', due_date: '2026-11-05', due_date_evidence: 'by Friday' }] },
    message,
  );
  assert.equal(invented.tasks[0].due_date, null);

  const informational = applyGuards({ ...base, requires_action: false, requires_response: false, tasks: [{ title: 'x', priority: 'low' }] }, message);
  assert.equal(informational.tasks.length, 0);
  assert.equal(informational.suggested_reply, null);
});

test('duplicate detection matches similar titles from other messages only', () => {
  const open = [
    { id: 1, title: 'Prepare Q4 analytics report for Greenleaf Organics', message_id: 'MSG010' },
    { id: 2, title: 'Fix login page on mobile', message_id: 'MSG011' },
  ];
  assert.equal(findDuplicate('Share Greenleaf Q4 analytics report', open)?.id, 1);
  assert.equal(findDuplicate('Share Greenleaf Q4 analytics report', open, { excludeMessageId: 'MSG010' }), null);
  assert.equal(findDuplicate('Book venue for offsite', open), null);
  assert.ok(similarity('a b c', '') === 0);
});

test('heuristic analyzer never sets due dates', () => {
  const result = analyzeHeuristically({ ...valid, sender_name: 'Rahul Sharma' });
  assert.ok(result.tasks.every((t) => t.due_date === null));
});

test('describeLocalDate keeps the sender offset and weekday', () => {
  assert.equal(describeLocalDate('2026-11-02T10:30:00+05:30'), 'Monday, 2026-11-02 10:30 (+05:30)');
});
