import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Link2, Mail, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { Button, Modal, formatDueDate, useToast } from './ui.jsx';

const EMPTY = { title: '', description: '', priority: 'medium', status: 'pending', dueDate: '' };

/** Create or edit a task, including its dependencies. `task` = null creates a new one. */
export default function TaskModal({ open, task, onClose, onSaved, allTasks = [] }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [current, setCurrent] = useState(task);
  const [saving, setSaving] = useState(false);
  const [depId, setDepId] = useState('');

  useEffect(() => {
    setCurrent(task);
    setForm(
      task
        ? { title: task.title, description: task.description || '', priority: task.priority, status: task.status, dueDate: task.dueDate || '' }
        : EMPTY,
    );
    setDepId('');
  }, [task, open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (current) {
        await api.updateTask(current.id, { ...form, dueDate: form.dueDate || null });
        toast('Task updated');
      } else {
        await api.createTask({ ...form, dueDate: form.dueDate || null });
        toast('Task created');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete task #${current.id}?`)) return;
    try {
      await api.deleteTask(current.id);
      toast('Task deleted');
      onSaved?.();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function dependencyChange(action, id) {
    try {
      const updated = action === 'add' ? await api.addDependency(current.id, Number(id)) : await api.removeDependency(current.id, id);
      setCurrent(updated);
      setDepId('');
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function clearDuplicate() {
    try {
      setCurrent(await api.updateTask(current.id, { duplicateOf: null }));
      toast('Marked as not a duplicate');
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const depOptions = current ? allTasks.filter((t) => t.id !== current.id && !current.dependsOn.includes(t.id)) : [];

  return (
    <Modal open={open} onClose={onClose} title={current ? `Edit task #${current.id}` : 'New task'} wide={!!current}>
      <form onSubmit={save} className="space-y-4">
        {current?.duplicateOf && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="flex items-center gap-2">
              <Copy className="h-4 w-4" /> Possible duplicate of #{current.duplicateOf.id} “{current.duplicateOf.title}”
            </span>
            <span className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={clearDuplicate}>
                Not a duplicate
              </Button>
              <Button type="button" size="sm" variant="danger" onClick={remove}>
                Delete this one
              </Button>
            </span>
          </div>
        )}

        <div>
          <label className="label">Title</label>
          <input className="input" required maxLength={255} value={form.title} onChange={set('title')} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-24" value={form.description} onChange={set('description')} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={set('priority')}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="label">Due date</label>
            <input type="date" className="input" value={form.dueDate} onChange={set('dueDate')} />
          </div>
        </div>
        {current?.dueDateEvidence && (
          <p className="text-xs text-slate-500">
            AI deadline evidence: <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">“{current.dueDateEvidence}”</span>
          </p>
        )}

        {current && (
          <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <div>
              <p className="label flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" /> Depends on
              </p>
              <div className="space-y-1.5">
                {current.dependsOn.length === 0 && <p className="text-sm text-slate-400">No dependencies</p>}
                {current.dependsOn.map((id) => {
                  const dep = byId.get(id);
                  return (
                    <div key={id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm">
                      <span className={dep?.status === 'completed' ? 'text-slate-400 line-through' : ''}>
                        #{id} {dep?.title}
                      </span>
                      <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => dependencyChange('remove', id)}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-1">
                  <select className="input" value={depId} onChange={(e) => setDepId(e.target.value)}>
                    <option value="">Add dependency…</option>
                    {depOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.id} {t.title.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="secondary" disabled={!depId} onClick={() => dependencyChange('add', depId)}>
                    Add
                  </Button>
                </div>
                {current.blockedBy.length > 0 && <p className="text-xs text-rose-600">Blocked: cannot be completed until #{current.blockedBy.join(', #')} are done.</p>}
              </div>
            </div>
            <div>
              <p className="label flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> Source message
              </p>
              {current.message ? (
                <Link to={`/inbox/${current.message.id}`} className="block rounded-md bg-slate-50 px-3 py-2 text-sm hover:bg-indigo-50">
                  <span className="font-medium text-slate-800">{current.message.subject || '(no subject)'}</span>
                  <span className="block text-xs text-slate-500">
                    {current.message.id} · {current.message.sender}
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-slate-400">Created manually</p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {current.source === 'ai' ? 'Extracted by AI' : 'Manual task'}
                {current.userModified && current.source === 'ai' ? ' · edited by you (kept on re-analysis)' : ''}
                {current.dueDate ? ` · due ${formatDueDate(current.dueDate)}` : ''}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          {current ? (
            <Button type="button" variant="danger" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {current ? 'Save changes' : 'Create task'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
