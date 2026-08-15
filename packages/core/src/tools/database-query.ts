import { createRequire } from 'node:module';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const MAX_OUTPUT_LENGTH = 30_000;
const MAX_ROWS = 100;
const CONNECT_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 15_000;

/** Read-only query prefixes. */
const ALLOWED_PREFIXES = new Set(['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'PRAGMA', 'WITH']);

/** Write keywords that must never appear anywhere in the query. */
const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|REPLACE|MERGE|CALL|EXEC)\b/i;

function isReadOnlyQuery(query: string): boolean {
  // Strip block comments
  const stripped = query.trim().replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const firstWord = stripped.split(/\s+/)[0]?.toUpperCase();
  if (!firstWord || !ALLOWED_PREFIXES.has(firstWord)) return false;
  if (WRITE_KEYWORDS.test(stripped)) return false;
  return true;
}

function resolveConnectionString(provided?: string): string | undefined {
  if (provided) return provided;
  return process.env.DATABASE_URL || process.env.POSTGRES_URL ||
         process.env.MYSQL_URL || process.env.SQLITE_PATH;
}

function detectDbType(connStr: string): 'postgres' | 'sqlite' | 'mysql' | null {
  if (connStr.startsWith('postgres://') || connStr.startsWith('postgresql://')) return 'postgres';
  if (connStr.startsWith('mysql://')) return 'mysql';
  if (connStr.startsWith('sqlite://') || connStr.startsWith('sqlite:') || connStr.endsWith('.sqlite') ||
      connStr.endsWith('.sqlite3') || connStr.endsWith('.db')) return 'sqlite';
  return null;
}

function formatTable(columns: string[], rows: unknown[][]): string {
  if (columns.length === 0) return '(no columns)';
  const truncatedRows = rows.slice(0, MAX_ROWS);

  // Calculate column widths
  const widths = columns.map((col, i) => {
    const values = truncatedRows.map(r => String(r[i] ?? 'NULL'));
    return Math.min(Math.max(col.length, ...values.map(v => v.length)), 50);
  });

  const header = columns.map((c, i) => c.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');
  const dataRows = truncatedRows.map(row =>
    row.map((v, i) => {
      const s = String(v ?? 'NULL');
      return (s.length > 50 ? s.slice(0, 47) + '...' : s).padEnd(widths[i]);
    }).join(' | ')
  );

  let output = `${header}\n${separator}\n${dataRows.join('\n')}`;
  output += `\n(${rows.length} row${rows.length === 1 ? '' : 's'})`;
  if (rows.length > MAX_ROWS) output += ` — showing first ${MAX_ROWS}`;
  return output;
}

async function queryPostgres(connStr: string, query: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  let pg: any;
  try {
    // @ts-expect-error — pg is an optional peer dependency, only loaded at runtime
    pg = await import('pg');
  } catch {
    throw new Error('pg is not installed. Install it with: npm install pg');
  }
  const Client = pg.default?.Client || pg.Client;
  const client = new Client({ connectionString: connStr, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  await client.connect();
  try {
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await client.query('SET statement_timeout = $1', [QUERY_TIMEOUT_MS]);
    const result = await client.query(query);
    return {
      columns: result.fields?.map((f: any) => f.name) ?? [],
      rows: (result.rows ?? []).map((r: any) => Object.values(r)),
    };
  } finally {
    await client.end();
  }
}

function querySqlite(dbPath: string, query: string, cwd: string): { columns: string[]; rows: unknown[][] } {
  // better-sqlite3 is CJS-only — use createRequire
  const require = createRequire(import.meta.url);
  let Database: any;
  try {
    Database = require('better-sqlite3');
  } catch {
    throw new Error('better-sqlite3 is not installed. Install it with: npm install better-sqlite3');
  }

  const { resolve, isAbsolute } = require('node:path');
  const resolvedPath = isAbsolute(dbPath) ? dbPath : resolve(cwd, dbPath);

  const db = new Database(resolvedPath, { readonly: true });
  try {
    db.pragma('query_only = ON');
    const stmt = db.prepare(query);
    const result = stmt.all();
    if (!result || result.length === 0) return { columns: [], rows: [] };
    return {
      columns: Object.keys(result[0]),
      rows: result.map((r: any) => Object.values(r)),
    };
  } finally {
    db.close();
  }
}

async function queryMysql(connStr: string, query: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  let mysql: any;
  try {
    mysql = await import('mysql2/promise');
  } catch {
    throw new Error('mysql2 is not installed. Install it with: npm install mysql2');
  }
  const createConnection = mysql.default?.createConnection || mysql.createConnection;
  const conn = await createConnection({ uri: connStr, connectTimeout: CONNECT_TIMEOUT_MS });
  try {
    await conn.query('SET SESSION TRANSACTION READ ONLY');
    const [rows, fields] = await conn.query({ sql: query, timeout: QUERY_TIMEOUT_MS });
    return {
      columns: (fields as any[])?.map((f: any) => f.name) ?? [],
      rows: (rows as any[]).map((r: any) => Object.values(r)),
    };
  } finally {
    await conn.end();
  }
}

export class DatabaseQueryTool implements Tool {
  readonly name = 'database_query';
  readonly description = 'Run read-only SQL queries against PostgreSQL, SQLite, or MySQL databases';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'database_query',
    description:
      'Run a read-only SQL query against a database. Supports PostgreSQL, SQLite, and MySQL. ' +
      'ONLY SELECT, SHOW, DESCRIBE, EXPLAIN, and PRAGMA queries are allowed — write operations are blocked. ' +
      'Returns results formatted as a text table. Max 100 rows returned. ' +
      'Connection string can be passed directly or read from DATABASE_URL environment variable. ' +
      'Install the appropriate driver: pg (PostgreSQL), better-sqlite3 (SQLite), mysql2 (MySQL).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SQL query to execute. Must be read-only (SELECT, SHOW, DESCRIBE, EXPLAIN, PRAGMA).',
        },
        connection_string: {
          type: 'string',
          description:
            'Database connection string. Examples: "postgres://user:pass@host:5432/db", ' +
            '"mysql://user:pass@host:3306/db", or a file path for SQLite ("/path/to/db.sqlite"). ' +
            'If omitted, checks DATABASE_URL, POSTGRES_URL, MYSQL_URL, or SQLITE_PATH environment variables.',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = args.query as string;
    const providedConnStr = args.connection_string as string | undefined;

    if (!query?.trim()) {
      return { success: false, output: 'Query is required.' };
    }

    // Validate read-only
    if (!isReadOnlyQuery(query)) {
      return {
        success: false,
        output: 'Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN, PRAGMA, WITH). ' +
                'Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked.',
      };
    }

    // Resolve connection string
    const connStr = resolveConnectionString(providedConnStr);
    if (!connStr) {
      return {
        success: false,
        output: 'No connection string provided. Pass one via connection_string parameter or set ' +
                'DATABASE_URL, POSTGRES_URL, MYSQL_URL, or SQLITE_PATH environment variable.',
      };
    }

    // Detect database type
    const dbType = detectDbType(connStr);
    if (!dbType) {
      return {
        success: false,
        output: `Could not determine database type from connection string. ` +
                `Use postgres://, mysql://, or a .sqlite/.db file path.`,
      };
    }

    try {
      let result: { columns: string[]; rows: unknown[][] };

      switch (dbType) {
        case 'postgres':
          result = await queryPostgres(connStr, query);
          break;
        case 'sqlite': {
          const { validatePath } = await import('./security.js');
          const dbPath = connStr.startsWith('sqlite://') ? connStr.slice(9) :
                         connStr.startsWith('sqlite:') ? connStr.slice(7) : connStr;
          // Validate SQLite path stays within workspace/home to prevent path traversal
          validatePath(dbPath, context.cwd);
          result = querySqlite(dbPath, query, context.cwd);
          break;
        }
        case 'mysql':
          result = await queryMysql(connStr, query);
          break;
      }

      let output = formatTable(result.columns, result.rows);
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
      }

      return {
        success: true,
        output,
        metadata: { dbType, rowCount: result.rows.length, columnCount: result.columns.length },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Database query failed: ${message}` };
    }
  }
}
