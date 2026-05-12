/**
 * Turso (libSQL) persistence for the read-only web viewer.
 *
 * This module is a *best-effort side channel*. The pipeline's source of truth
 * is the `fixtures/<TICKER>/` directory on the laptop that runs the CLI; pushing
 * to Turso is something we do *after* those files are written, and a failure here
 * never fails the local run. If `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` aren't
 * set, every entry point here is a silent no-op so people who never set up Turso
 * aren't nagged.
 *
 * Schema lives in `packages/pipeline/migrations/*.sql`. `migrate()` applies any
 * not-yet-applied migrations (tracked in a `schema_migrations` table). The web
 * app reads these tables; it never writes them.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import type {
  DecisionCard,
  FinancialSnapshot,
  MetaCard,
  PrimarySourceChecklist,
  ReverseDcfReport,
} from '@stock-vetter/schema';

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

// ---- push ---------------------------------------------------------------

export interface PushTickerInput {
  metaCard: MetaCard;
  /** Full primary-source-checklist.json (pass1 + pass2 + pass3 + verification). */
  primaryChecklist: unknown;
  financialSnapshot: FinancialSnapshot;
  reverseDcf: ReverseDcfReport | null;
  /** Analyst-video DecisionCards for this ticker. Empty when none configured. */
  analystCards: DecisionCard[];
}

/**
 * Push one ticker's full analysis into Turso. Upserts the ticker / primary-run /
 * financials rows and replaces (delete-then-insert) the ticker's analyst cards so
 * the DB mirrors the current fixtures exactly. Runs `migrate()` first.
 *
 * Returns true on success, false if Turso isn't configured. Throws on a real
 * failure — callers in the CLI catch and warn rather than fail the run.
 */
export async function pushTicker(input: PushTickerInput): Promise<boolean> {
  const client = getTursoClient();
  if (!client) return false;

  await migrate();

  const { metaCard: m } = input;
  const ticker = m.ticker.toUpperCase();
  const now = new Date().toISOString();

  const stmts: { sql: string; args: (string | number | null)[] }[] = [];

  // tickers
  stmts.push({
    sql: `INSERT INTO tickers
            (ticker, verdict, weighted_score, summary, primary_source_filing, proxy_filing,
             analyst_video_count, total_llm_cost, generated_at, meta_card_json, pushed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ticker) DO UPDATE SET
            verdict=excluded.verdict, weighted_score=excluded.weighted_score,
            summary=excluded.summary, primary_source_filing=excluded.primary_source_filing,
            proxy_filing=excluded.proxy_filing, analyst_video_count=excluded.analyst_video_count,
            total_llm_cost=excluded.total_llm_cost, generated_at=excluded.generated_at,
            meta_card_json=excluded.meta_card_json, pushed_at=excluded.pushed_at`,
    args: [
      ticker,
      m.verdict,
      m.weightedScore,
      m.summary,
      m.inputs.primarySourceFiling,
      m.inputs.proxyFiling,
      m.inputs.analystVideoCount,
      m.totalLlmCost ?? null,
      m.generatedAt,
      JSON.stringify(m),
      now,
    ],
  });

  // primary_source_runs
  const checklist = input.primaryChecklist as {
    pass1?: { ticker?: string; filingAccession?: string };
  };
  const filingAccession =
    checklist.pass1?.filingAccession ?? m.inputs.primarySourceFiling ?? '';
  stmts.push({
    sql: `INSERT INTO primary_source_runs (ticker, filing_accession, generated_at, checklist_json)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(ticker) DO UPDATE SET
            filing_accession=excluded.filing_accession, generated_at=excluded.generated_at,
            checklist_json=excluded.checklist_json`,
    args: [ticker, filingAccession, m.generatedAt, JSON.stringify(input.primaryChecklist)],
  });

  // financials
  stmts.push({
    sql: `INSERT INTO financials (ticker, as_of, snapshot_json, reverse_dcf_json)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(ticker) DO UPDATE SET
            as_of=excluded.as_of, snapshot_json=excluded.snapshot_json,
            reverse_dcf_json=excluded.reverse_dcf_json`,
    args: [
      ticker,
      input.financialSnapshot.asOf,
      JSON.stringify(input.financialSnapshot),
      input.reverseDcf ? JSON.stringify(input.reverseDcf) : null,
    ],
  });

  // analyst videos + cards: delete-then-insert the ticker's cards so the DB
  // mirrors current fixtures (history, if ever wanted, goes in a separate table).
  stmts.push({ sql: `DELETE FROM analyst_cards WHERE ticker = ?`, args: [ticker] });
  for (const card of input.analystCards) {
    stmts.push({
      sql: `INSERT INTO videos (video_id, channel_id, channel, title, published_at, first_seen_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(video_id) DO UPDATE SET
              channel_id=excluded.channel_id, channel=excluded.channel,
              title=excluded.title, published_at=excluded.published_at`,
      args: [
        card.videoId,
        card.channelId || null,
        card.channelName ?? null,
        card.videoTitle ?? null,
        card.publishedAt ?? null,
        now,
      ],
    });
    stmts.push({
      sql: `INSERT INTO analyst_cards
              (ticker, video_id, channel_id, generated_at, weighted_score, verdict, card_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ticker,
        card.videoId,
        card.channelId || null,
        card.generatedAt,
        card.scored.weightedScore,
        card.scored.verdict,
        JSON.stringify(card),
      ],
    });
  }

  await client.batch(stmts, 'write');
  return true;
}
