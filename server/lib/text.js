const STOPWORDS = new Set(
  'a an the and or of to for in on at by with from is are be please kindly share send our your my this that it as we us you me can could would will need needs'.split(
    ' ',
  ),
);

export function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** Jaccard similarity of two strings' meaningful word sets (0..1). */
export function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / (A.size + B.size - shared);
}

const squash = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** True when `phrase` appears (case/whitespace-insensitively) in `source`. */
export function containsPhrase(source, phrase) {
  const p = squash(phrase).replace(/^["'“”]+|["'“”.]+$/g, '');
  return p.length >= 3 && squash(source).includes(p);
}

export const isIsoDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** "2026-11-02T10:30:00+05:30" -> "Monday, 2026-11-02 10:30 (+05:30)" in the sender's own offset. */
export function describeLocalDate(isoString) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(isoString);
  if (!m) return isoString;
  const weekday = new Date(`${m[1]}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const offset = /(Z|[+-]\d{2}:?\d{2})$/.exec(isoString)?.[1] ?? '';
  return `${weekday}, ${m[1]} ${m[2]}${offset ? ` (${offset})` : ''}`;
}
