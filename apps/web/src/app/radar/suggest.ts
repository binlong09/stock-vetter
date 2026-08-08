// Ticker autosuggest for the radar feed.
//
// Deliberately dependency-free — the only import is a type, which is erased at
// runtime. That keeps the matching rules unit-testable without dragging React,
// `next/link`, or the server-only query layer into the test process, and it is
// why this lives beside the component rather than inside it.

import type { RadarRow } from '@/radar-queries';

export type Suggestion = {
  ticker: string;
  /** How many signals this ticker has in the current view. */
  count: number;
  marketCap: number | null;
  focus: boolean;
};

/**
 * Tickers matching `query`, prefix matches first.
 *
 * Prefix-before-substring is what makes typing feel right: "TB" should offer
 * TBLA and TBCH before a ticker that merely contains those letters. Within
 * each tier the order is by signal count, so the noisiest name — the one most
 * likely being searched for — is what the arrow keys land on first.
 */
export function suggest(rows: RadarRow[], query: string, limit = 8): Suggestion[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const byTicker = new Map<string, Suggestion>();
  for (const r of rows) {
    const t = r.ticker.toUpperCase();
    if (!t.includes(q)) continue;
    const cur = byTicker.get(t);
    if (cur) {
      cur.count += 1;
      cur.focus = cur.focus || r.focus;
    } else {
      byTicker.set(t, { ticker: t, count: 1, marketCap: r.marketCap, focus: r.focus });
    }
  }
  return [...byTicker.values()]
    .sort((a, b) => {
      const ap = a.ticker.startsWith(q) ? 0 : 1;
      const bp = b.ticker.startsWith(q) ? 0 : 1;
      return ap - bp || b.count - a.count || a.ticker.localeCompare(b.ticker);
    })
    .slice(0, limit);
}

/** Rows whose ticker contains `query`. Empty query means no filtering. */
export function filterByTicker(rows: RadarRow[], query: string): RadarRow[] {
  const q = query.trim().toUpperCase();
  if (!q) return rows;
  return rows.filter((r) => r.ticker.toUpperCase().includes(q));
}
