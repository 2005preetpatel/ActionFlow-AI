// Imports sample_messages.json through the same validation used by the UI.
// Usage: npm run import:sample [path/to/file.json]
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../db.js';
import { importDocument } from '../services/messages.js';

const file = resolve(process.argv[2] || 'sample_messages.json');
try {
  const result = await importDocument(JSON.parse(await readFile(file, 'utf8')), file.split(/[\\/]/).pop());
  console.log(`Imported ${result.imported}/${result.total} (already present: ${result.skipped.length}, invalid: ${result.failed.length})`);
  for (const f of result.failed) console.log(`  ${f.id}: ${f.problems.join('; ')}`);
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
