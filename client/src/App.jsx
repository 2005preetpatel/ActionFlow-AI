import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Columns3, Inbox as InboxIcon, LayoutDashboard, ListTodo, Loader2, Sparkles, Upload, Zap } from 'lucide-react';
import { api } from './api.js';
import { Button, ToastProvider, cx, useToast } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Tasks from './pages/Tasks.jsx';
import Board from './pages/Board.jsx';
import ImportPage from './pages/Import.jsx';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inbox', label: 'Inbox', icon: InboxIcon },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/board', label: 'Kanban Board', icon: Columns3 },
  { to: '/import', label: 'Import', icon: Upload },
];

function Shell() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [job, setJob] = useState(null);
  const [version, setVersion] = useState(0); // bump to make pages refetch
  const pollRef = useRef(null);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const poll = useCallback(
    (id) => {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const j = await api.job(id);
          setJob(j);
          if (j.status !== 'running') {
            clearInterval(pollRef.current);
            refresh();
            if (j.status === 'completed') {
              toast(`Analyzed ${j.analyzed} message(s), created ${j.tasksCreated} task(s)${j.errors.length ? ` · ${j.errors.length} failed` : ''}`, j.errors.length ? 'error' : 'success');
            } else toast(`Analysis failed: ${j.errors[0]?.error || 'unknown error'}`, 'error');
            setTimeout(() => setJob(null), 4000);
          } else if (j.processed) refresh();
        } catch {
          clearInterval(pollRef.current);
        }
      }, 1500);
    },
    [refresh, toast],
  );

  // Resume progress display if a job was already running (e.g. after page reload).
  useEffect(() => {
    if (stats?.activeJob && !job) {
      setJob(stats.activeJob);
      poll(stats.activeJob.id);
    }
  }, [stats, job, poll]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const startAnalysis = useCallback(
    async (body = {}) => {
      try {
        const j = await api.runAnalysis(body);
        if (!j.total) {
          toast('Nothing to analyze - all messages are already analyzed');
          return;
        }
        setJob(j);
        poll(j.id);
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    [poll, toast],
  );

  const running = job?.status === 'running';
  const pct = job?.total ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <AppContext.Provider value={{ stats, refresh, version, startAnalysis, job }}>
      <div className="flex min-h-full">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 text-slate-300 lg:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-white">ActionFlow AI</p>
              <p className="text-xs text-slate-400">Inbox → Actions</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white')
                }
              >
                <Icon className="h-4.5 w-4.5" />
                {label}
                {to === '/inbox' && stats?.messages.unanalyzed > 0 && (
                  <span className="ml-auto rounded-full bg-indigo-500/20 px-2 text-xs text-indigo-300">{stats.messages.unanalyzed}</span>
                )}
                {to === '/tasks' && stats?.tasks.highOpen > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500/20 px-2 text-xs text-rose-300">{stats.tasks.highOpen}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="m-3 rounded-lg bg-slate-800/70 p-3 text-xs">
            <p className="text-slate-400">AI engine</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-medium text-white">
              <span className={cx('h-2 w-2 rounded-full', stats?.ai.provider === 'gemini' ? 'bg-emerald-400' : 'bg-amber-400')} />
              {stats ? (stats.ai.provider === 'gemini' ? `Gemini · ${stats.ai.model}` : 'Heuristic (no API key)') : 'Connecting…'}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-8">
            <nav className="flex gap-1 overflow-x-auto lg:hidden">
              {NAV.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap', isActive ? 'bg-slate-900 text-white' : 'text-slate-600')}>
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              {job && (
                <div className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
                  {running && <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />}
                  <span>
                    {running ? `Analyzing ${job.processed}/${job.total}` : `Done ${job.analyzed}/${job.total}`}
                  </span>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${running ? Math.max(pct, 5) : 100}%` }} />
                  </div>
                </div>
              )}
              <Button onClick={() => startAnalysis()} loading={running} disabled={!stats?.messages.unanalyzed}>
                <Sparkles className="h-4 w-4" />
                Analyze inbox{stats?.messages.unanalyzed ? ` (${stats.messages.unanalyzed})` : ''}
              </Button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/inbox/:id" element={<Inbox />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/board" element={<Board />} />
              <Route path="/import" element={<ImportPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
