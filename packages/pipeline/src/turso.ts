/**
 * Pipeline-domain Turso persistence: decision-card / meta-card push, and the
 * web viewer's sign-in allowlist.
 *
 * This module is a *best-effort side channel*. The pipeline's source of truth
 * is the `fixtures/<TICKER>/` directory on the laptop that runs the CLI; pushing
 * to Turso is something we do *after* those files are written, and a failure here
 * never fails the local run. If `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` aren't
 * set, every entry point here is a silent no-op so people who never set up Turso
 * aren't nagged.
 *
 * The generic libSQL client + migration runner moved to @stock-vetter/core
 * (both the pipeline and the signal tracker need them). Schema lives in
 * `packages/core/migrations/*.sql`. We re-export isTursoConfigured /
 * getTursoClient / migrate so existing pipeline-barrel consumers are unchanged.
 */

import type {
  DecisionCard,
  FinancialSnapshot,
  MetaCard,
  ReverseDcfReport,
} from '@stock-vetter/schema';
import { getTursoClient, isTursoConfigured, migrate } from '@stock-vetter/core';
import { loadTickerFixtures } from './fixture-loader.js';

export { isTursoConfigured, getTursoClient, migrate } from '@stock-vetter/core';

// ---- sign-in allowlist --------------------------------------------------
//
// The web viewer's allowlist lives in the `allowed_emails` table (migration
// 0004) so a reader can be added with one CLI command — no env change, no
// Vercel redeploy. These write helpers are used by `scripts/allow-email.ts`;
// the web app's auth.ts reads the table directly via its own libSQL client
// (it must not import this package, to keep the pipeline out of the Vercel
// bundle). All comparisons are on lowercased/trimmed emails.

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Add (or no-op upsert) an email to the allowlist. Runs migrate() first. */
export async function addAllowedEmail(email: string, note?: string): Promise<void> {
  const client = getTursoClient();
  if (!client) throw new Error('Turso is not configured (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).');
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) throw new Error(`Not a valid email: ${email}`);
  await migrate();
  await client.execute({
    sql: `INSERT INTO allowed_emails (email, note, added_at) VALUES (?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET note=excluded.note`,
    args: [normalized, note ?? null, new Date().toISOString()],
  });
}

/** Remove an email from the allowlist. Returns true if a row was deleted. */
export async function removeAllowedEmail(email: string): Promise<boolean> {
  const client = getTursoClient();
  if (!client) throw new Error('Turso is not configured (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).');
  await migrate();
  const res = await client.execute({
    sql: `DELETE FROM allowed_emails WHERE email = ?`,
    args: [normalizeEmail(email)],
  });
  return res.rowsAffected > 0;
}

/** List the current allowlist, newest first. */
export async function listAllowedEmails(): Promise<
  { email: string; note: string | null; addedAt: string }[]
> {
  const client = getTursoClient();
  if (!client) throw new Error('Turso is not configured (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).');
  await migrate();
  const res = await client.execute(
    `SELECT email, note, added_at FROM allowed_emails ORDER BY added_at DESC`,
  );
  return res.rows.map((r) => ({
    email: String(r.email),
    note: r.note == null ? null : String(r.note),
    addedAt: String(r.added_at),
  }));
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

/**
 * Load a ticker's fixtures from disk and push them to Turso. Returns true on
 * success, false if Turso isn't configured (silent no-op). Throws on a real
 * failure — the CLI catches and warns rather than failing the run.
 *
 * `analyze-ticker` calls this *after* writing the fixture files, so the push
 * mirrors exactly what's on disk; `push-fixtures` uses the same path for backfill.
 */
export async function pushTickerFromFixtures(
  fixturesRoot: string,
  ticker: string,
): Promise<boolean> {
  if (!isTursoConfigured()) return false;
  const f = await loadTickerFixtures(fixturesRoot, ticker);
  return pushTicker({
    metaCard: f.metaCard,
    primaryChecklist: f.primaryChecklist,
    financialSnapshot: f.financialSnapshot,
    reverseDcf: f.reverseDcf,
    analystCards: f.analystCards,
  });
}
