import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');

export const PRIORITY_STYLES = {
  high: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  low: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };
const STATUS_STYLES = {
  pending: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  in_progress: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};

export const CATEGORY_LABELS = {
  client_request: 'Client Request',
  complaint: 'Complaint',
  meeting: 'Meeting',
  follow_up: 'Follow-up',
  urgent_issue: 'Urgent Issue',
  billing: 'Billing',
  information: 'Information',
  acknowledgement: 'Acknowledgement',
  promotional: 'Promotional',
  other: 'Other',
};

export function Badge({ className, children, title }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', className)}>
      {children}
    </span>
  );
}

export const PriorityBadge = ({ priority }) =>
  priority ? <Badge className={PRIORITY_STYLES[priority]}>{priority[0].toUpperCase() + priority.slice(1)}</Badge> : null;

export const StatusBadge = ({ status }) => <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>;

export const CategoryBadge = ({ category }) =>
  category ? <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-600/20">{CATEGORY_LABELS[category] || category}</Badge> : null;

export function Button({ variant = 'primary', size = 'md', className, loading, children, ...props }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-slate-300" />}
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={cx('card w-full p-0', wide ? 'max-w-3xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatDueDate(day) {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function isOverdue(task) {
  if (!task.dueDate || task.status === 'completed') return false;
  return task.dueDate < new Date().toLocaleDateString('en-CA');
}

// ---- Toasts ---------------------------------------------------------------

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'flex items-start gap-2 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg',
              t.type === 'error' ? 'border-rose-200 text-rose-700' : 'border-emerald-200 text-emerald-700',
            )}
          >
            {t.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
