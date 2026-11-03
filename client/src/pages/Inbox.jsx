import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bot, Check, ClipboardCopy, Inbox as InboxIcon, Mail, MessageSquare, Paperclip, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import TaskModal from '../components/TaskModal.jsx';
import TaskRow from '../components/TaskRow.jsx';
import { Badge, Button, CATEGORY_LABELS, CategoryBadge, EmptyState, PageHeader, PriorityBadge, Spinner, cx, formatDate, useToast } from '../components/ui.jsx';

const SENTIMENT = { positive: 'text-emerald-600', neutral: 'text-slate-500', negative: 'text-rose-600' };

function ReplyBox({ message, onChanged }) {
  const toast = useToast();
  const [tone, setTone] = useState('professional');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const reply = message.analysis?.suggestedReply;

  async function regenerate() {
    setLoading(true);
    try {
      await api.reply(message.id, tone);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Suggested reply</p>
        <div className="flex items-center gap-2">
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" value={tone} onChange={(e) => setTone(e.target.value)}>
            {['professional', 'friendly', 'brief', 'apologetic', 'formal'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={regenerate} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> {reply ? 'Rewrite' : 'Draft reply'}
          </Button>
          {reply && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(reply);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
      <p className="px-3 py-3 text-sm whitespace-pre-wrap text-slate-700">{reply || <span className="text-slate-400">No reply needed for this message.</span>}</p>
    </div>
  );
}

function MessageDetail({ id, onDeleted, allTasks, onTasksChanged }) {
  const toast = useToast();
  const { refresh, version } = useApp();
  const [message, setMessage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.message(id).then(setMessage).catch((err) => toast(err.message, 'error'));
  }, [id, toast]);

  useEffect(load, [load, version]);

  async function analyze() {
    setAnalyzing(true);
    try {
      const res = await api.analyzeMessage(id);
      toast(`Analysis complete · ${res.tasksCreated} task(s) created`);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete message ${id}? Its tasks will be kept but unlinked.`)) return;
    await api.deleteMessage(id);
    toast('Message deleted');
    refresh();
    onDeleted();
  }

  if (!message || message.id !== id) return <Spinner />;
  const a = message.analysis;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{message.subject || '(no subject)'}</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              <span className="font-medium">{message.sender.name}</span> &lt;{message.sender.email}&gt; → {message.recipient}
            </p>
            <p className="text-xs text-slate-400">
              {message.id} · {message.type} · {formatDate(message.sentAt)} · via {message.source}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={a ? 'secondary' : 'primary'} onClick={analyze} loading={analyzing}>
              <Sparkles className="h-3.5 w-3.5" /> {a ? 'Re-analyze' : 'Analyze'}
            </Button>
            <Button size="sm" variant="danger" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{message.content}</div>
        {message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att, i) => (
              <span key={i} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600">
                <Paperclip className="h-3 w-3" /> {typeof att === 'string' ? att : att.filename || att.name || 'attachment'}
                {att.sizeKb ? <span className="text-slate-400">· {att.sizeKb} KB</span> : null}
              </span>
            ))}
          </div>
        )}
      </div>

      {a ? (
        <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-semibold tracking-wide text-indigo-900 uppercase">AI analysis</span>
            <span className="text-xs text-slate-400">
              {a.provider === 'gemini' ? a.model : 'heuristic mode'} · {formatDate(a.analyzedAt)}
            </span>
          </div>
          <p className="text-sm text-slate-800">{a.summary}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Category</dt>
              <dd className="mt-0.5">
                <CategoryBadge category={a.category} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Priority</dt>
              <dd className="mt-0.5" title={a.reasoning || ''}>
                <PriorityBadge priority={a.priority} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Response required</dt>
              <dd className="mt-0.5 font-medium">{a.requiresResponse ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Sentiment</dt>
              <dd className={cx('mt-0.5 font-medium capitalize', SENTIMENT[a.sentiment])}>{a.sentiment}</dd>
            </div>
          </dl>
          <p className="text-sm">
            <span className="text-xs text-slate-500">Intent: </span>
            <span className="text-slate-700">{a.intent}</span>
          </p>
          {a.reasoning && (
            <p className="text-sm">
              <span className="text-xs text-slate-500">Why this priority: </span>
              <span className="text-slate-700">{a.reasoning}</span>
            </p>
          )}
          <ReplyBox message={message} onChanged={load} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
          Not analyzed yet. Click <strong>Analyze</strong> to summarize, prioritize and extract tasks.
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Tasks from this message ({message.tasks.length})</p>
        </div>
        {message.tasks.length ? (
          <div className="space-y-2">
            {message.tasks.map((t) => (
              <TaskRow key={t.id} task={t} showMessage={false} onClick={setEditing} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{a ? (a.requiresAction ? 'No tasks.' : 'No action required - no tasks created.') : '—'}</p>
        )}
      </div>

      <TaskModal
        open={!!editing}
        task={editing}
        allTasks={allTasks}
        onClose={() => setEditing(null)}
        onSaved={() => {
          refresh();
          onTasksChanged();
        }}
      />
    </div>
  );
}

export default function Inbox() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { version } = useApp();
  const [messages, setMessages] = useState(null);
  const [allTasks, setAllTasks] = useState([]);

  const filters = {
    search: params.get('search') || '',
    category: params.get('category') || '',
    priority: params.get('priority') || '',
    analyzed: params.get('analyzed') || '',
    requiresResponse: params.get('requiresResponse') || '',
    type: params.get('type') || '',
    sort: params.get('sort') || 'date',
  };
  const key = JSON.stringify(filters);

  const setFilter = (k) => (e) => {
    const next = new URLSearchParams(params);
    const v = e.target.type === 'checkbox' ? (e.target.checked ? 'yes' : '') : e.target.value;
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const handle = setTimeout(() => api.messages(JSON.parse(key)).then(setMessages), 200);
    return () => clearTimeout(handle);
  }, [key, version]);

  const loadTasks = useCallback(() => api.tasks().then(setAllTasks), []);
  useEffect(() => {
    loadTasks();
  }, [loadTasks, version]);

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every imported email and message with its AI analysis." />
      <div className="card mb-4 grid grid-cols-2 gap-3 p-3 md:grid-cols-6">
        <div className="relative col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search subject, sender, content…" value={filters.search} onChange={setFilter('search')} />
        </div>
        <select className="input" value={filters.category} onChange={setFilter('category')}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" value={filters.priority} onChange={setFilter('priority')}>
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="input" value={filters.analyzed} onChange={setFilter('analyzed')}>
          <option value="">Analyzed + not</option>
          <option value="yes">Analyzed</option>
          <option value="no">Not analyzed</option>
        </select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={filters.requiresResponse === 'yes'} onChange={setFilter('requiresResponse')} /> Needs reply
          </label>
          <select className="input" value={filters.sort} onChange={setFilter('sort')}>
            <option value="date">Newest</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card max-h-[calc(100vh-15rem)] overflow-y-auto lg:col-span-2">
          {messages === null ? (
            <Spinner />
          ) : messages.length === 0 ? (
            <EmptyState icon={InboxIcon} title="No messages match">
              Try different filters or import messages.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => navigate(`/inbox/${m.id}?${params}`)}
                    className={cx('w-full px-4 py-3 text-left transition hover:bg-slate-50', id === m.id && 'bg-indigo-50/70 hover:bg-indigo-50')}
                  >
                    <div className="flex items-center gap-2">
                      {m.type === 'email' ? <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <span className="truncate text-sm font-medium text-slate-800">{m.sender.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-400">{formatDate(m.sentAt, false)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-700">{m.subject || '(no subject)'}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{m.analysis?.summary || m.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {m.analysis ? (
                        <>
                          <PriorityBadge priority={m.analysis.priority} />
                          <CategoryBadge category={m.analysis.category} />
                          {m.analysis.requiresResponse && <Badge className="bg-violet-50 text-violet-700 ring-violet-600/20">Reply needed</Badge>}
                          {m.taskCount > 0 && <Badge className="bg-slate-50 text-slate-600 ring-slate-500/20">{m.taskCount} task(s)</Badge>}
                        </>
                      ) : (
                        <Badge className="bg-slate-50 text-slate-500 ring-slate-400/20">Not analyzed</Badge>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5 lg:col-span-3">
          {id ? (
            <MessageDetail id={id} allTasks={allTasks} onTasksChanged={loadTasks} onDeleted={() => navigate(`/inbox?${params}`)} />
          ) : (
            <EmptyState icon={Mail} title="Select a message">
              Pick a message to see its summary, priority, suggested reply and extracted tasks.
              <div className="mt-4">
                <Button variant="secondary" onClick={() => navigate('/import#manual')}>
                  <Plus className="h-4 w-4" /> Add a message manually
                </Button>
              </div>
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}
