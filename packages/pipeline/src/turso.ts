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
  RadarSignal,
  ReverseDcfReport,
} from '@stock-vetter/schema';
import { getTursoClient, isTursoConfigured, migrate } from '@stock-vetter/core';
import { loadTickerFixtures } from './fixture-loader.js';

export { isTursoConfigured, getTursoClient, migrate } from '@stock-vetter/core';

// ---- short-side radar ---------------------------------------------------

/**
 * Persist radar signals, deduped by `key` (INSERT OR IGNORE). Returns the
 * genuinely NEW signals — the "what's new since last run" delta the digest
 * reports, since an already-seen key is silently ignored. No-op returning [] when
 * Turso isn't configured. `first_seen_at` is stamped only on first insertion.
 */
export async function upsertRadarSignals(signals: RadarSignal[]): Promise<RadarSignal[]> {
  if (!signals.length || !isTursoConfigured()) return [];
  await migrate();
  const client = getTursoClient();
  if (!client) return [];
  const now = new Date().toISOString();
  const inserted: RadarSignal[] = [];
  for (const s of signals) {
    const res = await client.execute({
      sql: `INSERT OR IGNORE INTO short_radar
            (key, ticker, cik, accession, form, filing_date, kind, severity, headline, detail, first_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [s.key, s.ticker, s.cik, s.accession, s.form, s.filingDate, s.kind, s.severity, s.headline, s.detail, now],
    });
    if (res.rowsAffected > 0) inserted.push(s);
  }
  return inserted;
}

// ---- deep-dive job queue ------------------------------------------------

export type RadarJobInput = { ticker: string; form: string; accession: string; filingDate: string };
export type ClaimedRadarJob = RadarJobInput & { attempts: number };
export type RadarJobResult = {
  triageScore: number | null;
  escalated: boolean;
  verdict: string;
  conviction: number | null;
  assessmentJson: string | null;
};

/**
 * Enqueue one deep-dive job per filing, deduped by accession (INSERT OR IGNORE).
 * Returns the count of genuinely new jobs. No-op when Turso isn't configured.
 */
export async function enqueueRadarJobs(jobs: RadarJobInput[]): Promise<number> {
  if (!jobs.length || !isTursoConfigured()) return 0;
  await migrate();
  const client = getTursoClient();
  if (!client) return 0;
  const now = new Date().toISOString();
  let inserted = 0;
  for (const j of jobs) {
    const res = await client.execute({
      sql: `INSERT OR IGNORE INTO radar_jobs (accession, ticker, form, filing_date, status, enqueued_at)
            VALUES (?, ?, ?, ?, 'pending', ?)`,
      args: [j.accession, j.ticker, j.form, j.filingDate, now],
    });
    if (res.rowsAffected > 0) inserted += 1;
  }
  return inserted;
}

/**
 * Enqueue a pending job for every radar signal's filing that doesn't already
 * have one (deduped per accession). Self-healing and idempotent: it backfills
 * signals surfaced before the queue existed and closes any gap where a signal
 * was stored but its job enqueue failed. Returns the count of new jobs.
 */
export async function enqueueMissingRadarJobs(): Promise<number> {
  if (!isTursoConfigured()) return 0;
  await migrate();
  const client = getTursoClient();
  if (!client) return 0;
  const res = await client.execute({
    sql: `INSERT OR IGNORE INTO radar_jobs (accession, ticker, form, filing_date, status, enqueued_at)
          SELECT DISTINCT sr.accession, sr.ticker, sr.form, sr.filing_date, 'pending', ?
          FROM short_radar sr
          LEFT JOIN radar_jobs j ON j.accession = sr.accession
          WHERE j.accession IS NULL`,
    args: [new Date().toISOString()],
  });
  return res.rowsAffected;
}

/**
 * Atomically claim the oldest pending job. The guarded UPDATE (…WHERE
 * status='pending') is what actually claims it, so even a second worker can't
 * double-process; we retry a few candidates if we lose a race. Returns null
 * when the queue is empty.
 */
export async function claimNextRadarJob(): Promise<ClaimedRadarJob | null> {
  if (!isTursoConfigured()) return null;
  await migrate();
  const client = getTursoClient();
  if (!client) return null;
  // A job left 'running' for over 30 minutes is from a worker that died mid-job
  // (deep-dives take ~5-10 min); reclaim it so a crash/reboot doesn't strand it.
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  for (let i = 0; i < 5; i++) {
    const pending = await client.execute({
      sql: `SELECT accession, ticker, form, filing_date, attempts FROM radar_jobs
            WHERE status = 'pending' OR (status = 'running' AND started_at < ?)
            ORDER BY enqueued_at LIMIT 1`,
      args: [staleBefore],
    });
    const row = pending.rows[0];
    if (!row) return null;
    const accession = String(row.accession);
    const claim = await client.execute({
      sql: `UPDATE radar_jobs SET status='running', started_at=?, attempts=attempts+1
            WHERE accession=? AND (status='pending' OR (status='running' AND started_at < ?))`,
      args: [new Date().toISOString(), accession, staleBefore],
    });
    if (claim.rowsAffected > 0) {
      return {
        accession,
        ticker: String(row.ticker),
        form: String(row.form),
        filingDate: String(row.filing_date),
        attempts: Number(row.attempts) + 1,
      };
    }
    // Lost the race for this candidate — try the next.
  }
  return null;
}

/** Mark a claimed job done and record the deep-dive result. */
export async function completeRadarJob(accession: string, r: RadarJobResult): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  await client.execute({
    sql: `UPDATE radar_jobs SET status='done', finished_at=?, triage_score=?, escalated=?,
          verdict=?, conviction=?, assessment_json=?, error=NULL WHERE accession=?`,
    args: [
      new Date().toISOString(),
      r.triageScore,
      r.escalated ? 1 : 0,
      r.verdict,
      r.conviction,
      r.assessmentJson,
      accession,
    ],
  });
}

/** Return a claimed job to the queue (pending) — for a transient failure like
 *  the box going offline mid-job, so it retries rather than being marked failed. */
export async function requeueRadarJob(accession: string): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  await client.execute({
    sql: `UPDATE radar_jobs SET status='pending', started_at=NULL WHERE accession=?`,
    args: [accession],
  });
}

/** Return every `failed` job to the queue (pending) — e.g. after topping up
 *  Claude credits so credit-lapse failures re-run. Returns the count reset. */
export async function requeueFailedRadarJobs(): Promise<number> {
  if (!isTursoConfigured()) return 0;
  await migrate();
  const client = getTursoClient();
  if (!client) return 0;
  const res = await client.execute(
    `UPDATE radar_jobs SET status='pending', started_at=NULL, error=NULL WHERE status='failed'`,
  );
  return res.rowsAffected;
}

/** Reset completed jobs to `pending` so the worker re-runs them under the
 *  current pipeline — e.g. after the synthesis frame changed. Clears the prior
 *  result (verdict, conviction, assessment, triage) so the re-run starts clean.
 *  With `accessions`, only those done jobs; otherwise every done job. Returns the
 *  count reset. */
export async function reanalyzeDoneRadarJobs(accessions?: string[]): Promise<number> {
  if (!isTursoConfigured()) return 0;
  await migrate();
  const client = getTursoClient();
  if (!client) return 0;
  const clear =
    `status='pending', started_at=NULL, finished_at=NULL, triage_score=NULL, ` +
    `escalated=0, verdict=NULL, conviction=NULL, assessment_json=NULL, error=NULL`;
  if (accessions && accessions.length) {
    const placeholders = accessions.map(() => '?').join(',');
    const res = await client.execute({
      sql: `UPDATE radar_jobs SET ${clear} WHERE status='done' AND accession IN (${placeholders})`,
      args: accessions,
    });
    return res.rowsAffected;
  }
  const res = await client.execute(`UPDATE radar_jobs SET ${clear} WHERE status='done'`);
  return res.rowsAffected;
}

/** Mark a claimed job failed with an error message. */
export async function failRadarJob(accession: string, error: string): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  await client.execute({
    sql: `UPDATE radar_jobs SET status='failed', finished_at=?, error=? WHERE accession=?`,
    args: [new Date().toISOString(), error.slice(0, 500), accession],
  });
}

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
