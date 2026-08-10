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
 * The focus list is manual entries (`data/focus-list.json`) plus every ticker
 * a deep-dive flagged `mispriced-long` in the last ~two quarters (auto-focus;
 * see loadFocusList). Focus signals sort first and get their own digest
 * section. Queueing: loud non-earnings signals queue for the whole universe
 * (discovery); routine earnings releases (promoted Item 2.02) queue only for
 * focus names — so each live long thesis is re-underwritten quarterly while
 * earnings season stays affordable.
 *
 *   pnpm radar                         # since yesterday (the daily cron mode)
 *   pnpm radar --days=30               # a wider backfill window
 *   pnpm radar --since=2026-07-01
 *   pnpm radar --direction=bullish     # green flags only (buying opportunities)
 *   pnpm radar --focus-only            # only the names you already know
 *   pnpm radar --watchlist=data/watchlist.json   # the old large-cap list
 *   pnpm radar --no-persist            # compute + print only, don't touch Turso
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { computeRadarSignals, capTier, type WatchlistEntry } from '@stock-vetter/local';
import { isTursoConfigured, isMailerConfigured, sendEmail, listFilings } from '@stock-vetter/core';
import {
  upsertRadarSignals,
  upsertRadarCompanies,
  enqueueMissingRadarJobs,
  enqueueRadarJobs,
  findBullishConfluence,
  listAutoFocusTickers,
  insiderStore,
} from '@stock-vetter/pipeline';
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
const FOCUS_LIST = 'data/focus-list.json';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DIRECTION_MARK: Record<string, string> = { bearish: '▼', bullish: '▲', ambiguous: '◆' };

function capLabel(marketCap: number | null): string {
  if (marketCap == null) return '';
  return marketCap >= 1e9 ? `$${(marketCap / 1e9).toFixed(2)}B` : `$${(marketCap / 1e6).toFixed(0)}M`;
}

const bySeverity = (a: RadarSignal, b: RadarSignal): number =>
  SEV_ORDER[a.severity]! - SEV_ORDER[b.severity]!;

/**
 * Email the NEW signals so the radar can push you the delta rather than
 * needing a page visit. No-op unless a recipient (RADAR_DIGEST_TO) and the
 * shared Resend mailer are both configured.
 *
 * FOCUS FIRST, and visually separated. Once the watchlist is a few hundred
 * names, a flat digest is a wall — the two or three lines you can act on today
 * sit between forty you can't, and the reader stops opening it. Splitting on
 * focus is what keeps the discovery half from destroying the actionable half.
 */
async function emailDigest(newSignals: RadarSignal[]): Promise<void> {
  const to = process.env.RADAR_DIGEST_TO;
  if (!to || !isMailerConfigured()) return;
  const base = (process.env.RADAR_BASE_URL ?? '').replace(/\/$/, '');
  const focus = newSignals.filter((s) => s.focus).sort(bySeverity);
  const universe = newSignals.filter((s) => !s.focus).sort(bySeverity);

  const tag = (s: RadarSignal): string =>
    `${DIRECTION_MARK[s.direction] ?? ''} ${s.ticker}${s.marketCap ? ` (${capLabel(s.marketCap)})` : ''}`;
  const line = (s: RadarSignal): string =>
    `[${s.severity}]${tag(s)} ${s.form} (${s.filingDate}) — ${s.headline}`;
  const htmlLine = (s: RadarSignal): string =>
    `<li><b>[${s.severity}]</b> ${DIRECTION_MARK[s.direction] ?? ''} ${escapeHtml(s.ticker)}` +
    `${s.marketCap ? ` <span style="color:#94a3b8">${capLabel(s.marketCap)}</span>` : ''} ` +
    `${s.form} (${s.filingDate}) — ${escapeHtml(s.headline)}</li>`;

  const textSection = (title: string, rows: RadarSignal[]): string =>
    rows.length ? `\n${title}\n${'─'.repeat(title.length)}\n${rows.map(line).join('\n')}\n` : '';
  const htmlSection = (title: string, rows: RadarSignal[]): string =>
    rows.length ? `<h3 style="margin:16px 0 4px">${title}</h3><ul>${rows.map(htmlLine).join('')}</ul>` : '';

  const text =
    `${newSignals.length} new radar signal(s).\n` +
    textSection(`FOCUS (${focus.length}) — act on these`, focus) +
    textSection(`UNIVERSE (${universe.length}) — discovery, review weekly`, universe) +
    (base ? `\n${base}/radar\n` : '');
  const html =
    `<p>${newSignals.length} new radar signal(s):</p>` +
    htmlSection(`Focus (${focus.length}) — act on these`, focus) +
    htmlSection(`Universe (${universe.length}) — discovery, review weekly`, universe) +
    (base ? `<p><a href="${base}/radar">Open the radar →</a></p>` : '');

  // Subject leads with the focus count when there is one: that is the number
  // that decides whether this email needs opening now or at the weekend.
  const top = (focus[0] ?? universe[0])!;
  const subject = focus.length
    ? `Radar: ${focus.length} focus signal${focus.length > 1 ? 's' : ''} — ${focus[0]!.ticker}` +
      (universe.length ? ` (+${universe.length} universe)` : '')
    : `Radar: ${newSignals.length} new signal${newSignals.length > 1 ? 's' : ''}` +
      (top ? ` — ${top.ticker}${newSignals.length > 1 ? ' +' : ''}` : '');
  const ok = await sendEmail({ to, subject, text, html });
  process.stderr.write(ok ? `emailed digest to ${to}\n` : 'digest email failed\n');
}

const VALID_DIRECTIONS = ['bearish', 'bullish', 'ambiguous'];

type View = { direction: string | null; focusOnly: boolean };

/**
 * Parse and validate the view filters. Called BEFORE the sweep: a typo'd
 * `--direction` should cost you a second, not the several minutes of EDGAR
 * traffic it would take to reach the point where the filter is applied.
 */
function parseView(): View {
  const raw = arg('direction');
  const direction = raw && raw !== 'true' ? raw.toLowerCase() : null;
  if (direction && !VALID_DIRECTIONS.includes(direction)) {
    process.stderr.write(
      `--direction must be one of ${VALID_DIRECTIONS.join(' | ')} (got "${direction}")\n`,
    );
    process.exit(1);
  }
  return { direction, focusOnly: arg('focus-only') != null };
}

/**
 * Which of the swept signals you actually want to look at.
 *
 * `--direction=bullish` is the green-flags-only mode — the buying-opportunity
 * view. Note that it hides the warnings too, which is exactly what you asked
 * for and also the reason not to leave it on permanently: a shelf takedown on
 * a name you were about to buy is the most useful thing the radar can tell you
 * that day. Views never affect what gets persisted.
 */
function applyView(signals: RadarSignal[], view: View): RadarSignal[] {
  return signals.filter(
    (s) => (!view.direction || s.direction === view.direction) && (!view.focusOnly || s.focus),
  );
}

/**
 * The focus list: manual entries ∪ names the deep-dive itself flagged.
 *
 * Manual (`data/focus-list.json`) is for names whose story you already know.
 * The AUTO half is the discovery loop closing: when a deep-dive returns
 * `mispriced-long`, that ticker is promoted here automatically — its signals
 * sort first, get their own digest section, and its earnings reports keep
 * being deep-dived, so every live long thesis is re-underwritten quarterly
 * without anyone curating a list. This is what makes a several-hundred-name
 * universe of companies you've never heard of usable: focus membership is
 * earned by a verdict, not assumed by familiarity.
 *
 * Tune with RADAR_AUTO_FOCUS_DAYS (default 180 — a thesis ages out after two
 * quarters without re-confirmation), RADAR_AUTO_FOCUS_MIN_CONVICTION
 * (default 0), or RADAR_AUTO_FOCUS=0 to disable the auto half entirely.
 * Missing file and unconfigured Turso are both fine — each half degrades to
 * empty independently.
 */
async function loadFocusList(): Promise<{ manual: Set<string>; auto: Set<string> }> {
  let manual = new Set<string>();
  try {
    const raw = JSON.parse(await readFile(FOCUS_LIST, 'utf-8')) as { tickers?: string[] };
    manual = new Set((raw.tickers ?? []).map((t) => t.toUpperCase()));
  } catch {
    // No file yet — the normal state.
  }
  let auto = new Set<string>();
  if (process.env.RADAR_AUTO_FOCUS !== '0' && isTursoConfigured()) {
    try {
      const tickers = await listAutoFocusTickers({
        sinceDays: Number(process.env.RADAR_AUTO_FOCUS_DAYS ?? 180),
        minConviction: Number(process.env.RADAR_AUTO_FOCUS_MIN_CONVICTION ?? 0),
      });
      auto = new Set(tickers.map((t) => t.toUpperCase()));
    } catch (e) {
      // A Turso blip shouldn't kill the sweep; it just means auto-focus is
      // stale for one run. Say so rather than silently shrinking the list.
      process.stderr.write(`⚠ auto-focus lookup failed (${(e as Error).message}) — using manual list only\n`);
    }
  }
  return { manual, auto };
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
  // Validate the view flags before spending a sweep on them.
  const view = parseView();
  const wlPath = await resolveWatchlistPath();
  const raw = JSON.parse(await readFile(wlPath, 'utf-8')) as { tickers?: WatchlistEntry[] };
  const { manual, auto } = await loadFocusList();
  const focusTickers = new Set([...manual, ...auto]);
  const watchlist = (raw.tickers ?? []).map((w) => ({
    ...w,
    focus: focusTickers.has(w.ticker.toUpperCase()),
  }));
  if (!watchlist.length) {
    process.stderr.write(`${wlPath} has no tickers. Build one with: pnpm build-smallcap\n`);
    process.exit(1);
  }
  const onFocus = watchlist.filter((w) => w.focus).length;
  if (auto.size) {
    process.stderr.write(`auto-focus: ${[...auto].join(', ')} (mispriced-long verdicts)\n`);
  }
  // A manual focus entry naming a ticker that isn't in the universe is a
  // silent mistake — you'd never get an alert and nothing would say why.
  // Auto entries are exempt: they came FROM the watchlist, and one that has
  // since dropped out (cap drifted, liquidity fell) is churn, not a typo.
  const missing = [...manual].filter(
    (t) => !watchlist.some((w) => w.ticker.toUpperCase() === t),
  );
  if (missing.length) {
    process.stderr.write(
      `⚠ ${missing.length} focus ticker(s) not in ${wlPath}: ${missing.join(', ')}\n` +
        `  They will never produce a signal. Add them to the watchlist (pnpm build-smallcap --pin=${missing.join(',')}).\n`,
    );
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
    `radar: ${watchlist.length} tickers from ${wlPath} (${mix}; ${onFocus} on the focus list) ` +
      `since ${since.toISOString().slice(0, 10)}\n`,
  );
  const until = arg('until') ? new Date(`${arg('until')}T23:59:59Z`) : undefined;
  const { signals, unfetchedDates } = await computeRadarSignals(watchlist, {
    since,
    until,
    onProgress: (m) => process.stderr.write(`  ${m}\n`),
    // The insider detector needs a window wider than one sweep to see a
    // cluster; Turso is where that window lives. Without it the detector
    // still runs, it just can't look back past `since`.
    insiderStore: isTursoConfigured() ? insiderStore : undefined,
    insiderWindowDays: Number(arg('insider-window') ?? 14),
  });
  signals.sort(
    (a, b) =>
      // Focus first: the whole point of the list is that those rows are read
      // and the rest are skimmed.
      Number(b.focus) - Number(a.focus) ||
      SEV_ORDER[a.severity]! - SEV_ORDER[b.severity]! ||
      a.ticker.localeCompare(b.ticker),
  );

  let newCount = signals.length;
  if (persist && isTursoConfigured()) {
    // Persist EVERYTHING, regardless of the view filters. A
    // `--direction=bullish` run is a different VIEW of one sweep, not a
    // different sweep: dropping the bearish rows at write time would leave
    // permanent holes that no later run can backfill, because the filing
    // window will have moved on. Filters apply to what you read, never to
    // what is stored.
    const newSignals = await upsertRadarSignals(signals);
    newCount = newSignals.length;
    process.stderr.write(`persisted: ${newCount} new of ${signals.length} to Turso\n`);
    // Company identity for the feed: full name + short description per ticker,
    // so a reader who has never heard of the registrant doesn't have to leave
    // the page to learn what it is. Descriptions come from the watchlist
    // build; until it's rebuilt with them, the SIC industry label stands in.
    await upsertRadarCompanies(
      watchlist
        .filter((w) => w.cik)
        .map((w) => ({
          cik: w.cik,
          ticker: w.ticker.toUpperCase(),
          name: w.name || w.ticker.toUpperCase(),
          description:
            w.description ??
            (w.sicDescription
              ? `${w.sicDescription}${w.sector ? ` · ${w.sector}` : ''}`
              : null),
        })),
    );
    const digestable = applyView(newSignals, view);
    if (digestable.length) await emailDigest(digestable);
    // Auto-queue a deep-dive per flagged filing that doesn't already have one
    // (deduped per accession; backfills anything surfaced before the queue). A
    // worker on the GPU box drains it; triage gates the cloud spend.
    // Queue gating moved into the SQL itself: loud non-earnings signals queue
    // for the whole universe (discovery), earnings releases only for focus
    // names. See enqueueMissingRadarJobs for the full rationale.
    const queued = await enqueueMissingRadarJobs();
    if (queued) process.stderr.write(`queued: ${queued} new deep-dive job(s)\n`);

    // Bullish confluence (D): ≥2 independent green-flag kinds on one name in
    // 30 days becomes its own critical signal — insiders buying while
    // fundamentals inflect is a different fact than either alone.
    const confluences = await findBullishConfluence();
    const compositeSignals: RadarSignal[] = confluences.map((c) => ({
      key: `${c.latestAccession}:bullish-composite`,
      ticker: c.ticker,
      cik: c.cik,
      accession: c.latestAccession,
      form: c.latestForm,
      filingDate: c.latestFilingDate,
      kind: 'bullish-composite' as const,
      severity: 'critical' as const,
      direction: 'bullish' as const,
      headline: `Bullish confluence: ${c.kinds.join(' + ')} within 30 days`,
      detail:
        `Independent bullish signals of ${c.kinds.length} kinds (${c.kinds.join(', ')}) ` +
        `landed on ${c.ticker} inside a 30-day window. Each alone is a lead; together they corroborate.`,
      marketCap: watchlist.find((w) => w.ticker.toUpperCase() === c.ticker)?.marketCap ?? null,
      focus: focusTickers.has(c.ticker),
    }));
    const newComposites = compositeSignals.length ? await upsertRadarSignals(compositeSignals) : [];
    for (const s of newComposites) process.stderr.write(`confluence: ${s.ticker} — ${s.headline}\n`);

    // Bullish deep-dives (B): insider-buy, uplisting, and confluence signals
    // point at documents the box can't parse (Form 4s, 8-A12Bs), so instead
    // of queueing those, queue the company's latest periodic filing — the
    // question "insiders just bet six figures; what do the fundamentals say?"
    // is answered by the 10-Q, not the Form 4. Off switch: RADAR_BULLISH_DEEPDIVE=0
    // or --no-bullish-deepdive. Capped per sweep so a busy Form 4 day can't
    // flood the queue; each queued job costs one synthesis (~$0.22).
    const bullishDeepdive =
      arg('no-bullish-deepdive') == null && process.env.RADAR_BULLISH_DEEPDIVE !== '0';
    if (bullishDeepdive) {
      const triggerKinds = new Set(['insider-buy', 'uplisting', 'bullish-composite']);
      const triggerTickers = [
        ...new Set(
          [...newSignals, ...newComposites].filter((s) => triggerKinds.has(s.kind)).map((s) => s.ticker),
        ),
      ].slice(0, 5);
      for (const ticker of triggerTickers) {
        try {
          const refs = await listFilings(ticker, { forms: ['10-Q', '10-K'] });
          const latest = refs.sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0];
          if (!latest) continue;
          const n = await enqueueRadarJobs([
            { accession: latest.accession, ticker, form: latest.form, filingDate: latest.filingDate },
          ]);
          if (n) {
            process.stderr.write(
              `bullish deep-dive: queued ${ticker} ${latest.form} ${latest.accession} (green-flag trigger)\n`,
            );
          }
        } catch (e) {
          process.stderr.write(`bullish deep-dive: ${ticker} lookup failed (${(e as Error).message.slice(0, 80)})\n`);
        }
      }
    }
  } else if (persist) {
    process.stderr.write('Turso not configured — printing only (set TURSO_DATABASE_URL to persist)\n');
  }

  const visible = applyView(signals, view);
  for (const s of visible) {
    const cap = s.marketCap ? ` ${capLabel(s.marketCap)}` : '';
    process.stdout.write(
      `[${s.severity}] ${DIRECTION_MARK[s.direction] ?? ''} ${s.focus ? '★ ' : ''}${s.ticker}${cap} ` +
        `${s.form} ${s.filingDate} · ${s.kind}\n  ${s.headline}\n`,
    );
  }
  const byKind = visible.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  const kindMix = Object.entries(byKind)
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  const hidden = signals.length - visible.length;
  process.stdout.write(
    `\n${visible.length} signals (${newCount} new${hidden ? `, ${hidden} hidden by filters` : ''})` +
      `${kindMix ? ` — ${kindMix}\n` : '\n'}`,
  );

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
