#!/usr/bin/env tsx
/**
 * scripts/fetch-dram-price.ts
 *
 * Best-effort automation for the DRAM-memory-growth thesis's manual
 * `dram-spot-contract-price` watch-item. TrendForce gates the actual price
 * NUMBERS behind paid membership and renders them client-side, so we can't
 * scrape the index value for free. What IS free and server-rendered is their
 * press center, whose article headlines carry the DIRECTION of the move — which
 * is exactly what a `weakens` tripwire needs (rolling over ⇒ exit).
 *
 * Flow:
 *   1. Scrape the TrendForce press center for a RECENT (default ≤40 days) article
 *      about DRAM contract/spot pricing.
 *   2. If found, infer direction (up/down/unclear) from the headline + lede and
 *      upsert a manual Event into data/manual-events.json (idempotent by month),
 *      so the next `pnpm track` run evaluates it like any other event.
 *   3. If nothing usable is found (no recent article, fetch failure, or an
 *      ambiguous headline), EMAIL a reminder to input the monthly print by hand.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-dram-price.ts [--days 40] [--dry-run]
 *
 * Env: AUTH_RESEND_KEY + EMAIL_FROM (mailer), SIGNAL_DIGEST_TO (recipient).
 */

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { isMailerConfigured, sendEmail } from '@stock-vetter/core';

const LISTING_URL = 'https://www.trendforce.com/presscenter/news';
const PRICE_PAGE = 'https://www.trendforce.com/price/dram/dram_spot';
const MANUAL_FILE = 'data/manual-events.json';
const THESIS_ID = 'DRAM-memory-growth';
const TICKER = 'MU';

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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stock-vetter/1.0)' },
    signal: AbortSignal.timeout(20_000),
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

async function main(): Promise<void> {
  let listing: string;
  try {
    listing = await fetchText(LISTING_URL);
  } catch (e) {
    await reminderEmail(`press center unreachable: ${e instanceof Error ? e.message : e}`);
    return;
  }

  const cutoff = new Date(today());
  cutoff.setDate(cutoff.getDate() - DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const recent = articleLinks(listing).filter((a) => a.date >= cutoffIso);
  console.error(`[dram-price] ${recent.length} press articles in the last ${DAYS} days`);

  // Find the most recent DRAM-pricing article.
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

  if (!found) {
    await reminderEmail(`no DRAM-pricing press release found in the last ${DAYS} days`);
    return;
  }

  const direction = inferDirection(`${found.title} ${found.desc}`);
  if (direction === 'unclear') {
    await reminderEmail(`found an article but couldn’t infer direction: "${found.title.slice(0, 120)}"`);
    return;
  }

  // Upsert a manual event, idempotent per month.
  const id = `dram-price-${found.date.slice(0, 7)}`;
  const events = await loadManual();
  if (events.some((e) => e.id === id)) {
    console.error(`[dram-price] event ${id} already present — nothing to do (direction=${direction}).`);
    return;
  }
  const event: ManualInput = {
    id,
    ticker: TICKER,
    date: found.date,
    title: `DRAM contract/spot price — TrendForce: ${found.title.slice(0, 140)}`,
    url: found.url,
    payload: { thesisId: THESIS_ID, direction, headline: found.title, source: 'trendforce-presscenter' },
    note: 'auto-scraped from TrendForce press center; direction inferred from headline',
  };
  console.error(`[dram-price] ✓ direction=${direction.toUpperCase()} — ${found.title.slice(0, 110)}`);
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
