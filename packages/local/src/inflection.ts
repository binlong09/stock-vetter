// Bullish XBRL detectors: buybacks and fundamental inflections.
//
// The radar's arithmetic tier was built to find deterioration, and every
// detector in `trends.ts` and `smallcap.ts` reads a series looking for the
// point where it turns down. These read the same series looking for the point
// where it turns UP, which at small-cap scale is where the asymmetry lives: a
// company that has lost money for eight quarters and just printed its first
// operating profit is repriced by that fact in a way a large cap never is,
// because the market was not modelling the turn.
//
// The bar is deliberately "first in N quarters" rather than "good number".
// A profitable company reporting another profitable quarter is not news and
// would surface every quarter forever; the TRANSITION is the event. That is
// the same principle the Altman gate uses in reverse, and for the same reason:
// a feed that reports standing conditions teaches its reader to ignore it.
//
// Everything here is arithmetic over filer-tagged XBRL. No model.

import { recentQuarters, type FactPoint, type SeriesSet } from '@stock-vetter/core';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type BullishFinding = {
  id: 'buyback' | 'operating-profit-turn' | 'fcf-turn' | 'revenue-acceleration';
  /** Signal kind this maps to on the radar. */
  kind: 'buyback' | 'inflection';
  period: string;
  severity: Severity;
  headline: string;
  detail: string;
};

/**
 * Revenue floor for the inflection detectors. Below this a "turn to
 * profitability" is arithmetic on noise — a shell going from -$80k to +$40k is
 * not a business inflecting, and a $50k → $500k revenue line is +900% growth
 * that means nothing.
 */
const MIN_MEANINGFUL_REVENUE = 1e6;

function pct(x: number): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
}

function millions(x: number): string {
  return `${(x / 1e6).toFixed(1)}M`;
}

/** Consecutive points at the END of `points` (excluding the last) that are ≤ 0. */
function priorLossRun(points: FactPoint[]): number {
  let n = 0;
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i]!.value <= 0) n++;
    else break;
  }
  return n;
}

/**
 * Share-count CONTRACTION — a buyback, and the mirror of `detectDilution`.
 *
 * THE REVERSE-SPLIT TRAP. A 1-for-10 reverse split cuts the share count by 90%
 * and is one of the most bearish events a small cap has: it is what a company
 * does to keep a sub-$1 stock listed. Read naively, it is by far the largest
 * "buyback" this detector would ever see, and it would be reported as the
 * loudest bullish signal on the feed. Anything past a 30% single-quarter drop
 * is therefore rejected as a split rather than a repurchase — the 8-K Item
 * 5.03 detector is what covers that event, in the correct direction.
 */
export function detectBuyback(set: SeriesSet, opts: { asOf?: string } = {}): BullishFinding | null {
  const points = recentQuarters(set.byConcept.get('dilutedShares'), 5, opts.asOf);
  if (points.length < 2) return null;

  const latest = points.at(-1)!;
  const prior = points.at(-2)!;
  const yearAgo = points.length >= 5 ? points.at(-5)! : null;
  if (!(prior.value > 0) || !(latest.value > 0)) return null;

  const qoq = latest.value / prior.value - 1;
  const yoy = yearAgo && yearAgo.value > 0 ? latest.value / yearAgo.value - 1 : null;

  // See the doc comment: a drop this large is a reverse split or a units
  // re-tag, never a repurchase.
  if (qoq <= -0.3 || (yoy != null && yoy <= -0.4)) return null;

  let severity: Severity | null = null;
  if (qoq <= -0.05 || (yoy != null && yoy <= -0.1)) severity = 'critical';
  else if (qoq <= -0.02 || (yoy != null && yoy <= -0.05)) severity = 'high';
  else if (yoy != null && yoy <= -0.02) severity = 'medium';
  if (!severity) return null;

  const parts = [`${pct(qoq)} QoQ`];
  if (yoy != null) parts.push(`${pct(yoy)} YoY`);

  return {
    id: 'buyback',
    kind: 'buyback',
    period: latest.period,
    severity,
    headline:
      `Share count shrinking — ${parts.join(', ')} to ${millions(latest.value)} shares ` +
      `as of ${latest.period}`,
    detail:
      `weighted-average diluted shares: ${points.map((p) => `${p.period}=${millions(p.value)}`).join(' → ')}. ` +
      `A small cap retiring stock is both cash-generative and telling you where management thinks the price is. ` +
      `Checked against a reverse split, which shrinks the count far faster and means the opposite.`,
  };
}

/**
 * First operating profit after a run of losses.
 *
 * Severity scales with the length of the run it ends, because that is what
 * makes it surprising: a company that lost money for six straight quarters is
 * one the market has stopped underwriting a turn for.
 */
export function detectProfitabilityTurn(
  set: SeriesSet,
  opts: { asOf?: string } = {},
): BullishFinding | null {
  const points = recentQuarters(set.byConcept.get('operatingIncome'), 9, opts.asOf);
  if (points.length < 3) return null;
  const latest = points.at(-1)!;
  if (!(latest.value > 0)) return null;

  const run = priorLossRun(points);
  if (run < 2) return null;

  const revenue = recentQuarters(set.byConcept.get('revenue'), 1, opts.asOf).at(-1);
  if (!revenue || revenue.value < MIN_MEANINGFUL_REVENUE) return null;

  return {
    id: 'operating-profit-turn',
    kind: 'inflection',
    period: latest.period,
    severity: run >= 4 ? 'critical' : 'high',
    headline:
      `First operating profit in ${run + 1} quarters — $${millions(latest.value)} in ${latest.period} ` +
      `after ${run} consecutive loss-making quarter${run === 1 ? '' : 's'}`,
    detail:
      `operating income: ${points.map((p) => `${p.period}=$${millions(p.value)}`).join(' → ')}. ` +
      `Revenue $${millions(revenue.value)} in the latest quarter.`,
  };
}

/** First positive free cash flow after a run of burn. */
export function detectFcfTurn(set: SeriesSet, opts: { asOf?: string } = {}): BullishFinding | null {
  const cfo = recentQuarters(set.byConcept.get('cfo'), 9, opts.asOf);
  if (cfo.length < 3) return null;
  const capexByPeriod = new Map(
    recentQuarters(set.byConcept.get('capex'), 9, opts.asOf).map((p) => [p.period, p.value]),
  );
  // Capex is tagged as a positive outflow; a filer signing it negative would
  // otherwise read as cash coming in.
  const fcf: FactPoint[] = cfo.map((p) => ({
    ...p,
    value: p.value - Math.abs(capexByPeriod.get(p.period) ?? 0),
  }));

  const latest = fcf.at(-1)!;
  if (!(latest.value > 0)) return null;
  const run = priorLossRun(fcf);
  if (run < 2) return null;

  const revenue = recentQuarters(set.byConcept.get('revenue'), 1, opts.asOf).at(-1);
  if (!revenue || revenue.value < MIN_MEANINGFUL_REVENUE) return null;

  return {
    id: 'fcf-turn',
    kind: 'inflection',
    period: latest.period,
    severity: run >= 4 ? 'critical' : 'high',
    headline:
      `First positive free cash flow in ${run + 1} quarters — $${millions(latest.value)} in ${latest.period}`,
    detail:
      `CFO less capex: ${fcf.map((p) => `${p.period}=$${millions(p.value)}`).join(' → ')}. ` +
      `A company that stops burning stops needing to raise, which removes the dilution overhang ` +
      `that prices most small caps at this size.`,
  };
}

/**
 * Revenue growth ACCELERATING, year-over-year against year-over-year.
 *
 * Year-over-year on both legs is not optional — a sequential comparison would
 * report every seasonal business as accelerating once a year, every year. What
 * this looks for is the second derivative: this quarter grew faster than last
 * quarter did against its own comparable.
 */
export function detectRevenueAcceleration(
  set: SeriesSet,
  opts: { asOf?: string } = {},
): BullishFinding | null {
  const points = recentQuarters(set.byConcept.get('revenue'), 6, opts.asOf);
  if (points.length < 6) return null;

  const [t5, t4, , , t1, t0] = points as [FactPoint, FactPoint, FactPoint, FactPoint, FactPoint, FactPoint];
  // t0 vs its year-ago quarter (t4 back), t1 vs its own (t5 back).
  if (t4.value < MIN_MEANINGFUL_REVENUE || t5.value <= 0) return null;

  const g0 = t0.value / t4.value - 1;
  const g1 = t1.value / t5.value - 1;
  const delta = g0 - g1;

  let severity: Severity | null = null;
  if (g0 >= 0.5 && delta >= 0.2) severity = 'critical';
  else if (g0 >= 0.25 && delta >= 0.1) severity = 'high';
  if (!severity) return null;

  return {
    id: 'revenue-acceleration',
    kind: 'inflection',
    period: t0.period,
    severity,
    headline:
      `Revenue growth accelerating — ${pct(g0)} YoY in ${t0.period}, up from ${pct(g1)} the quarter before`,
    detail:
      `revenue: ${points.map((p) => `${p.period}=$${millions(p.value)}`).join(' → ')}. ` +
      `Both legs are year-over-year, so this is acceleration rather than seasonality.`,
  };
}

/** Every bullish XBRL finding for one company, in one call. */
export function detectBullishInflections(
  set: SeriesSet,
  opts: { asOf?: string } = {},
): BullishFinding[] {
  return [
    detectBuyback(set, opts),
    detectProfitabilityTurn(set, opts),
    detectFcfTurn(set, opts),
    detectRevenueAcceleration(set, opts),
  ].filter((f): f is BullishFinding => f != null);
}
