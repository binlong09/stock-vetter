// DXI (DRAMeXchange index) parsing and month-over-month direction.
//
// The DRAM-memory-growth thesis has a manual watch-item for the monthly DRAM
// price print. TrendForce gates its contract-price NUMBERS behind membership,
// but dramexchange.com (a TrendForce property) server-renders the DXI spot
// index on its homepage every trading day. The month-over-month move of that
// index is exactly the direction the `weakens` tripwire needs.
//
// The "one month ago" baseline comes from the Wayback Machine, which captures
// dramexchange.com every few days — so the comparison needs no local price
// history and works from the very first run. These helpers are pure so they
// can be tested against verbatim page fixtures; the network orchestration
// lives in scripts/fetch-dram-price.ts.

/**
 * Extract the DXI index value from dramexchange.com homepage HTML.
 *
 * The value-bearing anchor (`href="/Market/DXI">952611.90<img …dxi_up.gif…`)
 * is inside an HTML comment on the current site — the visible widget is an
 * image — but the server stamps the live value into the commented markup on
 * every render. Wayback rewrites hrefs in live markup yet leaves comments
 * untouched, so this one pattern matches both the live page and archived
 * captures. Returns null when no value-bearing anchor is present.
 */
export function parseDxi(html: string): number | null {
  const m = html.match(
    /href="[^"]*\/Market\/DXI[^"]*">\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*<img[^>]*dxi_(?:up|down|stable)/i,
  );
  if (!m) return null;
  const value = Number(m[1]!.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Timestamps from a Wayback CDX API JSON response (an array of rows, the
 * first being column headers). Tolerates both `fl=timestamp` single-column
 * responses and full multi-column rows; returns [] for anything malformed.
 */
export function cdxTimestamps(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  const rows = json as unknown[][];
  if (!rows.length || !Array.isArray(rows[0])) return [];
  const header = rows[0]!.map(String);
  const col = Math.max(header.indexOf('timestamp'), 0);
  return rows
    .slice(1)
    .map((r) => String((r as unknown[])[col] ?? ''))
    .filter((t) => /^\d{14}$/.test(t));
}

/** The capture timestamp closest to `target` (YYYYMMDD), or null if none. */
export function pickClosestSnapshot(timestamps: string[], target: string): string | null {
  const targetMs = Date.parse(
    `${target.slice(0, 4)}-${target.slice(4, 6)}-${target.slice(6, 8)}T12:00:00Z`,
  );
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const ts of timestamps) {
    const ms = Date.parse(
      `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`,
    );
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ts;
    }
  }
  return best;
}

/**
 * Month-over-month direction of the index. A flat print maps to `up` because
 * the tripwire this feeds fires on "turns DOWN month-over-month" — flat is
 * not a downturn. Returns null when the baseline is unusable.
 */
export function momDirection(
  current: number,
  past: number,
): { direction: 'up' | 'down'; pctChange: number } | null {
  if (!Number.isFinite(current) || !Number.isFinite(past) || past <= 0) return null;
  const pctChange = (current / past - 1) * 100;
  return { direction: pctChange < 0 ? 'down' : 'up', pctChange };
}
