import 'dotenv/config';

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
const requestedProvider = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();

export const config = {
  port: int(process.env.PORT, 4000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    database: process.env.DB_NAME || 'actionflow',
    user: process.env.DB_USER || 'actionflow',
    password: process.env.DB_PASSWORD ?? 'actionflow',
  },
  ai: {
    // Without a key we fall back to the rule-based analyzer so the app still runs;
    // the UI shows which provider produced every analysis.
    provider: requestedProvider === 'heuristic' || !geminiKey ? 'heuristic' : 'gemini',
    geminiKey,
    model: (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim(),
    // Tried in order when the main model is overloaded (503) or retired (404).
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.1-flash-lite,gemini-3.8-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    batchSize: Math.min(int(process.env.AI_BATCH_SIZE, 5), 10),
  },
};
