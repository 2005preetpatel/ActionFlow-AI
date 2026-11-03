import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileJson, History, PenSquare, Sparkles, UploadCloud } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Button, PageHeader, cx, formatDate, useToast } from '../components/ui.jsx';

function JsonImport({ onImported }) {
  const toast = useToast();
  const { startAnalysis } = useApp();
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setResult(null);
    setError(null);
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Please choose a .json file.');
      return;
    }
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      setError(`File is not valid JSON: ${err.message}`);
      return;
    }
    setLoading(true);
    try {
      const res = await api.importJson(file.name, data);
      setResult(res);
      toast(`Imported ${res.imported} new message(s)`);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <FileJson className="h-4.5 w-4.5 text-indigo-600" /> Import JSON file
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Root object with a <code className="rounded bg-slate-100 px-1">messages</code> array. Each message is validated (unique id, type email/message, ISO 8601
        date, sender name/email…) before it is saved to MySQL. Already-imported ids are skipped.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
          drag ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50',
        )}
      >
        <UploadCloud className="mb-2 h-9 w-9 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">{loading ? 'Importing…' : 'Drop sample_messages.json here or click to browse'}</p>
        <p className="mt-1 text-xs text-slate-400">.json · up to 10 MB</p>
        <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      {error && (
        <div className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {result && (
        <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> {result.imported} of {result.total} message(s) imported
          </p>
          {result.skipped.length > 0 && <p className="text-slate-600">Skipped (already imported): {result.skipped.join(', ')}</p>}
          {result.failed.length > 0 && (
            <div className="text-rose-700">
              <p className="font-medium">{result.failed.length} invalid message(s) rejected:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {result.failed.map((f) => (
                  <li key={`${f.index}-${f.id}`}>
                    <strong>{f.id}</strong>: {f.problems.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.imported > 0 && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => startAnalysis({ messageIds: result.importedIds })}>
                <Sparkles className="h-3.5 w-3.5" /> Analyze imported messages
              </Button>
              <Link to="/inbox">
                <Button size="sm" variant="secondary">
                  Open inbox
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** datetime-local value + the browser's offset -> ISO 8601 with offset. */
function toIsoWithOffset(local) {
  const offset = -new Date(local).getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${local}:00${sign}${hh}:${mm}`;
}

function ManualEntry({ onCreated }) {
  const toast = useToast();
  const empty = { type: 'email', name: '', email: '', recipient: 'team@example.com', subject: '', date: nowLocal(), content: '' };
  const [form, setForm] = useState(empty);
  const [analyze, setAnalyze] = useState(true);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const msg = await api.createMessage(
        {
          type: form.type,
          sender: { name: form.name, email: form.email },
          recipient: form.recipient,
          subject: form.subject,
          date: toIsoWithOffset(form.date),
          content: form.content,
          attachments: [],
        },
        analyze,
      );
      toast(`Message ${msg.id} added${analyze ? ` and analyzed (${msg.taskCount} task(s))` : ''}`);
      setForm({ ...empty, date: nowLocal() });
      onCreated();
    } catch (err) {
      toast(err.details ? `${err.message}: ${err.details.join('; ')}` : err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form id="manual" onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <PenSquare className="h-4.5 w-4.5 text-indigo-600" /> Add message manually
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={set('type')}>
            <option value="email">Email</option>
            <option value="message">Message</option>
          </select>
        </div>
        <div>
          <label className="label">Sender name</label>
          <input className="input" required value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="label">Sender email</label>
          <input className="input" type="email" required value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label">Recipient</label>
          <input className="input" required value={form.recipient} onChange={set('recipient')} />
        </div>
        <div>
          <label className="label">Subject</label>
          <input className="input" value={form.subject} onChange={set('subject')} />
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="datetime-local" required value={form.date} onChange={set('date')} />
        </div>
      </div>
      <div>
        <label className="label">Content</label>
        <textarea className="input min-h-28" required value={form.content} onChange={set('content')} placeholder="Paste the email or chat message…" />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} /> Analyze with AI right away
        </label>
        <Button type="submit" loading={loading}>
          Add message
        </Button>
      </div>
    </form>
  );
}

export default function ImportPage() {
  const { refresh, version } = useApp();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.imports().then(setHistory).catch(() => {});
  }, [version]);

  return (
    <>
      <PageHeader title="Import messages" subtitle="Bring emails and chat messages into ActionFlow." />
      <div className="grid gap-6 lg:grid-cols-2">
        <JsonImport onImported={refresh} />
        <ManualEntry onCreated={refresh} />
      </div>
      <div className="card mt-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <History className="h-4.5 w-4.5 text-slate-500" /> Import history
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-slate-500 uppercase">
                <th className="py-2">When</th>
                <th>Source</th>
                <th>File</th>
                <th>Total</th>
                <th>Imported</th>
                <th>Skipped</th>
                <th>Invalid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="py-2 text-slate-600">{formatDate(h.created_at)}</td>
                  <td className="capitalize">{h.source}</td>
                  <td className="text-slate-500">{h.filename || '—'}</td>
                  <td>{h.total_count}</td>
                  <td className="text-emerald-700">{h.imported}</td>
                  <td className="text-slate-500">{h.skipped}</td>
                  <td className={h.failed ? 'text-rose-600' : 'text-slate-400'}>{h.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
