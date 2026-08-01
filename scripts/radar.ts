#!/usr/bin/env tsx
/**
 * scripts/radar.ts
 *
 * The always-on "lite" radar: sweep the watchlist for deterministic short-side
 * signals (material 8-K items, XBRL trends/restatement/distress composites) with
 * no GPU and no model. New signals are persisted to Turso (deduped by key) so a
 * daily run surfaces each one once; the web viewer reads them.
 *
 *   pnpm radar                         # since yesterday (the daily cron mode)
 *   pnpm radar --days=30               # a wider backfill window
 *   pnpm radar --since=2026-07-01
 *   pnpm radar --no-persist            # compute + print only, don't touch Turso
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { computeRadarSignals, type WatchlistEntry } from '@stock-vetter/local';
import { isTursoConfigured, isMailerConfigured, sendEmail } from '@stock-vetter/core';
import { upsertRadarSignals } from '@stock-vetter/pipeline';
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Email the NEW signals so the radar can push you the delta rather than needing
// a page visit. No-op unless a recipient (RADAR_DIGEST_TO) and the shared Resend
// mailer are both configured — so it's silent for anyone who never set it up.
async function emailDigest(newSignals: RadarSignal[]): Promise<void> {
  const to = process.env.RADAR_DIGEST_TO;
  if (!to || !isMailerConfigured()) return;
  const base = (process.env.RADAR_BASE_URL ?? '').replace(/\/$/, '');
  const ordered = [...newSignals].sort((a, b) => SEV_ORDER[a.severity]! - SEV_ORDER[b.severity]!);
  const line = (s: RadarSignal): string => `[${s.severity}] ${s.ticker} ${s.form} (${s.filingDate}) — ${s.headline}`;
  const text =
    `${newSignals.length} new radar signal(s):\n\n${ordered.map(line).join('\n')}\n` +
    (base ? `\n${base}/radar\n` : '');
  const html =
    `<p>${newSignals.length} new radar signal(s):</p><ul>` +
    ordered
      .map((s) => `<li><b>[${s.severity}]</b> ${escapeHtml(s.ticker)} ${s.form} (${s.filingDate}) — ${escapeHtml(s.headline)}</li>`)
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

async function main(): Promise<void> {
  const wlPath = arg('watchlist') ?? 'data/watchlist.json';
  const raw = JSON.parse(await readFile(wlPath, 'utf-8')) as { tickers?: WatchlistEntry[] };
  const watchlist = raw.tickers ?? [];
  if (!watchlist.length) {
    process.stderr.write(`${wlPath} has no tickers. Build one with: pnpm build-watchlist TICKER...\n`);
    process.exit(1);
  }

  const days = Number(arg('days') ?? 1);
  const since = arg('since')
    ? new Date(`${arg('since')}T00:00:00Z`)
    : new Date(Date.now() - days * 86_400_000);
  const persist = arg('no-persist') == null;

  process.stderr.write(
    `radar: ${watchlist.length} tickers since ${since.toISOString().slice(0, 10)}\n`,
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
  } else if (persist) {
    process.stderr.write('Turso not configured — printing only (set TURSO_DATABASE_URL to persist)\n');
  }

  for (const s of signals) {
    process.stdout.write(`[${s.severity}] ${s.ticker} ${s.form} ${s.filingDate} · ${s.kind}\n  ${s.headline}\n`);
  }
  process.stdout.write(`\n${signals.length} signals (${newCount} new)\n`);

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
