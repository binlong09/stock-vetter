/**
 * EOD-price refresh — run by Vercel cron after market close.
 *
 * For every ticker in the `tickers` table, fetch the latest end-of-day price
 * from Yahoo and upsert into `quotes`. Per-ticker errors are caught and
 * reported in the response; one ticker failing doesn't stop the rest.
 *
 * Auth: Vercel cron passes `Authorization: Bearer <CRON_SECRET>`. Fails closed
 * if `CRON_SECRET` isn't set. Returns 200 with a {ok, failed} summary on
 * success — Vercel logs the response body, which is how you debug a bad run.
 *
 * Schedule lives in apps/web/vercel.json (`crons` array). Currently 22:00 UTC
 * Mon–Fri = ~18:00 ET, one hour after NYSE close to allow for late prints.
 */
import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { db } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface RouteResult {
  ok: number;
  failed: { ticker: string; reason: string }[];
  durationMs: number;
}

async function fetchEodPrice(ticker: string): Promise<{ price: number; asOf: string }> {
  // `quote()` returns the most recent price (intraday during market hours,
  // last close after). For an EOD job called after close, that's the close.
  // `regularMarketTime` is a Date object set to the last trade time.
  const q = await yahoo.quote(ticker);
  const price = q.regularMarketPrice;
  const timeRaw = q.regularMarketTime;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error(`no regularMarketPrice for ${ticker}`);
  }
  const time =
    timeRaw instanceof Date
      ? timeRaw
      : typeof timeRaw === 'number'
        ? new Date(timeRaw * 1000)
        : new Date();
  return { price, asOf: time.toISOString().slice(0, 10) };
}

async function refresh(): Promise<RouteResult> {
  const start = Date.now();
  const client = db();
  const tickersRes = await client.execute(`SELECT ticker FROM tickers ORDER BY ticker`);
  const tickers = tickersRes.rows.map((r) => String(r.ticker));

  const now = new Date().toISOString();
  const failed: RouteResult['failed'] = [];
  let ok = 0;
  for (const ticker of tickers) {
    try {
      const { price, asOf } = await fetchEodPrice(ticker);
      await client.execute({
        sql: `INSERT INTO quotes (ticker, price, as_of, fetched_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(ticker) DO UPDATE SET
                price = excluded.price,
                as_of = excluded.as_of,
                fetched_at = excluded.fetched_at`,
        args: [ticker, price, asOf, now],
      });
      ok += 1;
    } catch (e) {
      failed.push({ ticker, reason: (e as Error).message });
    }
  }
  return { ok, failed, durationMs: Date.now() - start };
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  try {
    const result = await refresh();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
