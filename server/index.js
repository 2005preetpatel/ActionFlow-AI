import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { HttpError } from './lib/http.js';
import { api } from './routes.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api', api);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found')));

// Serve the built React app in production (`npm run build && npm start`).
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  const message =
    err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR'
      ? 'Cannot connect to MySQL - check DB_* settings and that the database is running'
      : err.message;
  res.status(status).json({ error: message, details: err.details });
});

app.listen(config.port, () => {
  console.log(`ActionFlow AI API on http://localhost:${config.port}  (AI provider: ${config.ai.provider}${config.ai.provider === 'gemini' ? `, model ${config.ai.model}` : ''})`);
});
