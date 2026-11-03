import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z', // DATETIME columns hold UTC
  dateStrings: ['DATE'], // keep due dates as plain YYYY-MM-DD strings
  charset: 'utf8mb4',
});

// Make the session clock UTC too, so TIMESTAMP columns round-trip correctly.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Runs fn(connection) inside a transaction. */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
