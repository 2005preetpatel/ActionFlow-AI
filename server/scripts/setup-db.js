// Creates the database (if allowed) and applies database/schema.sql.
// Usage: npm run db:setup        npm run db:reset  (drops all ActionFlow tables first)
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { config } from '../config.js';

const reset = process.argv.includes('--reset');
const schema = await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8');

const conn = await mysql.createConnection({ ...config.db, database: undefined, multipleStatements: true });
try {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
} catch (err) {
  console.warn(`Could not create database (${err.message}); assuming it exists.`);
}
await conn.query(`USE \`${config.db.database}\``);
if (reset) {
  await conn.query(
    'SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS task_dependencies, tasks, message_analyses, messages, import_batches, daily_summaries; SET FOREIGN_KEY_CHECKS = 1;',
  );
  console.log('Dropped existing tables.');
}
await conn.query(schema);
await conn.end();
console.log(`Schema applied to ${config.db.database}@${config.db.host}:${config.db.port}`);
