// Small-cap-specific radar tuning.
//
// The radar's original detector set was built against the top ~100 US tech
// names, and porting it down the cap scale unchanged produces a bad feed in
// both directions:
//
//   It floods. Altman Z'' puts essentially every pre-profit micro cap in the
//   distress zone, permanently. That is a description of the business model,
//   not news, and a feed that reports it every quarter for 200 names is a feed
//   nobody reads.
//
//   It misses. The events that actually move a $300M company are not
//   multi-quarter margin drift — they are the share count jumping 30% on a
//   financing, a shelf takedown pricing overnight, a Nasdaq listing
//   deficiency, an NT 10-Q saying the numbers will be late. At mega-cap scale
//   those are rare or irrelevant; down here they are the whole game.
//
// So this module holds three things: the cap-tier definition, the cap-relative
// severity rules (materiality is a fraction of enterprise value, and the 8-K
// item table's fixed severities implicitly assume a large one), and the two
// XBRL detectors that matter most at this size — dilution and cash runway.
//
// Everything here is arithmetic over filer-tagged XBRL. No model, no GPU.

import { recentQuarters, type ConceptSeries, type SeriesSet } from '@stock-vetter/core';
import type { RadarDirection } from '@stock-vetter/schema';
import type { AnnualFundamentals } from './ratios.js';
import { altmanZScore } from './composite-scores.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Cap tiers
// ---------------------------------------------------------------------------

export type CapTier = 'nano' | 'micro' | 'small' | 'mid-plus' | 'unknown';

const NANO_MAX = 50e6;
const MICRO_MAX = 300e6;
const SMALL_MAX = 2e9;

/**
 * Cap tier from market cap in USD. `unknown` when the watchlist entry carries
 * no cap (the plain `build-watchlist` builder doesn't price anything) — and
 * `unknown` is treated as mid-plus everywhere below, so a watchlist without
 * caps behaves exactly as the radar did before this module existed.
 */
export function capTier(marketCap: number | null | undefined): CapTier {
  if (marketCap == null || !Number.isFinite(marketCap) || marketCap <= 0) return 'unknown';
  if (marketCap < NANO_MAX) return 'nano';
  if (marketCap < MICRO_MAX) return 'micro';
  if (marketCap < SMALL_MAX) return 'small';
  return 'mid-plus';
}

/** True for the tiers where cap-relative promotion applies. */
export function isSmallCap(tier: CapTier): boolean {
  return tier === 'nano' || tier === 'micro' || tier === 'small';
}

const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SEV_BY_RANK: Severity[] = ['low', 'medium', 'high', 'critical'];

function promote(sev: Severity, notches = 1): Severity {
  return SEV_BY_RANK[Math.min(SEV_RANK[sev] + notches, 3)]!;
}

/**
 * 8-K items whose severity is cap-relative, with the direction they point.
 *
 * The rule of thumb behind the promotions: a disclosure is material when it
 * moves a number that is large relative to the enterprise. A new $30M credit
 * facility is a rounding error at $500B and a balance-sheet event at $200M;
 * an earnings release is one of four routine prints for a mega cap and the
 * single largest scheduled repricing event a micro cap has all quarter. Items
 * already rated high or critical in the base table are left alone — they were
 * loud at any size.
 */
const CAP_RELATIVE_ITEMS: Record<string, { direction: RadarDirection; why: string }> = {
  '1.01': {
    direction: 'ambiguous',
    why: 'A material agreement at this size is often a company-making (or company-breaking) contract.',
  },
  '2.01': {
    direction: 'ambiguous',
    why: 'An acquisition or disposal is a large fraction of the enterprise at this size.',
  },
  '2.02': {
    direction: 'ambiguous',
    why: 'The quarter’s single largest scheduled repricing event for a name this size.',
  },
  '2.03': {
    direction: 'bearish',
    why: 'New debt against a small balance sheet — check the terms, not just the amount.',
  },
  '5.01': {
    direction: 'ambiguous',
    why: 'Change of control: usually a takeout, sometimes a creditor or PIPE investor taking the keys.',
  },
  '5.03': {
    direction: 'bearish',
    why: 'Charter amendments are where reverse splits and authorized-share increases live.',
  },
};

/** Directions for the items the base table already rates high or critical. */
const BASE_ITEM_DIRECTION: Record<string, RadarDirection> = {
  '1.02': 'bearish',
  '1.03': 'bearish',
  '2.04': 'bearish',
  '2.05': 'bearish',
  '2.06': 'bearish',
  '3.01': 'bearish',
  '3.02': 'bearish',
  '3.03': 'bearish',
  '4.01': 'bearish',
  '4.02': 'bearish',
  '5.02': 'bearish',
};

export type ItemVerdict = {
  severity: Severity;
  direction: RadarDirection;
  /** Cap-relative rationale, appended to the signal detail. Empty when unpromoted. */
  note: string;
};

/**
 * Resolve an 8-K item's severity and direction for a company of a given size.
 * At mid-plus (or unknown) cap this is the identity function over the base
 * table, so nothing about the large-cap behaviour changes.
 */
export function resolveItemSeverity(
  itemNumber: string,
  baseSeverity: Severity,
  tier: CapTier,
): ItemVerdict {
  const capRelative = CAP_RELATIVE_ITEMS[itemNumber];
  const baseDirection = BASE_ITEM_DIRECTION[itemNumber] ?? capRelative?.direction ?? 'bearish';
  if (!capRelative || !isSmallCap(tier)) {
    return { severity: baseSeverity, direction: baseDirection, note: '' };
  }
  return {
    severity: promote(baseSeverity),
    direction: capRelative.direction,
    note: capRelative.why,
  };
}

// ---------------------------------------------------------------------------
// Index-only forms: the form type IS the signal
// ---------------------------------------------------------------------------

export type FormSignalDef = {
  kind: 'offering' | 'late-filing' | 'ownership' | 'uplisting';
  severity: Severity;
  direction: RadarDirection;
  headline: string;
  detail: string;
  /**
   * Match the exact form only, never its `/A` amendments.
   *
   * Needed for SC 13G, where amendments aren't a variation on the signal —
   * they ARE the volume. Every 13G holder re-files annually and the market's
   * worth of them lands in the same February week; treating those as new
   * stakes would bury the feed once a year in filings that report nothing
   * changed.
   */
  exactOnly?: boolean;
};

/**
 * Forms that need no document fetch to be worth surfacing — the daily index
 * entry alone carries the whole signal. This is the cheapest tier of the
 * radar: zero extra EDGAR requests, and it covers the small-cap financing
 * cycle end to end (shelf registered → takedown priced → shares outstanding
 * jumps) plus the two hard delisting tripwires.
 *
 * Keys are matched against the index form exactly, or as a `FORM/...` prefix
 * (so `S-3` also catches `S-3/A`), which is the same rule `sweepFilings` uses.
 */
export const INDEX_ONLY_FORMS: Record<string, FormSignalDef> = {
  'S-1': {
    kind: 'offering',
    severity: 'high',
    direction: 'bearish',
    headline: 'S-1 registration statement filed — new shares being registered for sale',
    detail: 'Registered dilution ahead. Check the share count on the cover against shares outstanding.',
  },
  'S-3': {
    kind: 'offering',
    severity: 'high',
    direction: 'bearish',
    headline: 'S-3 shelf registration filed — dilution capacity being created',
    detail:
      'A shelf is capacity, not an issuance. It is the reliable precursor: the takedown (424B5) usually follows within months, priced overnight at a discount.',
  },
  'F-1': {
    kind: 'offering',
    severity: 'high',
    direction: 'bearish',
    headline: 'F-1 registration statement filed (foreign private issuer)',
    detail: 'Registered dilution ahead.',
  },
  'F-3': {
    kind: 'offering',
    severity: 'high',
    direction: 'bearish',
    headline: 'F-3 shelf registration filed (foreign private issuer)',
    detail: 'Shelf capacity created; the takedown usually follows.',
  },
  '424B5': {
    kind: 'offering',
    severity: 'critical',
    direction: 'bearish',
    headline: '424B5 prospectus supplement — a shelf takedown is pricing now',
    detail:
      'This is the offering itself, not the capacity for one. Small-cap takedowns typically price at a discount to the last close and are the single most reliable same-day repricing event at this cap.',
  },
  '424B4': {
    kind: 'offering',
    severity: 'critical',
    direction: 'bearish',
    headline: '424B4 final prospectus — an offering has priced',
    detail: 'Terms are set. Read the price against the last close for the discount.',
  },
  '424B3': {
    kind: 'offering',
    severity: 'medium',
    direction: 'bearish',
    headline: '424B3 prospectus — registered resale',
    detail:
      'Often a resale registration for PIPE or warrant holders rather than a primary raise: overhang, not fresh dilution.',
  },
  'NT 10-K': {
    kind: 'late-filing',
    severity: 'critical',
    direction: 'bearish',
    headline: 'NT 10-K — the annual report will be late',
    detail:
      'A company telling the SEC it cannot close its own books on time. Read Part III for the reason; auditor disputes and restatements surface here first.',
  },
  'NT 10-Q': {
    kind: 'late-filing',
    severity: 'critical',
    direction: 'bearish',
    headline: 'NT 10-Q — the quarterly report will be late',
    detail: 'Same tell as an NT 10-K, one quarter earlier.',
  },
  '25-NSE': {
    kind: 'late-filing',
    severity: 'critical',
    direction: 'bearish',
    headline: 'Form 25-NSE — the exchange has filed to delist the security',
    detail: 'Exchange-initiated delisting. This is the end state that an Item 3.01 notice warns about.',
  },
  'SC 13D': {
    kind: 'ownership',
    severity: 'high',
    direction: 'bullish',
    headline: 'SC 13D — an activist or strategic holder crossed 5% with intent',
    detail:
      'A 13D (not 13G) means the holder is not passive. At small caps a 13D is frequently the opening move of a campaign or an approach.',
  },
  'SC TO-T': {
    kind: 'ownership',
    severity: 'critical',
    direction: 'bullish',
    headline: 'SC TO-T — a third-party tender offer has been launched',
    detail: 'A bid for the shares, usually at a premium.',
  },
  'SC 14D9': {
    kind: 'ownership',
    severity: 'critical',
    direction: 'bullish',
    headline: 'SC 14D9 — the board is responding to a tender offer',
    detail: 'The company’s recommendation on a live bid.',
  },
  'SC 13G': {
    kind: 'ownership',
    severity: 'medium',
    direction: 'bullish',
    exactOnly: true,
    headline: 'SC 13G — a passive holder crossed 5%',
    detail:
      'The weakest bullish signal here, and worth checking the filer before reading anything into it: ' +
      'an index fund mechanically crossing 5% is not information, an active manager building a position is. ' +
      'Amendments are excluded — every 13G holder re-files annually, which would otherwise bury one February a year.',
  },
  '8-A12B': {
    kind: 'uplisting',
    severity: 'high',
    direction: 'bullish',
    headline: '8-A12B — registering a class of securities on a national exchange',
    detail:
      'Usually an uplisting from OTC to Nasdaq or NYSE. It widens the eligible buyer base in one step — ' +
      'index and institutional mandates that could not touch an OTC name can hold a listed one — and it ' +
      'requires clearing the exchange’s price and equity standards, so it doubles as a quality gate.',
  },
};

/** Every form the index-only tier wants from the sweep. */
export const INDEX_ONLY_FORM_LIST = Object.keys(INDEX_ONLY_FORMS);

/** The signal def for an index form, honouring the `FORM/A` amendment rule. */
export function indexOnlyFormDef(form: string): FormSignalDef | null {
  const f = form.toUpperCase();
  for (const [key, def] of Object.entries(INDEX_ONLY_FORMS)) {
    const K = key.toUpperCase();
    if (f === K) return def;
    if (!def.exactOnly && f.startsWith(`${K}/`)) return def;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dilution
// ---------------------------------------------------------------------------

export type DilutionFinding = {
  period: string;
  shares: number;
  priorQuarterShares: number | null;
  yearAgoShares: number | null;
  /** Fractional change, e.g. 0.31 for +31%. */
  quarterOverQuarter: number | null;
  yearOverYear: number | null;
  severity: Severity;
  headline: string;
  detail: string;
};

function pct(x: number): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
}

function millions(x: number): string {
  return `${(x / 1e6).toFixed(1)}M`;
}

/**
 * Share-count expansion from the diluted weighted-average series.
 *
 * Weighted average lags actual issuance — a raise closing in the last week of
 * a quarter barely moves that quarter's average — which makes this detector
 * conservative rather than noisy: a double-digit move in the *average* means
 * a large issuance that has already been outstanding for most of a quarter.
 * The 424B5/S-3 index signals are the leading indicator; this is the
 * confirmation, and the one that quantifies the damage.
 *
 * Returns null when the company isn't diluting or the series is too short.
 */
export function detectDilution(set: SeriesSet, opts: { asOf?: string } = {}): DilutionFinding | null {
  const series: ConceptSeries | undefined = set.byConcept.get('dilutedShares');
  const points = recentQuarters(series, 5, opts.asOf);
  if (points.length < 2) return null;

  const latest = points.at(-1)!;
  const prior = points.at(-2)!;
  const yearAgo = points.length >= 5 ? points.at(-5)! : null;

  // A filer that tags share counts in thousands one year and units the next
  // produces a 1000x "dilution". Treat an implausible jump as a units change,
  // not a financing.
  const qoq = prior.value > 0 ? latest.value / prior.value - 1 : null;
  const yoy = yearAgo && yearAgo.value > 0 ? latest.value / yearAgo.value - 1 : null;
  if (qoq != null && qoq > 20) return null;

  let severity: Severity | null = null;
  if (qoq != null && qoq >= 0.25) severity = 'critical';
  else if (qoq != null && qoq >= 0.1) severity = 'high';
  else if (yoy != null && yoy >= 0.5) severity = 'high';
  else if (yoy != null && yoy >= 0.25) severity = 'medium';
  if (!severity) return null;

  const parts: string[] = [];
  if (qoq != null) parts.push(`${pct(qoq)} QoQ`);
  if (yoy != null) parts.push(`${pct(yoy)} YoY`);

  return {
    period: latest.period,
    shares: latest.value,
    priorQuarterShares: prior.value,
    yearAgoShares: yearAgo?.value ?? null,
    quarterOverQuarter: qoq,
    yearOverYear: yoy,
    severity,
    headline: `Diluted share count ${parts.join(', ')} — ${millions(latest.value)} shares as of ${latest.period}`,
    detail:
      `weighted-average diluted shares: ` +
      points.map((p) => `${p.period}=${millions(p.value)}`).join(' → ') +
      `. Weighted average lags issuance, so the outstanding count is likely higher still.`,
  };
}

// ---------------------------------------------------------------------------
// Cash runway
// ---------------------------------------------------------------------------

export type RunwayFinding = {
  period: string;
  cash: number;
  /** Average quarterly free-cash burn (positive number = cash going out). */
  quarterlyBurn: number;
  runwayQuarters: number;
  severity: Severity;
  headline: string;
  detail: string;
};

/**
 * Quarters of cash left at the recent burn rate.
 *
 * This is the clock every cash-burning small cap runs on, and it is what makes
 * the financing signals predictable: a company inside two quarters of runway
 * is going to raise, and the market knows it, which is most of why the shelf
 * filing matters. Burn is free cash flow (CFO less capex) summed over the last
 * four quarters — using the sum rather than the worst quarter keeps a single
 * lumpy working-capital quarter from manufacturing an emergency.
 *
 * Returns null for FCF-positive companies (no runway to speak of) and when
 * there aren't enough quarters to establish a rate.
 */
export function detectCashRunway(set: SeriesSet, opts: { asOf?: string } = {}): RunwayFinding | null {
  const cashPoints = recentQuarters(set.byConcept.get('cash'), 1, opts.asOf);
  const cfoPoints = recentQuarters(set.byConcept.get('cfo'), 4, opts.asOf);
  if (!cashPoints.length || cfoPoints.length < 3) return null;

  const cash = cashPoints.at(-1)!;
  if (!(cash.value > 0)) return null;

  const capexByPeriod = new Map(
    recentQuarters(set.byConcept.get('capex'), 4, opts.asOf).map((p) => [p.period, p.value]),
  );
  // Capex is tagged as a positive outflow in the cash-flow statement; a filer
  // that signs it negative would otherwise read as cash coming in.
  const fcf = cfoPoints.map((p) => p.value - Math.abs(capexByPeriod.get(p.period) ?? 0));
  const total = fcf.reduce((a, b) => a + b, 0);
  if (total >= 0) return null;

  const quarterlyBurn = -total / fcf.length;
  const runwayQuarters = cash.value / quarterlyBurn;

  let severity: Severity | null = null;
  if (runwayQuarters < 2) severity = 'critical';
  else if (runwayQuarters < 4) severity = 'high';
  else if (runwayQuarters < 6) severity = 'medium';
  if (!severity) return null;

  const months = Math.round(runwayQuarters * 3);
  return {
    period: cash.period,
    cash: cash.value,
    quarterlyBurn,
    runwayQuarters,
    severity,
    headline:
      `~${months} month${months === 1 ? '' : 's'} of cash left — $${(cash.value / 1e6).toFixed(1)}M ` +
      `against $${(quarterlyBurn / 1e6).toFixed(1)}M/quarter of free-cash burn`,
    detail:
      `cash as of ${cash.period}; burn is the mean of the last ${fcf.length} quarters of CFO less capex ` +
      `(${cfoPoints.map((p, i) => `${p.period}=${(fcf[i]! / 1e6).toFixed(1)}M`).join(' → ')}). ` +
      `A company this close to the wall raises, and the market prices that in advance.`,
  };
}

// ---------------------------------------------------------------------------
// Composite gating
// ---------------------------------------------------------------------------

/**
 * Whether an Altman distress reading is *news* for this company.
 *
 * For a pre-profit micro cap, sitting in the distress zone is the steady
 * state — negative retained earnings and no operating income put it there
 * mechanically on day one, and reporting it every quarter is how a feed
 * teaches its reader to ignore it. So below small-cap scale the reading only
 * surfaces on the TRANSITION: not in distress a year ago, in distress now.
 * At mid-plus cap the reading is rare enough to always be worth saying.
 */
export function altmanIsNews(annual: AnnualFundamentals[], tier: CapTier): boolean {
  if (!isSmallCap(tier)) return true;
  if (annual.length < 2) return false;
  const prior = altmanZScore(annual.slice(0, -1));
  // Unknown prior (missing tags a year ago) is not evidence of a transition.
  return prior?.zone === 'safe' || prior?.zone === 'grey';
}
