import "server-only";
import pg from "pg";

let pool: pg.Pool | null = null;

/**
 * Direct database connection (owner role) for the sync service and administrator corrections.
 * Server only; every caller checks permissions first.
 */
export function getPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  pool ??= new pg.Pool({ connectionString: url, max: 3, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false } });
  return pool;
}

export async function withClient<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}
