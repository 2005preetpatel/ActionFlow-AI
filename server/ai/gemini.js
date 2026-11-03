import { config } from '../config.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRYABLE = new Set([429, 500, 502, 504]);
// 503 = model overloaded, 404 = model retired for this key: switch to the next model instead of waiting.
const SWITCH_MODEL = new Set([503, 404]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Reads Google's suggested retry delay ("retryDelay": "17s") from a 429 body, if present. */
function retryDelayMs(body, attempt) {
  const hint = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1];
  const base = hint ? Number(hint) * 1000 : 2000 * 2 ** attempt;
  return Math.min(base + 250, 45000);
}

/** The model that answered the most recent request (shown with each analysis). */
export let lastModelUsed = config.ai.model;

async function callModel(model, body, maxAttempts) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let res;
    try {
      res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.ai.geminiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      lastError = new AiError(`Gemini request failed: ${err.message}`);
      await sleep(1500 * (attempt + 1));
      continue;
    }

    const text = await res.text();
    if (res.ok) return JSON.parse(text);

    const detail = (() => {
      try {
        return JSON.parse(text).error?.message;
      } catch {
        return text.slice(0, 300);
      }
    })();
    lastError = new AiError(`Gemini ${res.status} (${model}): ${detail}`, res.status);
    if (SWITCH_MODEL.has(res.status) || !RETRYABLE.has(res.status)) throw lastError;
    if (attempt < maxAttempts - 1) await sleep(retryDelayMs(text, attempt));
  }
  throw lastError;
}

/**
 * Calls Gemini generateContent. With `schema`, Gemini's structured output mode
 * guarantees syntactically valid JSON that we then parse and validate ourselves.
 * Falls back through config.ai.fallbackModels when a model is overloaded.
 */
export async function generate({ system, prompt, schema, temperature = 0.2, maxAttempts = 3 }) {
  if (!config.ai.geminiKey) throw new AiError('GEMINI_API_KEY is not configured');

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
  };

  const models = [config.ai.model, ...config.ai.fallbackModels.filter((m) => m !== config.ai.model)];
  let lastError;
  for (const model of models) {
    let data;
    try {
      data = await callModel(model, body, maxAttempts);
    } catch (err) {
      lastError = err;
      if (SWITCH_MODEL.has(err.status)) continue;
      throw err;
    }

    const candidate = data.candidates?.[0];
    const output = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || '').join('') ?? '';
    if (!output) {
      throw new AiError(`Gemini returned no content (finishReason: ${candidate?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown'})`);
    }
    lastModelUsed = model;
    if (!schema) return output.trim();
    try {
      return JSON.parse(output);
    } catch {
      throw new AiError(`Gemini (${model}) returned malformed JSON`);
    }
  }
  throw lastError;
}
