// XBRL company-facts → per-concept time series.
//
// WHY THIS AND NOT THE EXTRACTED METRICS. The local model pulls figures out of
// filing text, and those figures are quote-verified, but they are still a
// transcription of a rendering of a number. For trend detection — the thing
// that actually finds shorts — we need many periods lined up on a common
// basis, and every transcription error compounds across the series. A single
// mis-attributed period turns "receivables rose four quarters running" into
// noise, or invents it.
//
// The filer already tagged all of this. `companyfacts` returns machine-readable
// values with explicit period boundaries, straight from the XBRL the company
// certified. Trends built on it are exact, and a trend finding sourced here can
// be labelled as such so the cloud model weights it above anything a 30B model
// read off a page.
//
// `financials.ts` already reads companyfacts, but only for annual rows. Short
// signals live in the quarterly sequence — four consecutive quarters of
// lengthening DSO is a finding, one annual data point is not — so this module
// handles the harder quarterly case.
//
// THE THREE THINGS THAT MAKE QUARTERLY XBRL HARD
//
//  1. Duration facts are often CUMULATIVE. A Q3 10-Q reports both a 3-month and
//     a 9-month figure, both tagged `fp: "Q3"`. Taking the wrong one makes
//     revenue appear to triple in Q3 every single year.
//  2. Q4 is almost never reported. The 10-K gives the full year, so a discrete
//     Q4 has to be derived as FY − (Q1 + Q2 + Q3), and that derivation must be
//     labelled — it is arithmetic, not disclosure.
//  3. The same period is reported many times. Every subsequent filing restates
//     it as a comparative, and a restatement genuinely changes the value. The
//     latest reported figure for a period is the right one, but knowing a value
//     WAS restated is itself a short signal, so both are kept.

import { secFetchJson, SecHttpError } from './sec-http.js';
import { readCache, writeCacheEntry } from './cache.js';

export type FiscalPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'FY';

export type FactPoint = {
  /** "2025Q3" or "2025FY". Sorts chronologically within a fiscal year. */
  period: string;
  fy: number;
  fp: FiscalPeriod;
  /** null for instant (balance-sheet) facts. */
  start: string | null;
  end: string;
  value: number;
  /** Form the value was most recently reported on. */
  form: string;
  /** Set when this point was computed rather than disclosed. */
  derived?: 'q4-residual';
  /**
   * Prior value for this same period from an earlier filing, when a later
   * filing changed it. A restated period is a disclosure in its own right.
   */
  restatedFrom?: number;
};

export type ConceptKind = 'duration' | 'instant';

export type ConceptSeries = {
  /** Canonical name we asked for, e.g. 'revenue'. */
  concept: string;
  /** us-gaap tags that actually supplied data, in the order they contributed. */
  matchedTags: string[];
  kind: ConceptKind;
  unit: string;
  /** Discrete quarterly points, oldest first. */
  quarterly: FactPoint[];
  /** Annual points, oldest first. */
  annual: FactPoint[];
};

export type ConceptSpec = {
  concept: string;
  /**
   * Candidate us-gaap tags in priority order. Multiple entries are the norm,
   * not a fallback: filers migrate tags (ASC 606 moved most of the market from
   * `Revenues` to `RevenueFromContractWithCustomerExcludingAssessedTax` in
   * 2018), so a series built from one tag has a hole where the migration
   * happened — exactly the kind of gap that reads as a collapse in revenue.
   */
  tags: string[];
  kind: ConceptKind;
  unit?: string;
};

type SecFactValue = {
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  start?: string;
  /** Accession the value was reported on. Used to break ties by recency. */
  accn?: string;
  filed?: string;
};

type SecCompanyFacts = {
  cik: number;
  entityName?: string;
  facts?: {
    'us-gaap'?: Record<string, { units?: Record<string, SecFactValue[]> }>;
    ifrs?: Record<string, { units?: Record<string, SecFactValue[]> }>;
  };
};

function daySpan(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** A ~3-month duration. Quarters run 84–98 days depending on 4-4-5 calendars. */
function isDiscreteQuarter(span: number): boolean {
  return span >= 80 && span <= 100;
}

/** A ~12-month duration. */
function isFullYear(span: number): boolean {
  return span >= 350 && span <= 380;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch and cache a company's XBRL facts.
 *
 * The payload is several megabytes for a large filer, so it is cached on a
 * daily bucket — the facts only change when the company files, and a scan of
 * 2,000 companies would otherwise re-download gigabytes.
 */
export async function fetchCompanyFacts(cik: string): Promise<SecCompanyFacts | null> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${cik}_${day}`;
  const cached = await readCache<SecCompanyFacts | null>('xbrl-facts', key);
  if (cached) return cached.payload;
  try {
    const facts = await secFetchJson<SecCompanyFacts>(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    );
    await writeCacheEntry('xbrl-facts', key, facts);
    return facts;
  } catch (e) {
    // A company with no XBRL facts (recent IPO, foreign private issuer filing
    // in a namespace we don't read) is a normal outcome, not an error.
    if (e instanceof SecHttpError && e.status === 404) {
      await writeCacheEntry('xbrl-facts', key, null);
      return null;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Series construction
// ---------------------------------------------------------------------------

function collectRawValues(
  facts: SecCompanyFacts,
  spec: ConceptSpec,
): { values: SecFactValue[]; matchedTags: string[]; unit: string } {
  const ns = facts.facts?.['us-gaap'] ?? facts.facts?.ifrs ?? {};
  const unit = spec.unit ?? 'USD';

  // The tags are listed in PRIORITY order. Usually they cover different eras —
  // a filer migrates from one to another (ASC 606 moved the market off
  // `Revenues`) — so concatenating them stitches one continuous series. But
  // some filers report more than one at once: InventoryNet alongside
  // InventoryFinishedGoodsNetOfReserves, which is a component of it. Blindly
  // concatenating then puts two different values on the same period, and the
  // gap between them reads as a restatement every quarter. So each period is
  // claimed by the highest-priority tag that reports it; a lower-priority tag
  // only supplies periods no higher one covers.
  const tagPoints = spec.tags.map((tag) => ns[tag]?.units?.[unit] ?? []);
  const claimedBy = new Map<string, number>();
  tagPoints.forEach((points, idx) => {
    for (const p of points) {
      const key = `${p.start ?? ''}|${p.end}`;
      const cur = claimedBy.get(key);
      if (cur === undefined || idx < cur) claimedBy.set(key, idx);
    }
  });

  const values: SecFactValue[] = [];
  const contributed = new Set<number>();
  tagPoints.forEach((points, idx) => {
    for (const p of points) {
      if (claimedBy.get(`${p.start ?? ''}|${p.end}`) === idx) {
        values.push(p);
        contributed.add(idx);
      }
    }
  });
  const matchedTags = spec.tags.filter((_, idx) => contributed.has(idx));
  return { values: normalizeScale(values), matchedTags, unit };
}

// Reconcile a fact tagged at the wrong scale in one filing. CHD's 2026 10-K
// reports intangibles in millions (1838.7) while its 10-Qs use dollars
// (1,838,700,000); left alone the gap reads as a $1.8B → $1,838 restatement and
// corrupts the series. Within one concept a value never legitimately moves by a
// factor of 1000 between reports of nearby periods, so a point whose magnitude
// is off by >=1000x from the series consensus is a units error — rescale it by
// the power of ten that reconciles it. Needs enough points to establish that
// consensus, and only ever moves an outlier onto the majority's scale.
function normalizeScale(values: SecFactValue[]): SecFactValue[] {
  const exps = values
    .filter((v) => Number.isFinite(v.val) && v.val !== 0)
    .map((v) => Math.round(Math.log10(Math.abs(v.val))));
  if (exps.length < 4) return values;
  const sorted = [...exps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const consensus = Math.round(
    sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
  );
  return values.map((v) => {
    if (!Number.isFinite(v.val) || v.val === 0) return v;
    const diff = consensus - Math.round(Math.log10(Math.abs(v.val)));
    return Math.abs(diff) >= 3 ? { ...v, val: v.val * 10 ** diff } : v;
  });
}

// Two reports of one period differ for two reasons: a genuine restatement, or
// mere precision drift — a figure disclosed to the dollar, then re-reported to
// the nearest hundred thousand in a later comparative. Only a material move is
// a revision; a sub-0.5% wobble is rounding and must not read as one, or every
// filer that rounds its comparatives looks like it quietly restates.
function isMaterialChange(a: number, b: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale > 0.005;
}

// Collapse many reports of one period into a single point.
//
// The period's IDENTITY is its own dates (the `key`), never the reporting
// filing's fy/fp. Those two fields belong to the filing that carried the value,
// not to the period it covers: a Q2-2018 figure re-reported as the comparative
// in the 2019 Q2 10-Q is tagged fy=2019/fp=Q2, and a 2018 year-end balance
// re-reported in the 2019 Q1 10-Q is tagged fy=2019/fp=Q1. Keying on them
// collides two genuinely different periods and reads the value gap between them
// as a restatement — which fired on 100% of real filers before this was keyed
// by date.
//
// The LABEL (fy, fp, period, dates) therefore comes from the earliest-filed
// report — the native disclosure, where the period is the current one and its
// fy/fp are its own. The VALUE comes from the most recent report, and a
// materially different later value is preserved as `restatedFrom`, because a
// company quietly revising a period it already reported is itself a short signal.
function collapsePeriods(
  candidates: Array<{ key: string; point: FactPoint; filed: string }>,
): FactPoint[] {
  const byKey = new Map<string, Array<{ point: FactPoint; filed: string }>>();
  for (const c of candidates) {
    const list = byKey.get(c.key) ?? [];
    list.push({ point: c.point, filed: c.filed });
    byKey.set(c.key, list);
  }
  const out: FactPoint[] = [];
  for (const group of byKey.values()) {
    group.sort((a, b) => a.filed.localeCompare(b.filed));
    const native = group[0]!.point;
    let value = native.value;
    let restatedFrom: number | undefined;
    for (const g of group.slice(1)) {
      if (isMaterialChange(g.point.value, value)) {
        // Preserve the value as ORIGINALLY disclosed across a chain of
        // restatements — "was 100, now 80" is the signal, not "was 90, now 80".
        if (restatedFrom === undefined) restatedFrom = value;
        value = g.point.value;
      }
    }
    out.push({
      ...native,
      value,
      form: group[group.length - 1]!.point.form,
      ...(restatedFrom !== undefined ? { restatedFrom } : {}),
    });
  }
  return out.sort((a, b) => a.end.localeCompare(b.end));
}

function quarterOfPeriod(fp?: string): FiscalPeriod | null {
  if (fp === 'Q1' || fp === 'Q2' || fp === 'Q3' || fp === 'Q4') return fp;
  if (fp === 'FY') return 'FY';
  return null;
}

function buildDurationSeries(
  values: SecFactValue[],
): { quarterly: FactPoint[]; annual: FactPoint[] } {
  const qCandidates: Array<{ key: string; point: FactPoint; filed: string }> = [];
  const yCandidates: Array<{ key: string; point: FactPoint; filed: string }> = [];

  for (const v of values) {
    if (!v.start || !v.end || !v.fy || !Number.isFinite(v.val)) continue;
    const span = daySpan(v.start, v.end);
    const fp = quarterOfPeriod(v.fp);
    if (!fp) continue;
    const filed = v.filed ?? v.end;

    if (isDiscreteQuarter(span)) {
      // A ~90-day fact tagged FY is a comparative quarter inside a 10-K, not
      // the fiscal year. Its `fp` is unreliable; place it by end date instead.
      const fpResolved = fp === 'FY' ? null : fp;
      if (!fpResolved) continue;
      qCandidates.push({
        key: `${v.start}|${v.end}`,
        point: {
          period: `${v.fy}${fpResolved}`,
          fy: v.fy,
          fp: fpResolved,
          start: v.start,
          end: v.end,
          value: v.val,
          form: v.form ?? '',
        },
        filed,
      });
    } else if (isFullYear(span) && fp === 'FY') {
      yCandidates.push({
        key: `${v.start}|${v.end}`,
        point: {
          period: `${v.fy}FY`,
          fy: v.fy,
          fp: 'FY',
          start: v.start,
          end: v.end,
          value: v.val,
          form: v.form ?? '',
        },
        filed,
      });
    }
    // Everything else — 6-month and 9-month cumulatives — is deliberately
    // dropped. Mixing a 9-month figure into a quarterly series is the single
    // most common way to fabricate a revenue spike every Q3.
  }

  const quarterly = collapsePeriods(qCandidates);
  const annual = collapsePeriods(yCandidates);

  // Derive Q4. Filers report the full year on the 10-K and rarely disclose a
  // discrete Q4, so without this every company looks like it stops reporting
  // for three months a year.
  const byFy = new Map<number, FactPoint[]>();
  for (const q of quarterly) {
    const list = byFy.get(q.fy) ?? [];
    list.push(q);
    byFy.set(q.fy, list);
  }
  const derived: FactPoint[] = [];
  for (const y of annual) {
    const qs = byFy.get(y.fy) ?? [];
    if (qs.some((q) => q.fp === 'Q4')) continue;
    const q1 = qs.find((q) => q.fp === 'Q1');
    const q2 = qs.find((q) => q.fp === 'Q2');
    const q3 = qs.find((q) => q.fp === 'Q3');
    if (!q1 || !q2 || !q3) continue;
    derived.push({
      period: `${y.fy}Q4`,
      fy: y.fy,
      fp: 'Q4',
      // The residual quarter runs from the day after Q3 ends to the year end.
      start: q3.end,
      end: y.end,
      value: y.value - (q1.value + q2.value + q3.value),
      form: y.form,
      derived: 'q4-residual',
    });
  }

  return {
    quarterly: [...quarterly, ...derived].sort((a, b) => a.end.localeCompare(b.end)),
    annual,
  };
}

function buildInstantSeries(values: SecFactValue[]): { quarterly: FactPoint[]; annual: FactPoint[] } {
  const candidates: Array<{ key: string; point: FactPoint; filed: string }> = [];
  for (const v of values) {
    // Instants have no `start`. A value carrying one is a duration fact that
    // doesn't belong in a balance-sheet series.
    if (v.start || !v.end || !v.fy || !Number.isFinite(v.val)) continue;
    const fp = quarterOfPeriod(v.fp);
    if (!fp) continue;
    candidates.push({
      key: v.end,
      point: {
        period: `${v.fy}${fp}`,
        fy: v.fy,
        fp,
        start: null,
        end: v.end,
        value: v.val,
        form: v.form ?? '',
      },
      filed: v.filed ?? v.end,
    });
  }
  const all = collapsePeriods(candidates);
  // A fiscal-year-end balance IS the Q4 balance. Publishing it under both
  // labels lets ratio code join balance-sheet and income-statement series on
  // one period key without special-casing year ends.
  const annual = all.filter((p) => p.fp === 'FY');
  const quarterly = [
    ...all.filter((p) => p.fp !== 'FY'),
    ...annual.map((p) => ({ ...p, period: `${p.fy}Q4`, fp: 'Q4' as const })),
  ].sort((a, b) => a.end.localeCompare(b.end));
  return { quarterly, annual };
}

/** Build one concept's series from an already-fetched facts payload. */
export function buildConceptSeries(facts: SecCompanyFacts, spec: ConceptSpec): ConceptSeries {
  const { values, matchedTags, unit } = collectRawValues(facts, spec);
  const built =
    spec.kind === 'instant' ? buildInstantSeries(values) : buildDurationSeries(values);
  return {
    concept: spec.concept,
    matchedTags,
    kind: spec.kind,
    unit,
    quarterly: built.quarterly,
    annual: built.annual,
  };
}

export type SeriesSet = {
  cik: string;
  entityName: string | null;
  byConcept: Map<string, ConceptSeries>;
  /** Concepts requested for which the filer tagged nothing. */
  missing: string[];
};

/** Fetch a company's facts and build every requested concept's series. */
export async function fetchSeriesSet(cik: string, specs: ConceptSpec[]): Promise<SeriesSet | null> {
  const facts = await fetchCompanyFacts(cik);
  if (!facts) return null;
  const byConcept = new Map<string, ConceptSeries>();
  const missing: string[] = [];
  for (const spec of specs) {
    const series = buildConceptSeries(facts, spec);
    if (!series.quarterly.length && !series.annual.length) missing.push(spec.concept);
    byConcept.set(spec.concept, series);
  }
  return { cik, entityName: facts.entityName ?? null, byConcept, missing };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Points at or before `asOfEnd`, oldest first.
 *
 * Every trend computation goes through this. XBRL facts include periods filed
 * AFTER the filing under analysis — a company's 2026 10-Q restates 2025
 * comparatives — so computing a trend "as of" a 2025 filing against the full
 * payload silently uses information that did not exist yet. That is invisible
 * in the output and fatal to any backtest of the strategy.
 */
export function pointsAsOf(points: FactPoint[], asOfEnd?: string): FactPoint[] {
  if (!asOfEnd) return points;
  return points.filter((p) => p.end <= asOfEnd);
}

/** The most recent N quarterly points at or before `asOfEnd`, oldest first. */
export function recentQuarters(series: ConceptSeries | undefined, n: number, asOfEnd?: string): FactPoint[] {
  if (!series) return [];
  return pointsAsOf(series.quarterly, asOfEnd).slice(-n);
}

/** The most recent N annual points at or before `asOfEnd`, oldest first. */
export function recentYears(series: ConceptSeries | undefined, n: number, asOfEnd?: string): FactPoint[] {
  if (!series) return [];
  return pointsAsOf(series.annual, asOfEnd).slice(-n);
}

/** Value for one exact period, or null. */
export function valueAt(series: ConceptSeries | undefined, period: string): number | null {
  const p = series?.quarterly.find((x) => x.period === period) ?? series?.annual.find((x) => x.period === period);
  return p ? p.value : null;
}
