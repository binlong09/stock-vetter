#!/usr/bin/env tsx
/**
 * scripts/radar.ts
 *
 * The always-on "lite" radar: sweep the watchlist for deterministic signals
 * (material 8-K items, financing and listing forms, dilution, cash runway,
 * XBRL trends/restatement/distress composites) with no GPU and no model. New
 * signals are persisted to Turso (deduped by key) so a run surfaces each one
 * once; the web viewer reads them.
 *
 * Defaults to the small-cap tech watchlist (`data/watchlist-smallcap.json`,
 * built by `pnpm build-smallcap`), falling back to the legacy large-cap
 * `data/watchlist.json` when that file doesn't exist. Point it anywhere with
 * `--watchlist=`.
 *
 *   pnpm radar                         # since yesterday (the daily cron mode)
 *   pnpm radar --days=30               # a wider backfill window
 *   pnpm radar --since=2026-07-01
 *   pnpm radar --watchlist=data/watchlist.json   # the old large-cap list
 *   pnpm radar --no-persist            # compute + print only, don't touch Turso
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { computeRadarSignals, capTier, type WatchlistEntry } from '@stock-vetter/local';
import { isTursoConfigured, isMailerConfigured, sendEmail } from '@stock-vetter/core';
import { upsertRadarSignals, enqueueMissingRadarJobs } from '@stock-vetter/pipeline';
import type { RadarSignal } from '@stock-vetter/schema';

const arg = (n: string): string | undefined => {
  const i = process.argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i === -1) return undefined;
  const a = process.argv[i]!;
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  // Accept a space-separated value (`--since 2026-07-01`), which is what the
  // GitHub Action passes — not just the `--since=2026-07-01` form. A trailing
  // flag with no value (e.g. `--no-persist`) returns 'true'.
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
};

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const DEFAULT_WATCHLIST = 'data/watchlist-smallcap.json';
const LEGACY_WATCHLIST = 'data/watchlist.json';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DIRECTION_MARK: Record<string, string> = { bearish: '▼', bullish: '▲', ambiguous: '◆' };

function capLabel(marketCap: number | null): string {
  if (marketCap == null) return '';
  return marketCap >= 1e9 ? `$${(marketCap / 1e9).toFixed(2)}B` : `$${(marketCap / 1e6).toFixed(0)}M`;
}

// Email the NEW signals so the radar can push you the delta rather than needing
// a page visit. No-op unless a recipient (RADAR_DIGEST_TO) and the shared Resend
// mailer are both configured — so it's silent for anyone who never set it up.
async function emailDigest(newSignals: RadarSignal[]): Promise<void> {
  const to = process.env.RADAR_DIGEST_TO;
  if (!to || !isMailerConfigured()) return;
  const base = (process.env.RADAR_BASE_URL ?? '').replace(/\/$/, '');
  const ordered = [...newSignals].sort((a, b) => SEV_ORDER[a.severity]! - SEV_ORDER[b.severity]!);
  const tag = (s: RadarSignal): string =>
    `${DIRECTION_MARK[s.direction] ?? ''} ${s.ticker}${s.marketCap ? ` (${capLabel(s.marketCap)})` : ''}`;
  const line = (s: RadarSignal): string =>
    `[${s.severity}]${tag(s)} ${s.form} (${s.filingDate}) — ${s.headline}`;
  const text =
    `${newSignals.length} new radar signal(s):\n\n${ordered.map(line).join('\n')}\n` +
    (base ? `\n${base}/radar\n` : '');
  const html =
    `<p>${newSignals.length} new radar signal(s):</p><ul>` +
    ordered
      .map(
        (s) =>
          `<li><b>[${s.severity}]</b> ${DIRECTION_MARK[s.direction] ?? ''} ${escapeHtml(s.ticker)}` +
          `${s.marketCap ? ` <span style="color:#94a3b8">${capLabel(s.marketCap)}</span>` : ''} ` +
          `${s.form} (${s.filingDate}) — ${escapeHtml(s.headline)}</li>`,
      )
      .join('') +
    `</ul>` +
    (base ? `<p><a href="${base}/radar">Open the radar →</a></p>` : '');
  const top = ordered[0];
  const subject =
    `Radar: ${newSignals.length} new signal${newSignals.length > 1 ? 's' : ''}` +
    (top ? ` — ${top.ticker}${newSignals.length > 1 ? ' +' : ''}` : '');
  const ok = await sendEmail({ to, subject, text, html });
  process.stderr.write(ok ? `emailed digest to ${to}\n` : 'digest email failed\n');
}

/**
 * Resolve the watchlist path: an explicit `--watchlist=` wins, otherwise the
 * small-cap list if it has been built, otherwise the legacy large-cap one.
 * The fallback is what keeps an existing checkout working before its first
 * `pnpm build-smallcap`.
 */
async function resolveWatchlistPath(): Promise<string> {
  const explicit = arg('watchlist');
  if (explicit && explicit !== 'true') return explicit;
  try {
    await readFile(DEFAULT_WATCHLIST, 'utf-8');
    return DEFAULT_WATCHLIST;
  } catch {
    process.stderr.write(
      `${DEFAULT_WATCHLIST} not found — falling back to ${LEGACY_WATCHLIST}. ` +
        `Build the small-cap universe with: pnpm build-smallcap\n`,
    );
    return LEGACY_WATCHLIST;
  }
}

async function main(): Promise<void> {
  const wlPath = await resolveWatchlistPath();
  const raw = JSON.parse(await readFile(wlPath, 'utf-8')) as { tickers?: WatchlistEntry[] };
  const watchlist = raw.tickers ?? [];
  if (!watchlist.length) {
    process.stderr.write(`${wlPath} has no tickers. Build one with: pnpm build-smallcap\n`);
    process.exit(1);
  }

  const days = Number(arg('days') ?? 1);
  const since = arg('since')
    ? new Date(`${arg('since')}T00:00:00Z`)
    : new Date(Date.now() - days * 86_400_000);
  const persist = arg('no-persist') == null;

  // Report the cap mix, because it decides which detector regime each name
  // runs under — a watchlist with no caps gets the large-cap treatment, and
  // that is worth seeing at the top of a run rather than inferring from the
  // signals that don't appear.
  const tiers = watchlist.reduce<Record<string, number>>((acc, w) => {
    const t = capTier(w.marketCap);
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const mix = Object.entries(tiers)
    .sort(([, a], [, b]) => b - a)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
  process.stderr.write(
    `radar: ${watchlist.length} tickers from ${wlPath} (${mix}) since ${since.toISOString().slice(0, 10)}\n`,
  );
  const until = arg('until') ? new Date(`${arg('until')}T23:59:59Z`) : undefined;
  const { signals, unfetchedDates } = await computeRadarSignals(watchlist, {
    since,
    until,
    onProgress: (m) => process.stderr.write(`  ${m}\n`),
  });
  signals.sort(
    (a, b) => SEV_ORDER[a.severity]! - SEV_ORDER[b.severity]! || a.ticker.localeCompare(b.ticker),
  );

  let newCount = signals.length;
  if (persist && isTursoConfigured()) {
    const newSignals = await upsertRadarSignals(signals);
    newCount = newSignals.length;
    process.stderr.write(`persisted: ${newCount} new of ${signals.length} to Turso\n`);
    if (newSignals.length) await emailDigest(newSignals);
    // Auto-queue a deep-dive per flagged filing that doesn't already have one
    // (deduped per accession; backfills anything surfaced before the queue). A
    // worker on the GPU box drains it; triage gates the cloud spend.
    const queued = await enqueueMissingRadarJobs();
    if (queued) process.stderr.write(`queued: ${queued} new deep-dive job(s)\n`);
  } else if (persist) {
    process.stderr.write('Turso not configured — printing only (set TURSO_DATABASE_URL to persist)\n');
  }

  for (const s of signals) {
    const cap = s.marketCap ? ` ${capLabel(s.marketCap)}` : '';
    process.stdout.write(
      `[${s.severity}] ${DIRECTION_MARK[s.direction] ?? ''} ${s.ticker}${cap} ${s.form} ${s.filingDate} · ${s.kind}\n  ${s.headline}\n`,
    );
  }
  const byKind = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  const kindMix = Object.entries(byKind)
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  process.stdout.write(`\n${signals.length} signals (${newCount} new)${kindMix ? ` — ${kindMix}\n` : '\n'}`);

  if (unfetchedDates.length) {
    // A missed trading day means missed filings — do NOT let it read as a quiet
    // day. Re-running is safe (signals dedup on key), so tell the operator to.
    process.stderr.write(
      `\n⚠ ${unfetchedDates.length} trading day(s) could not be fetched (likely SEC throttling): ` +
        `${unfetchedDates.join(', ')}\n  Re-run to catch them — already-seen signals are deduped.\n`,
    );
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
