// Turso (libSQL) client + migrations — the generic persistence primitives both
// the pipeline (decision-card push, allowlist) and the signal tracker (cursors,
// thesis status) build on. Pipeline-domain push helpers (pushTicker etc.) stay
// in @stock-vetter/pipeline; these are the shared low-level pieces.
//
// When the env vars aren't set, getTursoClient() returns null and migrate() is
// a no-op, so people who never set up Turso aren't nagged.
//
// Schema lives in `packages/core/migrations/*.sql`. migrate() applies any
// not-yet-applied migrations (tracked in a `schema_migrations` table).

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** True when the env vars needed to talk to Turso are present. */
export function isTursoConfigured(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

let cachedClient: Client | null = null;

/** Get (and cache) a libSQL client, or null if Turso isn't configured. */
export function getTursoClient(): Client | null {
  if (!isTursoConfigured()) return null;
  if (cachedClient) return cachedClient;
  cachedClient = createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN as string,
  });
  return cachedClient;
}

// ---- migrations ----------------------------------------------------------

interface MigrationFile {
  version: number;
  name: string;
  sql: string;
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();
  const out: MigrationFile[] = [];
  for (const f of files) {
    const m = /^(\d+)_(.+)\.sql$/.exec(f);
    if (!m) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, f), 'utf-8');
    out.push({ version: Number(m[1]), name: m[2] ?? f, sql });
  }
  return out;
}

/**
 * Split a migration file into individual statements on `;`. Strips `--` line
 * comments first (so a `;` inside a comment doesn't end a statement); migration
 * files therefore must not contain `;` inside string literals.
 */
function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Apply any migrations not yet recorded in `schema_migrations`. Idempotent.
 * Returns the list of versions applied this call (empty if up to date).
 * No-op (returns []) when Turso isn't configured.
 */
export async function migrate(): Promise<number[]> {
  const client = getTursoClient();
  if (!client) return [];

  await client.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  const applied = new Set(
    (await client.execute(`SELECT version FROM schema_migrations`)).rows.map((r) =>
      Number(r.version),
    ),
  );

  const migrations = await loadMigrations();
  const appliedNow: number[] = [];
  for (const mig of migrations) {
    if (applied.has(mig.version)) continue;
    for (const stmt of splitStatements(mig.sql)) {
      await client.execute(stmt);
    }
    await client.execute({
      sql: `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
      args: [mig.version, new Date().toISOString()],
    });
    appliedNow.push(mig.version);
  }
  return appliedNow;
}
