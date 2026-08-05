#!/usr/bin/env tsx
/**
 * scripts/fetch-dram-price.ts
 *
 * Automation for the DRAM-memory-growth thesis's manual
 * `dram-spot-contract-price` watch-item: record this month's DRAM price
 * direction as a manual Event in data/manual-events.json (idempotent per
 * month), so the next `pnpm track` run evaluates it like any other event.
 *
 * Source chain, most reliable first:
 *   1. DXI month-over-month (numeric). dramexchange.com — a TrendForce
 *      property — server-renders the DXI spot index on its homepage every
 *      trading day. The ~30-day-ago baseline comes from the Wayback Machine,
 *      which captures the page every few days, so no local price history is
 *      needed and the comparison works from the very first run. After a
 *      successful read we ping Wayback's Save Page Now so future baselines
 *      keep existing even if third-party crawlers stop.
 *   2. TrendForce press center (headline direction). Their pricing articles
 *      carry the direction of the move in the title/lede; TrendForce only
 *      publishes them intermittently, which is why this is the fallback
 *      rather than the primary.
 *   3. Email a reminder to enter the print by hand (both sources down).
 *
 * Usage:
 *   pnpm tsx scripts/fetch-dram-price.ts [--days 40] [--dry-run]
 *
 * Env: AUTH_RESEND_KEY + EMAIL_FROM (mailer), SIGNAL_DIGEST_TO (recipient).
 */

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { isMailerConfigured, sendEmail } from '@stock-vetter/core';
import { parseDxi, cdxTimestamps, pickClosestSnapshot, momDirection } from '@stock-vetter/signals';

const LISTING_URL = 'https://www.trendforce.com/presscenter/news';
const PRICE_PAGE = 'https://www.trendforce.com/price/dram/dram_spot';
// Override in tests to exercise the fallback chain without network mocking.
const DXI_PAGE = process.env.DRAM_DXI_URL ?? 'https://www.dramexchange.com/';
const MANUAL_FILE = 'data/manual-events.json';
const THESIS_ID = 'DRAM-memory-growth';
const TICKER = 'MU';

// The Wayback baseline should be roughly a month old. Captures happen every
// few days, so accept anything 21-45 days back and prefer the one nearest 30.
const BASELINE_TARGET_DAYS = 30;
const BASELINE_MIN_DAYS = 21;
const BASELINE_MAX_DAYS = 45;

const UP = /increase|rising|rise|climb|surg|jump|record high|upgrad|hike|higher|strengthen|gain|rebound|uptrend|extend.*gains/i;
const DOWN = /declin|falling|\bfall\b|\bdrop|correction|soften|weaken|oversupply|glut|downgrad|lower|\bcut\b|slump|downtrend|pressure|erosion/i;

type ManualInput = {
  id: string;
  ticker: string;
  date: string;
  title: string;
  url?: string | null;
  payload?: Record<string, unknown>;
  note?: string;
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const DAYS = Number(arg('days', '40'));
const DRY = process.argv.includes('--dry-run');

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stock-vetter/1.0)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

// Pull dated press-center article links: /presscenter/news/YYYYMMDD-NNNNN.html
function articleLinks(listingHtml: string): { url: string; date: string }[] {
  const out = new Map<string, string>();
  for (const m of listingHtml.matchAll(/\/presscenter\/news\/(\d{8})-\d+\.html/g)) {
    const d = m[1]!;
    const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out.set(`https://www.trendforce.com${m[0]}`, iso);
  }
  return [...out.entries()]
    .map(([url, date]) => ({ url, date }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function metaTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return decode(og[1]!);
  const t = html.match(/<title>([^<]+)<\/title>/i);
  return t ? decode(t[1]!) : '';
}
function metaDesc(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  return og ? decode(og[1]!) : '';
}
function decode(s: string): string {
  return s
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDramPrice(text: string): boolean {
  return /\bDRAM\b/i.test(text) && /(contract|spot)\s+price|\bprice\b/i.test(text);
}
function inferDirection(text: string): 'up' | 'down' | 'unclear' {
  const up = (text.match(new RegExp(UP, 'gi')) ?? []).length;
  const down = (text.match(new RegExp(DOWN, 'gi')) ?? []).length;
  if (up > down) return 'up';
  if (down > up) return 'down';
  return 'unclear';
}

async function loadManual(): Promise<ManualInput[]> {
  try {
    return JSON.parse(await readFile(MANUAL_FILE, 'utf-8')) as ManualInput[];
  } catch {
    return [];
  }
}

async function reminderEmail(reason: string): Promise<void> {
  const to = process.env.SIGNAL_DIGEST_TO;
  if (!isMailerConfigured() || !to) {
    console.error(`[dram-price] would email a reminder but mailer/SIGNAL_DIGEST_TO not configured (${reason})`);
    return;
  }
  const subject = '⏰ Input this month’s DRAM contract price (auto-fetch failed)';
  const html =
    `<p>The DRAM price auto-fetch couldn’t determine this month’s move (${reason}).</p>` +
    `<p>Please read the latest figure and enter it by hand:</p>` +
    `<ol>` +
    `<li>Open <a href="${PRICE_PAGE}">TrendForce DRAM price trends</a> (or the latest <a href="${LISTING_URL}">press release</a>).</li>` +
    `<li>Add an entry to <code>data/manual-events.json</code> for thesis <b>${THESIS_ID}</b>:</li>` +
    `</ol>` +
    `<pre>{
  "id": "dram-price-${monthKey()}",
  "ticker": "MU",
  "date": "${today()}",
  "title": "DRAM contract price ${monthName()}: &lt;up/down X%&gt; MoM (TrendForce)",
  "url": "${PRICE_PAGE}",
  "payload": { "thesisId": "${THESIS_ID}", "direction": "&lt;up|down&gt;" },
  "note": "TrendForce monthly contract-price print"
}</pre>` +
    `<p>Then the next <code>pnpm track</code> run evaluates it automatically.</p>`;
  if (DRY) {
    console.error(`[dram-price] (dry-run) would email "${subject}" to ${to}`);
    return;
  }
  await sendEmail({ to, subject, html });
  console.error(`[dram-price] 📧 reminder emailed to ${to} (${reason})`);
}

function today(): string {
  return process.env.DRAM_TODAY ?? new Date().toISOString().slice(0, 10);
}
function monthKey(): string {
  return today().slice(0, 7);
}
function monthName(): string {
  const [y, m] = today().split('-');
  return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)]} ${y}`;
}
function daysAgo(n: number): string {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// A source either yields the month's event or explains why it couldn't.
type SourceResult = { event: ManualInput } | { reason: string };

/**
 * Source 1: DXI month-over-month. Current value from the dramexchange.com
 * homepage; ~30-day-ago baseline from the nearest Wayback Machine capture.
 */
async function tryDxi(id: string): Promise<SourceResult> {
  const current = parseDxi(await fetchText(DXI_PAGE));
  if (current == null) return { reason: 'DXI value not found on dramexchange.com homepage' };

  const from = daysAgo(BASELINE_MAX_DAYS).replace(/-/g, '');
  const to = daysAgo(BASELINE_MIN_DAYS).replace(/-/g, '');
  const target = daysAgo(BASELINE_TARGET_DAYS).replace(/-/g, '');
  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx?url=dramexchange.com&from=${from}&to=${to}` +
    `&output=json&fl=timestamp&filter=statuscode:200&collapse=timestamp:8`;
  const snapshots = cdxTimestamps(JSON.parse(await fetchText(cdxUrl, 30_000)));
  const ts = pickClosestSnapshot(snapshots, target);
  if (!ts) return { reason: `no Wayback capture of dramexchange.com in the last ${BASELINE_MIN_DAYS}-${BASELINE_MAX_DAYS} days` };

  const past = parseDxi(await fetchText(`https://web.archive.org/web/${ts}id_/${DXI_PAGE}`, 60_000));
  if (past == null) return { reason: `DXI value not found in Wayback capture ${ts}` };

  const mom = momDirection(current, past);
  if (!mom) return { reason: `unusable DXI baseline (current=${current}, past=${past})` };

  const pastDate = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  const pct = `${mom.pctChange >= 0 ? '+' : ''}${mom.pctChange.toFixed(1)}%`;
  return {
    event: {
      id,
      ticker: TICKER,
      date: today(),
      title: `DRAM price index (DXI) ${monthName()}: ${mom.direction} ${pct} MoM (${current.toFixed(1)} vs ${past.toFixed(1)} on ${pastDate}) (DRAMeXchange)`,
      url: DXI_PAGE,
      payload: {
        thesisId: THESIS_ID,
        direction: mom.direction,
        dxi: current,
        dxiBaseline: past,
        dxiBaselineDate: pastDate,
        pctChange: Number(mom.pctChange.toFixed(2)),
        source: 'dramexchange-dxi',
      },
      note: `DXI month-over-month, computed from the dramexchange.com homepage vs its Wayback capture of ${pastDate}`,
    },
  };
}

/**
 * Keep Wayback capturing dramexchange.com so a ~30-day-old baseline always
 * exists. Best-effort: anonymous Save Page Now, short timeout, errors ignored.
 */
async function pingWaybackSave(): Promise<void> {
  try {
    await fetch(`https://web.archive.org/save/${DXI_PAGE}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stock-vetter/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    console.error('[dram-price] pinged Wayback Save Page Now for the DXI page');
  } catch {
    // Purely opportunistic — third-party crawlers capture the page anyway.
  }
}

/** Source 2: direction inferred from a recent TrendForce pricing headline. */
async function tryPressCenter(id: string, existing: ManualInput[]): Promise<SourceResult> {
  let listing: string;
  try {
    listing = await fetchText(LISTING_URL);
  } catch (e) {
    return { reason: `press center unreachable: ${e instanceof Error ? e.message : e}` };
  }

  const cutoffIso = daysAgo(DAYS);
  const recent = articleLinks(listing).filter((a) => a.date >= cutoffIso);
  console.error(`[dram-price] ${recent.length} press articles in the last ${DAYS} days`);

  let found: { url: string; date: string; title: string; desc: string } | null = null;
  for (const a of recent.slice(0, 15)) {
    let html: string;
    try {
      html = await fetchText(a.url);
    } catch {
      continue;
    }
    const title = metaTitle(html);
    const desc = metaDesc(html);
    if (isDramPrice(`${title} ${desc}`)) {
      found = { ...a, title, desc };
      break;
    }
  }
  if (!found) return { reason: `no DRAM-pricing press release found in the last ${DAYS} days` };

  // The event id is keyed to the RUN month, but the lookback window spans
  // month boundaries — without this guard a late-July article recorded as
  // July's print would be recorded again as August's.
  if (existing.some((e) => e.url === found.url)) {
    return { reason: `latest pricing article already recorded in a prior month (${found.url})` };
  }

  const direction = inferDirection(`${found.title} ${found.desc}`);
  if (direction === 'unclear') {
    return { reason: `found an article but couldn’t infer direction: "${found.title.slice(0, 120)}"` };
  }
  return {
    event: {
      id,
      ticker: TICKER,
      date: today(),
      title: `DRAM contract/spot price — TrendForce: ${found.title.slice(0, 140)}`,
      url: found.url,
      payload: {
        thesisId: THESIS_ID,
        direction,
        headline: found.title,
        articleDate: found.date,
        source: 'trendforce-presscenter',
      },
      note: 'auto-scraped from TrendForce press center; direction inferred from headline',
    },
  };
}

async function main(): Promise<void> {
  // One print per month: skip everything (including network) once recorded.
  const id = `dram-price-${monthKey()}`;
  const events = await loadManual();
  if (events.some((e) => e.id === id)) {
    console.error(`[dram-price] event ${id} already present — nothing to do.`);
    return;
  }

  const reasons: string[] = [];
  let event: ManualInput | null = null;

  try {
    const r = await tryDxi(id);
    if ('event' in r) event = r.event;
    else reasons.push(`DXI: ${r.reason}`);
  } catch (e) {
    reasons.push(`DXI: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Whether or not the read succeeded, keep the capture cadence alive so next
  // month's baseline exists.
  if (!DRY) await pingWaybackSave();

  if (!event) {
    console.error(`[dram-price] DXI source failed (${reasons[reasons.length - 1]}); falling back to press center`);
    try {
      const r = await tryPressCenter(id, events);
      if ('event' in r) event = r.event;
      else reasons.push(`press: ${r.reason}`);
    } catch (e) {
      reasons.push(`press: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!event) {
    await reminderEmail(reasons.join('; '));
    return;
  }

  const direction = String(event.payload?.direction ?? 'unclear');
  console.error(`[dram-price] ✓ direction=${direction.toUpperCase()} — ${event.title.slice(0, 110)}`);
  if (DRY) {
    console.error('[dram-price] (dry-run) would append:\n' + JSON.stringify(event, null, 2));
    return;
  }
  events.push(event);
  await writeFile(MANUAL_FILE, JSON.stringify(events, null, 2) + '\n', 'utf-8');
  console.error(`[dram-price] appended ${id} to ${MANUAL_FILE}.`);
}

main().catch(async (e) => {
  // Never hard-fail the schedule; fall back to the reminder.
  await reminderEmail(`unexpected error: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
  console.error('[dram-price] FATAL:', e);
  process.exitCode = 0;
});
