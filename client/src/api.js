async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.details = data.details;
    throw err;
  }
  return data;
}

const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api = {
  stats: () => request('GET', '/stats'),
  health: () => request('GET', '/health'),

  messages: (filters) => request('GET', `/messages${qs(filters)}`),
  message: (id) => request('GET', `/messages/${encodeURIComponent(id)}`),
  importJson: (filename, data) => request('POST', '/messages/import', { filename, data }),
  imports: () => request('GET', '/messages/imports'),
  createMessage: (msg, analyze) => request('POST', `/messages${analyze ? '?analyze=true' : ''}`, msg),
  deleteMessage: (id) => request('DELETE', `/messages/${encodeURIComponent(id)}`),
  analyzeMessage: (id) => request('POST', `/messages/${encodeURIComponent(id)}/analyze`),
  reply: (id, tone, instructions) => request('POST', `/messages/${encodeURIComponent(id)}/reply`, { tone, instructions }),

  runAnalysis: (body = {}) => request('POST', '/analysis/run', body),
  job: (id) => request('GET', `/analysis/jobs/${id}`),

  tasks: (filters) => request('GET', `/tasks${qs(filters)}`),
  createTask: (task) => request('POST', '/tasks', task),
  updateTask: (id, patch) => request('PATCH', `/tasks/${id}`, patch),
  deleteTask: (id) => request('DELETE', `/tasks/${id}`),
  addDependency: (id, dependsOnId) => request('POST', `/tasks/${id}/dependencies`, { dependsOnId }),
  removeDependency: (id, dependsOnId) => request('DELETE', `/tasks/${id}/dependencies/${dependsOnId}`),
  exportCsvUrl: (filters) => `/api/tasks/export.csv${qs(filters)}`,

  smartSearch: (query) => request('POST', '/search/smart', { query }),
  latestSummary: () => request('GET', '/summaries/latest'),
  createSummary: () => request('POST', '/summaries/daily'),
};
