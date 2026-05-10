// Reverse DCF — given current price and starting FCF, solve for the 10-year
// FCF CAGR the market is implicitly pricing in across a grid of discount
// rate × terminal multiple assumptions. The user reads the grid and asks
// "is the implied growth rate plausible given the business?"
//
// This is a teaching module, not a valuation. The tool does not say "META
// is worth $X" — it says "at $610, here's what the market is assuming, and
// here's what META has actually delivered." The user judges.

import type { FinancialSnapshot, ReverseDcfCell, ReverseDcfReport } from '@stock-vetter/schema';

// Grid: 9 cells covering plausible value-investing assumptions.
//   - Discount rate: 8% (low-risk equity), 10% (typical), 12% (higher risk).
//   - Terminal multiple on year-10 FCF: 15× (cheap, mature business), 20× (typical),
//     25× (premium quality / continued growth).
const DISCOUNT_RATES = [0.08, 0.10, 0.12];
const TERMINAL_MULTIPLES = [15, 20, 25];

// Two-stage DCF: 10 years of FCF growing at `g`, then terminal value =
// year-10 FCF × terminal multiple, all discounted to present.
function dcfPresentValue(
  fcf0: number,
  g: number,
  discountRate: number,
  terminalMultiple: number,
  years = 10,
): number {
  let pv = 0;
  let fcf = fcf0;
  for (let t = 1; t <= years; t++) {
    fcf = fcf * (1 + g);
    pv += fcf / Math.pow(1 + discountRate, t);
  }
  const terminalValue = fcf * terminalMultiple;
  pv += terminalValue / Math.pow(1 + discountRate, years);
  return pv;
}

// Solve for `g` such that dcfPresentValue(fcf0, g, ...) = targetEnterpriseValue.
// Bisection search over [-10%, +50%] CAGR. Returns null if no g in range works.
function solveImpliedGrowth(
  targetEv: number,
  fcf0: number,
  discountRate: number,
  terminalMultiple: number,
): number | null {
  if (fcf0 <= 0 || targetEv <= 0) return null;
  let lo = -0.10;
  let hi = 0.50;
  // Boundary check: if even +50% CAGR can't reach the target, return null.
  // Likewise if -10% gives a value above target (price implies negative growth
  // beyond what we model).
  const valHi = dcfPresentValue(fcf0, hi, discountRate, terminalMultiple);
  const valLo = dcfPresentValue(fcf0, lo, discountRate, terminalMultiple);
  if (targetEv > valHi) return null;
  if (targetEv < valLo) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const val = dcfPresentValue(fcf0, mid, discountRate, terminalMultiple);
    if (Math.abs(val - targetEv) / targetEv < 0.001) return mid;
    if (val < targetEv) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function computeFcfCagr(
  fcfStart: number,
  fcfEnd: number,
  years: number,
): number | null {
  if (fcfStart <= 0 || fcfEnd <= 0 || years <= 0) return null;
  return Math.pow(fcfEnd / fcfStart, 1 / years) - 1;
}

function buildNarrative(
  report: Omit<ReverseDcfReport, 'narrative'>,
): string {
  const lines: string[] = [];
  const priceFmt = report.currentPrice.toFixed(2);
  const fcfFmt = (report.startingFcfMillions / 1000).toFixed(1);
  lines.push(`At a current price of $${priceFmt} per share and trailing FCF of $${fcfFmt}B, the reverse DCF asks: what 10-year FCF growth rate would justify this price under various assumptions?`);
  lines.push('');

  // Pick a "central" cell for the narrative anchor: 10% discount, 20× terminal.
  const central = report.grid.find(
    (c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20,
  );
  if (central?.impliedFcfCagr != null) {
    const pct = (central.impliedFcfCagr * 100).toFixed(1);
    lines.push(`Under the central assumptions (10% discount rate, 20× terminal P/FCF), the market is pricing in approximately ${pct}% annual FCF growth for 10 years.`);
  }

  // Compare to actual delivered.
  const actual3 = report.actualFcfCagr3y;
  const actual5 = report.actualFcfCagr5y;
  if (actual3 != null || actual5 != null) {
    const parts: string[] = [];
    if (actual5 != null) parts.push(`${(actual5 * 100).toFixed(1)}% over the past 5 years`);
    if (actual3 != null) parts.push(`${(actual3 * 100).toFixed(1)}% over the past 3 years`);
    lines.push(`For comparison, actual FCF CAGR has been ${parts.join(' and ')}.`);
  }

  // Plausibility framing.
  if (central?.impliedFcfCagr != null) {
    const implied = central.impliedFcfCagr;
    const ref = actual5 ?? actual3;
    if (ref != null) {
      if (implied > ref + 0.05) {
        lines.push(`The implied growth meaningfully exceeds the historical pace — the price requires acceleration the company has not yet demonstrated.`);
      } else if (implied < ref - 0.05) {
        lines.push(`The implied growth is below the historical pace — the market may be pricing in a deceleration or slowdown.`);
      } else {
        lines.push(`The implied growth is roughly consistent with the historical pace — the price assumes the business continues to grow at its recent rate.`);
      }
    }
  }
  lines.push('');
  lines.push(`Read the sensitivity grid below to see how this implied growth shifts under different discount rates and terminal multiples. A value-investing skeptic would ask whether the highest-implied-growth cells in the grid are achievable, and whether the assumptions that produce a more attractive picture are themselves reasonable.`);
  return lines.join('\n');
}

export function buildReverseDcf(snapshot: FinancialSnapshot): ReverseDcfReport | null {
  if (!snapshot.annual.length) return null;
  const last = snapshot.annual[snapshot.annual.length - 1]!;
  const fcf0 = last.fcf;
  if (fcf0 <= 0) return null;
  const shares = last.sharesOutstanding;
  if (shares <= 0) return null;

  // Compare against equity value (price * shares), not enterprise value.
  // The grid solves for FCF growth such that DCF of equity-FCF = market cap.
  // (Approximation: we treat FCF-to-firm and FCF-to-equity as equivalent
  // since most large-cap filers we care about have modest interest expense
  // relative to FCF. A more rigorous reverse DCF would distinguish, but
  // for a teaching module the simpler version is more interpretable.)
  const targetEv = snapshot.price * shares;

  const grid: ReverseDcfCell[] = [];
  for (const dr of DISCOUNT_RATES) {
    for (const tm of TERMINAL_MULTIPLES) {
      const g = solveImpliedGrowth(targetEv, fcf0, dr, tm);
      grid.push({ discountRate: dr, terminalMultiple: tm, impliedFcfCagr: g });
    }
  }

  // Actual delivered FCF CAGR over 3y and 5y for context.
  const annual = snapshot.annual;
  const fcf3yAgo = annual.length >= 4 ? annual[annual.length - 4]?.fcf : null;
  const fcf5yAgo = annual.length >= 6 ? annual[annual.length - 6]?.fcf : null;
  const actualFcfCagr3y = fcf3yAgo != null ? computeFcfCagr(fcf3yAgo, fcf0, 3) : null;
  const actualFcfCagr5y = fcf5yAgo != null ? computeFcfCagr(fcf5yAgo, fcf0, 5) : null;

  const baseReport: Omit<ReverseDcfReport, 'narrative'> = {
    ticker: snapshot.ticker,
    asOf: snapshot.asOf,
    currentPrice: snapshot.price,
    sharesOutstanding: shares / 1e6, // store in millions for readability
    startingFcfMillions: fcf0 / 1e6,
    actualFcfCagr3y,
    actualFcfCagr5y,
    grid,
  };
  return { ...baseReport, narrative: buildNarrative(baseReport) };
}

// Render the reverse DCF as markdown for inclusion in the primary-source
// checklist artifact. Plain table; values formatted as percentages.
export function renderReverseDcfMarkdown(r: ReverseDcfReport): string {
  const lines: string[] = [];
  lines.push(`## Reverse DCF — what is the current price assuming?`);
  lines.push('');
  lines.push(r.narrative);
  lines.push('');
  // Build a wide grid table: rows = discount rates, cols = terminal multiples.
  const rates = Array.from(new Set(r.grid.map((c) => c.discountRate))).sort((a, b) => a - b);
  const muls = Array.from(new Set(r.grid.map((c) => c.terminalMultiple))).sort((a, b) => a - b);
  lines.push(`### Implied 10-year FCF CAGR by (discount rate, terminal P/FCF)`);
  lines.push('');
  lines.push(`| Discount \\ Terminal | ${muls.map((m) => `${m}× P/FCF`).join(' | ')} |`);
  lines.push(`|${'---|'.repeat(muls.length + 1)}`);
  for (const dr of rates) {
    const row: string[] = [`**${(dr * 100).toFixed(0)}% discount**`];
    for (const m of muls) {
      const cell = r.grid.find((c) => c.discountRate === dr && c.terminalMultiple === m);
      const v = cell?.impliedFcfCagr;
      row.push(v == null ? '—' : `${(v * 100).toFixed(1)}%`);
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');
  lines.push(`*Starting FCF:* $${(r.startingFcfMillions / 1000).toFixed(2)}B per year. *Shares:* ${r.sharesOutstanding.toFixed(0)}M diluted. *Price:* $${r.currentPrice.toFixed(2)}.`);
  if (r.actualFcfCagr3y != null || r.actualFcfCagr5y != null) {
    const parts: string[] = [];
    if (r.actualFcfCagr5y != null) parts.push(`5y actual: ${(r.actualFcfCagr5y * 100).toFixed(1)}%`);
    if (r.actualFcfCagr3y != null) parts.push(`3y actual: ${(r.actualFcfCagr3y * 100).toFixed(1)}%`);
    lines.push(`*Historical FCF CAGR for comparison:* ${parts.join(', ')}.`);
  }
  return lines.join('\n');
}
