import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, Copy, Download, ListTodo, Lock, Plus, Search } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import TaskModal from '../components/TaskModal.jsx';
import { Button, CATEGORY_LABELS, EmptyState, PageHeader, PRIORITY_STYLES, Spinner, cx, formatDueDate, isOverdue, useToast } from '../components/ui.jsx';

const STATUS_SELECT = {
  pending: 'bg-sky-50 text-sky-700 border-sky-200',
  in_progress: 'bg-violet-50 text-violet-700 border-violet-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function Tasks() {
  const toast = useToast();
  const { version, refresh } = useApp();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState(null);
  const [allTasks, setAllTasks] = useState([]);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new

  const filters = {
    search: params.get('search') || '',
    status: params.get('status') || '',
    priority: params.get('priority') || '',
    category: params.get('category') || '',
    due: params.get('due') || '',
    duplicates: params.get('duplicates') || '',
    sort: params.get('sort') || 'priority',
  };
  const key = JSON.stringify(filters);

  const setFilter = (k) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(k, e.target.value);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const load = useCallback(() => {
    api.tasks(JSON.parse(key)).then(setTasks);
    api.tasks().then(setAllTasks);
  }, [key]);

  useEffect(() => {
    const handle = setTimeout(load, 200);
    return () => clearTimeout(handle);
  }, [load, version]);

  async function quickUpdate(task, patch) {
    try {
      await api.updateTask(task.id, patch);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const exportFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="AI-extracted and manual tasks. Edit inline or open a task for details and dependencies."
        actions={
          <>
            <a href={api.exportCsvUrl(exportFilters)}>
              <Button variant="secondary">
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </a>
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          </>
        }
      />

      <div className="card mb-4 grid grid-cols-2 gap-3 p-3 md:grid-cols-7">
        <div className="relative col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search tasks, senders, subjects…" value={filters.search} onChange={setFilter('search')} />
        </div>
        <select className="input" value={filters.status} onChange={setFilter('status')}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="pending,in_progress">Open (not completed)</option>
        </select>
        <select className="input" value={filters.priority} onChange={setFilter('priority')}>
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="input" value={filters.due} onChange={setFilter('due')}>
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due in next 7 days</option>
          <option value="none">No due date</option>
        </select>
        <select className="input" value={filters.category} onChange={setFilter('category')}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" value={filters.sort} onChange={setFilter('sort')}>
          <option value="priority">Sort: priority</option>
          <option value="due">Sort: due date</option>
          <option value="newest">Sort: newest</option>
        </select>
      </div>
      <div className="mb-3 flex items-center gap-4 text-sm text-slate-500">
        <span>{tasks ? `${tasks.length} task(s)` : ''}</span>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filters.duplicates === 'yes'}
            onChange={(e) => setFilter('duplicates')({ target: { value: e.target.checked ? 'yes' : '' } })}
          />
          Only possible duplicates
        </label>
      </div>

      <div className="card overflow-x-auto">
        {tasks === null ? (
          <Spinner />
        ) : tasks.length === 0 ? (
          <EmptyState icon={ListTodo} title="No tasks found">
            Analyze your inbox to extract tasks, or create one manually.
          </EmptyState>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Task</th>
                <th className="px-3 py-3">Source message</th>
                <th className="px-3 py-3">Due</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((t) => {
                const overdue = isOverdue(t);
                return (
                  <tr key={t.id} className={cx('align-top transition hover:bg-slate-50', t.priority === 'high' && t.status !== 'completed' && 'bg-rose-50/30')}>
                    <td className="px-4 py-3">
                      <button onClick={() => setEditing(t)} className="text-left">
                        <span className="mr-1.5 text-xs text-slate-400">#{t.id}</span>
                        <span className={cx('font-medium text-slate-800 hover:text-indigo-600', t.status === 'completed' && 'text-slate-400 line-through')}>{t.title}</span>
                        {t.description && <p className="mt-0.5 line-clamp-2 max-w-xl text-xs text-slate-500">{t.description}</p>}
                      </button>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {t.blockedBy.length > 0 && (
                          <span className="flex items-center gap-1 text-amber-700">
                            <Lock className="h-3 w-3" /> Blocked by #{t.blockedBy.join(', #')}
                          </span>
                        )}
                        {t.duplicateOf && (
                          <button onClick={() => setEditing(t)} className="flex items-center gap-1 text-amber-700 hover:underline">
                            <Copy className="h-3 w-3" /> Possible duplicate of #{t.duplicateOf.id}
                          </button>
                        )}
                        {t.source === 'manual' && <span className="text-slate-400">manual</span>}
                      </div>
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      {t.message ? (
                        <Link to={`/inbox/${t.message.id}`} className="block truncate text-slate-600 hover:text-indigo-600">
                          <span className="text-xs text-slate-400">{t.message.id}</span> {t.message.sender}
                          <span className="block truncate text-xs text-slate-400">{t.message.subject}</span>
                        </Link>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {t.dueDate ? (
                        <span className={cx('flex items-center gap-1', overdue ? 'font-medium text-rose-600' : 'text-slate-600')} title={t.dueDateEvidence ? `From message: “${t.dueDateEvidence}”` : ''}>
                          <CalendarClock className="h-3.5 w-3.5" /> {formatDueDate(t.dueDate)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={t.priority}
                        onChange={(e) => quickUpdate(t, { priority: e.target.value })}
                        className={cx('rounded-md border-0 px-2 py-1 text-xs font-medium ring-1 ring-inset', PRIORITY_STYLES[t.priority])}
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={t.status}
                        onChange={(e) => quickUpdate(t, { status: e.target.value })}
                        className={cx('rounded-md border px-2 py-1 text-xs font-medium', STATUS_SELECT[t.status])}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <TaskModal open={editing !== undefined} task={editing ?? null} allTasks={allTasks} onClose={() => setEditing(undefined)} onSaved={refresh} />
    </>
  );
}
