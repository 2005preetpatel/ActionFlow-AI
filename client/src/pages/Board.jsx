import { useEffect, useState } from 'react';
import { CalendarClock, Copy, Lock, Mail, Search } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import TaskModal from '../components/TaskModal.jsx';
import { PageHeader, PriorityBadge, Spinner, cx, formatDueDate, isOverdue, useToast } from '../components/ui.jsx';

const COLUMNS = [
  { status: 'pending', title: 'Pending', accent: 'bg-sky-500' },
  { status: 'in_progress', title: 'In Progress', accent: 'bg-violet-500' },
  { status: 'completed', title: 'Completed', accent: 'bg-emerald-500' },
];

export default function Board() {
  const toast = useToast();
  const { version, refresh } = useApp();
  const [tasks, setTasks] = useState(null);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [dragOver, setDragOver] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.tasks({ sort: 'priority' }).then(setTasks);
  }, [version]);

  async function move(taskId, status) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const previous = tasks;
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status } : t))); // optimistic
    try {
      await api.updateTask(taskId, { status });
      refresh();
    } catch (err) {
      setTasks(previous);
      toast(err.message, 'error');
    }
  }

  const q = search.toLowerCase();
  const visible = (tasks || []).filter(
    (t) => (!priority || t.priority === priority) && (!q || `${t.title} ${t.description || ''} ${t.message?.sender || ''}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <PageHeader
        title="Kanban board"
        subtitle="Drag cards between columns to update their status."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input className="input w-56 pl-9" placeholder="Filter cards…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input w-36" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </>
        }
      />
      {tasks === null ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = visible.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.status);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  move(Number(e.dataTransfer.getData('text/plain')), col.status);
                }}
                className={cx('flex min-h-96 flex-col rounded-xl border bg-slate-100/70 p-3 transition', dragOver === col.status ? 'border-indigo-400 bg-indigo-50' : 'border-transparent')}
              >
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cx('h-2.5 w-2.5 rounded-full', col.accent)} />
                  <h2 className="text-sm font-semibold text-slate-700">{col.title}</h2>
                  <span className="ml-auto rounded-full bg-white px-2 text-xs text-slate-500">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2.5">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                      onClick={() => setEditing(t)}
                      className={cx(
                        'cursor-grab rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing',
                        t.priority === 'high' && t.status !== 'completed' ? 'border-l-4 border-rose-200 border-l-rose-500' : 'border-slate-200',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={cx('text-sm font-medium text-slate-800', t.status === 'completed' && 'text-slate-400 line-through')}>{t.title}</p>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="text-slate-400">#{t.id}</span>
                        {t.dueDate && (
                          <span className={cx('flex items-center gap-1', isOverdue(t) && 'font-medium text-rose-600')}>
                            <CalendarClock className="h-3 w-3" /> {formatDueDate(t.dueDate)}
                          </span>
                        )}
                        {t.message && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" /> {t.message.sender}
                          </span>
                        )}
                        {t.blockedBy.length > 0 && (
                          <span className="flex items-center gap-1 text-amber-700">
                            <Lock className="h-3 w-3" /> #{t.blockedBy.join(', #')}
                          </span>
                        )}
                        {t.duplicateOf && (
                          <span className="flex items-center gap-1 text-amber-700">
                            <Copy className="h-3 w-3" /> dup of #{t.duplicateOf.id}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Drop tasks here</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <TaskModal open={!!editing} task={editing} allTasks={tasks || []} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}
