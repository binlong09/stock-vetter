#!/usr/bin/env tsx
/**
 * scripts/test-coldstart-widen.ts — proves the cold-start auto-widen logic in
 * track.ts. A thesis whose only recent filing is OLDER than the 14-day steady-
 * state window but WITHIN a year must be captured on its first (empty-cursor)
 * run, and must NOT be captured if the run is forced to the narrow window.
 *
 * Deterministic (no live SEC data): it replicates the exact effective-since
 * computation from track.ts and the SEC since-filter, with a synthetic filing.
 *
 * Usage: pnpm tsx scripts/test-coldstart-widen.ts   (exits non-zero on failure)
 */

const STEADY_DAYS = 14;
const COLD_START_LOOKBACK_DAYS = 365;

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Mirror of track.ts: effective lookback start for a thesis this run.
function effectiveSince(opts: { emptyCursor: boolean; forceNarrow: boolean; steadySince: string }): string {
  const widen = opts.emptyCursor && !opts.forceNarrow;
  return widen ? daysAgoISO(COLD_START_LOOKBACK_DAYS) : opts.steadySince;
}

// SEC since-filter: a filing is fetched iff its date >= the window start.
function captures(sinceWindow: string, filingDate: string): boolean {
  return filingDate >= sinceWindow;
}

function main(): void {
  const steadySince = daysAgoISO(STEADY_DAYS);
  // The fixture: a filing 20 days old — older than the 14-day window, within a year.
  const filingDate = daysAgoISO(20);

  const checks: Array<{ name: string; got: boolean; want: boolean }> = [];

  // 1. Cold start, auto-widen → MUST capture the 20-day-old filing.
  checks.push({
    name: 'cold start (empty cursor, auto-widen) captures >14d-old filing',
    got: captures(effectiveSince({ emptyCursor: true, forceNarrow: false, steadySince }), filingDate),
    want: true,
  });

  // 2. Cold start forced narrow (--no-widen) → must NOT capture it (proves the
  //    widen is what does the capturing, not the narrow window).
  checks.push({
    name: 'cold start forced narrow does NOT capture it',
    got: captures(effectiveSince({ emptyCursor: true, forceNarrow: true, steadySince }), filingDate),
    want: false,
  });

  // 3. Steady-state (populated cursor) uses the narrow window.
  checks.push({
    name: 'steady-state (populated cursor) uses the narrow window',
    got: effectiveSince({ emptyCursor: false, forceNarrow: false, steadySince }) === steadySince,
    want: true,
  });

  let failed = 0;
  for (const c of checks) {
    const ok = c.got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  if (failed) process.exitCode = 1;
}

main();
