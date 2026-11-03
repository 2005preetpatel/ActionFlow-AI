import { CalendarClock, Copy, Lock, Mail } from 'lucide-react';
import { PriorityBadge, StatusBadge, cx, formatDueDate, isOverdue } from './ui.jsx';

/** Compact task line used on the dashboard, inbox and search results. */
export default function TaskRow({ task, onClick, showMessage = true }) {
  const overdue = isOverdue(task);
  return (
    <button
      onClick={() => onClick?.(task)}
      className={cx(
        'flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition hover:border-indigo-300 hover:shadow-sm',
        task.priority === 'high' && task.status !== 'completed' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">#{task.id}</span>
          <span className={cx('font-medium text-slate-800', task.status === 'completed' && 'text-slate-400 line-through')}>{task.title}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {task.dueDate && (
            <span className={cx('flex items-center gap-1', overdue && 'font-medium text-rose-600')}>
              <CalendarClock className="h-3.5 w-3.5" /> {overdue ? 'Overdue · ' : ''}
              {formatDueDate(task.dueDate)}
            </span>
          )}
          {showMessage && task.message && (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Mail className="h-3.5 w-3.5 shrink-0" /> {task.message.sender} · {task.message.subject}
            </span>
          )}
          {task.blockedBy.length > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <Lock className="h-3.5 w-3.5" /> Blocked by #{task.blockedBy.join(', #')}
            </span>
          )}
          {task.duplicateOf && (
            <span className="flex items-center gap-1 text-amber-700">
              <Copy className="h-3.5 w-3.5" /> Possible duplicate of #{task.duplicateOf.id}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
      </div>
    </button>
  );
}
