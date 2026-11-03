import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Flame, Inbox, MailQuestion, Search, Sparkles, Upload, Wand2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import TaskModal from '../components/TaskModal.jsx';
import TaskRow from '../components/TaskRow.jsx';
import { Button, CATEGORY_LABELS, EmptyState, PageHeader, PriorityBadge, formatDate, useToast } from '../components/ui.jsx';

function Stat({ icon: Icon, label, value, hint, tone = 'slate', to }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    sky: 'bg-sky-100 text-sky-600',
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    rose: 'bg-rose-100 text-rose-600',
    amber: 'bg-amber-100 text-amber-600',
  };
  const body = (
    <div className="card flex items-center gap-4 p-4 transition hover:border-indigo-200">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-semibold text-slate-900">{value ?? '—'}</p>
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function SmartSearch({ onOpenTask }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const examples = ['high priority tasks due this week', 'complaints that still need a reply', 'anything about the Q4 analytics report'];

  async function run(text) {
    const query = (text ?? q).trim();
    if (query.length < 2) return;
    setQ(query);
    setLoading(true);
    try {
      setResult(await api.smartSearch(query));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Wand2 className="h-4.5 w-4.5 text-indigo-600" />
        <h2 className="font-semibold text-slate-900">Smart search</h2>
        <span className="text-xs text-slate-400">Ask in plain English - AI turns it into filters</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="e.g. urgent client tasks due before Friday" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" loading={loading}>
          Search
        </Button>
      </form>
      {!result && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button key={ex} onClick={() => run(ex)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-700">
              {ex}
            </button>
          ))}
        </div>
      )}
      {result && (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            <Sparkles className="mr-1 inline h-4 w-4" />
            {result.explanation}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="label">Tasks ({result.tasks.length})</p>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {result.tasks.length === 0 && <p className="text-sm text-slate-400">No matching tasks</p>}
                {result.tasks.slice(0, 20).map((t) => (
                  <TaskRow key={t.id} task={t} onClick={onOpenTask} />
                ))}
              </div>
            </div>
            <div>
              <p className="label">Messages ({result.messages.length})</p>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {result.messages.length === 0 && <p className="text-sm text-slate-400">No matching messages</p>}
                {result.messages.slice(0, 20).map((m) => (
                  <Link key={m.id} to={`/inbox/${m.id}`} className="block rounded-lg border border-slate-200 px-3 py-2 hover:border-indigo-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{m.subject}</span>
                      <PriorityBadge priority={m.analysis?.priority} />
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {m.sender.name} · {m.analysis?.summary || m.content}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setResult(null)}>
            Clear results
          </button>
        </div>
      )}
    </div>
  );
}

function DailySummary() {
  const toast = useToast();
  const { stats } = useApp();
  const [summary, setSummary] = useState(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.latestSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  async function generate() {
    setLoading(true);
    try {
      setSummary(await api.createSummary());
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4.5 w-4.5 text-indigo-600" />
          <h2 className="font-semibold text-slate-900">AI daily briefing</h2>
        </div>
        <Button size="sm" variant="secondary" onClick={generate} loading={loading} disabled={!stats?.tasks.total}>
          {summary ? 'Regenerate' : 'Generate'}
        </Button>
      </div>
      {summary ? (
        <>
          <div className="flex-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{summary.content}</div>
          <p className="mt-3 text-xs text-slate-400">Generated {formatDate(summary.createdAt)}</p>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          {summary === undefined ? 'Loading…' : 'Generate a concise briefing of today’s priorities, overdue work and replies you owe.'}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { stats, version, refresh, startAnalysis } = useApp();
  const [highTasks, setHighTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.tasks({ sort: 'due' }).then((tasks) => {
      setAllTasks(tasks);
      setHighTasks(tasks.filter((t) => t.priority === 'high' && t.status !== 'completed').slice(0, 8));
    });
  }, []);

  useEffect(load, [load, version]);

  const m = stats?.messages;
  const t = stats?.tasks;
  const maxCat = Math.max(1, ...(stats?.categories.map((c) => c.count) || [1]));

  if (stats && m.total === 0) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Your inbox, turned into action." />
        <div className="card">
          <EmptyState icon={Inbox} title="No messages yet">
            Import <code className="rounded bg-slate-100 px-1">sample_messages.json</code> or add a message manually to get started.
            <div className="mt-4">
              <Link to="/import">
                <Button>
                  <Upload className="h-4 w-4" /> Import messages
                </Button>
              </Link>
            </div>
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your inbox, turned into action." />

      {m && m.unanalyzed > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm text-indigo-900">
            <strong>{m.unanalyzed}</strong> message(s) have not been analyzed yet.
          </p>
          <Button size="sm" onClick={() => startAnalysis()}>
            <Sparkles className="h-4 w-4" /> Analyze now
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Inbox} label="Total messages" value={m?.total} hint={m ? `${m.unanalyzed} not analyzed` : ''} to="/inbox" />
        <Stat icon={Sparkles} label="Analyzed messages" value={m?.analyzed} tone="indigo" hint={m?.total ? `${Math.round((m.analyzed / m.total) * 100)}% coverage` : ''} to="/inbox" />
        <Stat icon={Clock} label="Pending tasks" value={t?.pending} tone="sky" hint={t ? `${t.inProgress} in progress` : ''} to="/tasks" />
        <Stat icon={CheckCircle2} label="Completed tasks" value={t?.completed} tone="emerald" hint={t?.total ? `${Math.round((t.completed / t.total) * 100)}% of ${t.total}` : ''} to="/board" />
        <Stat icon={Flame} label="High priority open" value={t?.highOpen} tone="rose" to="/tasks" />
        <Stat icon={AlertTriangle} label="Overdue tasks" value={t?.overdue} tone="amber" to="/tasks" />
        <Stat icon={MailQuestion} label="Awaiting your reply" value={m?.awaitingReply} tone="violet" to="/inbox" />
        <Stat icon={Clock} label="Possible duplicates" value={t?.duplicates} tone="slate" to="/tasks" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Flame className="h-4.5 w-4.5 text-rose-500" /> High-priority tasks
            </h2>
            <Link to="/tasks" className="text-sm text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          {highTasks.length ? (
            <div className="space-y-2">
              {highTasks.map((task) => (
                <TaskRow key={task.id} task={task} onClick={setEditing} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="No open high-priority tasks" />
          )}
        </div>
        <DailySummary />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SmartSearch onOpenTask={setEditing} />
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Messages by category</h2>
          {stats?.categories.length ? (
            <div className="space-y-2.5">
              {stats.categories.map((c) => (
                <Link key={c.category} to={`/inbox?category=${c.category}`} className="block">
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>{CATEGORY_LABELS[c.category] || c.category}</span>
                    <span className="font-medium">{c.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Analyze messages to see categories.</p>
          )}
        </div>
      </div>

      <TaskModal
        open={!!editing}
        task={editing}
        allTasks={allTasks}
        onClose={() => setEditing(null)}
        onSaved={() => {
          refresh();
        }}
      />
    </>
  );
}
