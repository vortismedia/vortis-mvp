import { Pool, PoolClient } from 'pg';
import { SCHEMA } from './schema';

let pool: Pool | null = null;
let initialized = false;

export interface RunResult {
  changes: number;
  lastInsertRowid?: any;
}

export interface Statement {
  get<T = any>(...params: any[]): Promise<T | undefined>;
  all<T = any>(...params: any[]): Promise<T[]>;
  run(...params: any[]): Promise<RunResult>;
}

export interface DbWrapper {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}

// Convert SQLite-style `?` placeholders to Postgres-style `$1, $2, ...`
function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Convert SQLite-specific syntax to Postgres
function adaptSqlForPostgres(sql: string): string {
  return sql
    // SQLite datetime('now') -> Postgres NOW()
    .replace(/datetime\(\s*['"]now['"]\s*\)/gi, 'NOW()')
    // SQLite INTEGER PRIMARY KEY AUTOINCREMENT (we use UUID strings anyway)
    .replace(/AUTOINCREMENT/gi, '')
    // SQLite TEXT DEFAULT (datetime('now')) → TIMESTAMP DEFAULT NOW()
    .replace(/TEXT DEFAULT \(NOW\(\)\)/gi, 'TIMESTAMP DEFAULT NOW()')
    .replace(/TEXT DEFAULT NOW\(\)/gi, 'TIMESTAMP DEFAULT NOW()');
}

function flattenParams(params: any[]): any[] {
  // better-sqlite3 accepts both spread (a, b, c) and array ([a, b, c]). Normalize.
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

class PgStatement implements Statement {
  constructor(private sql: string, private pool: Pool) {}

  async get<T = any>(...params: any[]): Promise<T | undefined> {
    const result = await this.pool.query(this.sql, flattenParams(params));
    return result.rows[0] as T | undefined;
  }

  async all<T = any>(...params: any[]): Promise<T[]> {
    const result = await this.pool.query(this.sql, flattenParams(params));
    return result.rows as T[];
  }

  async run(...params: any[]): Promise<RunResult> {
    const result = await this.pool.query(this.sql, flattenParams(params));
    return { changes: result.rowCount || 0 };
  }
}

class PgDbWrapper implements DbWrapper {
  constructor(private pool: Pool) {}

  prepare(sql: string): Statement {
    const adapted = adaptSqlForPostgres(sql);
    const finalSql = convertPlaceholders(adapted);
    return new PgStatement(finalSql, this.pool);
  }

  async exec(sql: string): Promise<void> {
    const adapted = adaptSqlForPostgres(sql);
    await this.pool.query(adapted);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const adapted = adaptSqlForPostgres(sql);
    const finalSql = convertPlaceholders(adapted);
    const result = await this.pool.query(finalSql, params);
    return result.rows as T[];
  }
}

export function getDb(): DbWrapper {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Add Neon Postgres connection string to .env');
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => console.error('[Postgres] Pool error:', err.message));
  }
  return new PgDbWrapper(pool);
}

export async function initializeSchema(): Promise<void> {
  if (initialized) return;
  const db = getDb();
  await db.exec(SCHEMA);
  initialized = true;
  console.log('[Postgres] Schema initialized.');
}
