import mysql from 'mysql2/promise';

/** Creates a connection pool from a mysql:// URL. All timestamps are UTC. */
export function createPool(databaseUrl, { multipleStatements = false } = {}) {
  const url = new URL(databaseUrl);
  return mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    multipleStatements,
  });
}

/** Runs `work(conn)` in a transaction; commits on success, rolls back on any error. */
export async function withTransaction(pool, work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
