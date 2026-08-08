// The "lite" always-on radar: deterministic signals over a watchlist, with NO
// GPU and NO model. It is the cheap, runs-anywhere tier of the scanner —
// reacting same-day to material 8-K items and financing/listing forms, and a
// few days behind the filing (companyfacts lags), to XBRL deterioration. The
// model-read flags (tier 2) are deliberately excluded so this can run on a
// plain cron over EDGAR + arithmetic.
//
// The detector set is CAP-AWARE. Pointed at mega caps it behaves as it always
// did; pointed at a small-cap watchlist (one carrying `marketCap` per entry)
// it additionally promotes the 8-K items whose materiality is cap-relative,
// runs the dilution and cash-runway detectors, and gates the Altman screen to
// transitions — see `smallcap.ts` for why each of those is necessary rather
// than merely nice. The small-cap tuning is what makes this feed readable at
// $200M: at that size the trade is a financing, a listing notice or a contract,
// not three quarters of margin drift.
//
// Each signal carries a stable `key` so a daily run surfaces it exactly once;
// the persistence layer treats an already-seen key as old.

import {
  sweepFilings,
  listFilings,
  fetchEightK,
  fetchSeriesSet,
  fetchForm4Purchases,
  type InsiderPurchase,
} from '@stock-vetter/core';
import type { RadarSignal } from '@stock-vetter/schema';
import { detectInsiderCluster, groupPurchasesByIssuer } from './insider.js';
import { detectBullishInflections } from './inflection.js';
import { FORENSIC_CONCEPTS } from './concepts.js';
import { detectTrends } from './trends.js';
import { computeAnnualFundamentals } from './ratios.js';
import { beneishMScore, altmanZScore } from './composite-scores.js';
import {
  capTier,
  isSmallCap,
  resolveItemSeverity,
  indexOnlyFormDef,
  INDEX_ONLY_FORM_LIST,
  detectDilution,
  detectCashRunway,
  altmanIsNews,
  type CapTier,
} from './smallcap.js';

export type WatchlistEntry = {
  ticker: string;
  cik: string;
  /** Company name, when the universe builder resolved one. */
  name?: string;
  /**
   * Market cap in USD at the last universe rebuild. Optional: the plain
   * ticker-list builder doesn't price anything, and an entry without a cap is
   * treated as mid-plus — i.e. exactly the pre-small-cap behaviour.
   */
  marketCap?: number | null;
  /** SEC SIC code, when classified. Carried for provenance, not used here. */
  sic?: string;
  /** SEC SIC industry label, e.g. "Semiconductors & Related Devices". */
  sicDescription?: string;
  /** Coarse tech-sector bucket from the universe builder. */
  sector?: string;
  /** Short business description (first sentences of Yahoo's assetProfile). */
  description?: string | null;
  /** On the focus list — a name whose story you already know. */
  focus?: boolean;
};

/**
 * Where the insider-buying detector keeps its history.
 *
 * A cluster — three insiders buying across two weeks — is the thing worth
 * reporting, and it cannot be computed from a single sweep, which only sees
 * one day of Form 4s. So the sweep accumulates into a store and reads the
 * trailing window back out. Optional: without one the detector still works,
 * it just can only see clusters that fall entirely inside the sweep window.
 */
export type InsiderStore = {
  /** Which of these Form 4 accessions have already been parsed. */
  seen: (accessions: string[]) => Promise<Set<string>>;
  /** Mark filings processed and record whatever purchases they contained. */
  record: (
    filings: Array<{ accession: string; cik: string; filingDate: string }>,
    purchases: InsiderPurchase[],
  ) => Promise<void>;
  /** Purchases for these issuers with a trade date on or after `since`. */
  recent: (ciks: string[], since: string) => Promise<InsiderPurchase[]>;
};

export type RadarOptions = {
  since: Date;
  until?: Date;
  onProgress?: (message: string) => void;
  /** History for the insider-buying detector. Omit to run without one. */
  insiderStore?: InsiderStore;
  /**
   * Days of Form 4 history the cluster detector considers. Two weeks is the
   * default because it is long enough for a management team to act on the
   * same information and short enough that unrelated buys don't accrete into
   * a fake cluster.
   */
  insiderWindowDays?: number;
};

const PERIODIC_FORMS = ['8-K', '10-K', '10-Q'];
/** EDGAR's form type for a statement of changes in beneficial ownership. */
const FORM_4 = '4';

/** 10-K / 10-Q (and their amendments) — the forms that carry fresh XBRL. */
function isPeriodicReport(form: string): boolean {
  const f = form.toUpperCase();
  return ['10-K', '10-Q'].some((w) => f === w || f.startsWith(`${w}/`));
}

/**
 * Compute every current radar signal for the watchlist over [since, until].
 * Returns ALL signals detected; deciding which are NEW is the caller's job
 * (via the persistence layer keyed on `signal.key`).
 */
export async function computeRadarSignals(
  watchlist: WatchlistEntry[],
  opts: RadarOptions,
): Promise<{ signals: RadarSignal[]; unfetchedDates: string[] }> {
  const log = opts.onProgress ?? (() => undefined);
  const byCik = new Map(watchlist.map((w) => [w.cik.padStart(10, '0'), w]));
  const tierOf = (cik: string): CapTier => capTier(byCik.get(cik)?.marketCap);
  const capOf = (cik: string): number | null => byCik.get(cik)?.marketCap ?? null;
  const focusOf = (cik: string): boolean => byCik.get(cik)?.focus === true;

  // A day whose index can't be fetched is NOT an empty day — surface it so the
  // caller can re-run rather than silently reporting "no signals".
  const unfetchedDates: string[] = [];
  const entries = await sweepFilings({
    ciks: new Set(byCik.keys()),
    // The index-only forms (S-3, 424B5, NT 10-Q, SC 13D…) cost nothing beyond
    // the same one-request-per-day index we already fetch, and at small-cap
    // scale they are the highest-yield tier of the whole radar.
    forms: [...PERIODIC_FORMS, ...INDEX_ONLY_FORM_LIST, FORM_4],
    since: opts.since,
    until: opts.until,
    onDayError: (date, err) => {
      unfetchedDates.push(date);
      log(`  ⚠ could not fetch ${date}: ${err.message}`);
    },
  });
  log(`${entries.length} filings in the window`);

  const signals: RadarSignal[] = [];

  // --- index-only forms: the form type IS the signal, zero extra requests ----
  for (const e of entries) {
    const def = indexOnlyFormDef(e.form);
    if (!def) continue;
    const entry = byCik.get(e.cik);
    if (!entry) continue;
    signals.push({
      key: `${e.accession}:form:${e.form}`,
      ticker: entry.ticker,
      cik: e.cik,
      accession: e.accession,
      form: e.form,
      filingDate: e.filingDate,
      kind: def.kind,
      severity: def.severity,
      direction: def.direction,
      headline: def.headline,
      detail: def.detail,
      marketCap: capOf(e.cik),
      focus: focusOf(e.cik),
    });
  }

  // --- Form 4: open-market insider buying, the one bullish primary source ---
  const form4Entries = entries.filter((e) => e.form.toUpperCase() === FORM_4);
  if (form4Entries.length) {
    const store = opts.insiderStore;
    // Skip filings a previous run already parsed. Most Form 4s report a grant
    // or an option exercise rather than a purchase, so without this the
    // intraday re-sweeps would re-fetch the same documents to find nothing.
    const already = store ? await store.seen(form4Entries.map((e) => e.accession)) : new Set<string>();
    const todo = form4Entries.filter((e) => !already.has(e.accession));
    log(`${form4Entries.length} Form 4s in the window (${todo.length} new to parse)`);

    const fresh: InsiderPurchase[] = [];
    const processed: Array<{ accession: string; cik: string; filingDate: string }> = [];
    for (const e of todo) {
      const entry = byCik.get(e.cik);
      if (!entry) continue;
      try {
        const purchases = await fetchForm4Purchases({
          cik: e.cik,
          accession: e.accession,
          filingDate: e.filingDate,
          ticker: entry.ticker,
        });
        fresh.push(...purchases);
        processed.push({ accession: e.accession, cik: e.cik, filingDate: e.filingDate });
      } catch (err) {
        log(`  Form 4 ${entry.ticker} ${e.accession} failed: ${(err as Error).message}`);
      }
    }
    if (store && processed.length) await store.record(processed, fresh);

    // The window is what makes a cluster visible, so read history back out and
    // merge it with what this sweep just found (the store write above may not
    // be visible to a read in the same transaction, and there may be no store
    // at all).
    const windowDays = opts.insiderWindowDays ?? 14;
    const windowStart = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
    const ciksWithActivity = [...new Set(form4Entries.map((e) => e.cik))];
    const history = store ? await store.recent(ciksWithActivity, windowStart) : [];
    const byKey = new Map<string, InsiderPurchase>();
    for (const p of [...history, ...fresh]) {
      if (p.transactionDate >= windowStart) byKey.set(p.key, p);
    }

    for (const [cik, purchases] of groupPurchasesByIssuer([...byKey.values()])) {
      const entry = byCik.get(cik);
      if (!entry) continue;
      const cluster = detectInsiderCluster(purchases, { marketCap: entry.marketCap });
      if (!cluster) continue;
      signals.push({
        // Keyed on the window's latest trade date, so a cluster that grows —
        // a third insider joining next week — surfaces again as a new, louder
        // signal rather than being silently deduped against the first two.
        key: `${entry.ticker}:insider-buy:${cluster.lastDate}:${cluster.buyers}`,
        ticker: entry.ticker,
        cik,
        accession: cluster.accession,
        form: 'Form 4',
        filingDate: cluster.filingDate,
        kind: 'insider-buy',
        severity: cluster.severity,
        direction: 'bullish',
        headline: cluster.headline,
        detail: cluster.detail,
        marketCap: entry.marketCap ?? null,
        focus: entry.focus === true,
      });
    }
  }

  // --- 8-K material items: same-day, fully deterministic ---------------------
  for (const e of entries.filter((x) => x.form.startsWith('8-K'))) {
    const entry = byCik.get(e.cik);
    if (!entry) continue;
    const ticker = entry.ticker;
    const tier = tierOf(e.cik);
    try {
      // The daily index has no primary-document name; resolve the concrete ref.
      const refs = await listFilings(ticker, { forms: ['8-K'], since: e.filingDate });
      const ref = refs.find((r) => r.accession === e.accession);
      if (!ref) continue;
      const filing = await fetchEightK(ref);
      for (const item of filing.parsed.items) {
        const verdict = resolveItemSeverity(item.number, item.severity, tier);
        // Radar surfaces only the loud items; medium/low (routine agreements,
        // exhibits) are noise and would drown the signal. What counts as loud
        // is cap-relative — see resolveItemSeverity.
        if (verdict.severity !== 'critical' && verdict.severity !== 'high') continue;
        const note = item.shortSideNote ?? item.label;
        signals.push({
          key: `${e.accession}:8k:${item.number}`,
          ticker,
          cik: e.cik,
          accession: e.accession,
          form: e.form,
          filingDate: e.filingDate,
          kind: '8k-item',
          severity: verdict.severity,
          direction: verdict.direction,
          headline: `8-K Item ${item.number}: ${item.label}`,
          detail: verdict.note ? `${note} ${verdict.note}` : note,
          marketCap: capOf(e.cik),
          focus: focusOf(e.cik),
        });
      }
    } catch (err) {
      log(`  8-K ${ticker} ${e.accession} failed: ${(err as Error).message}`);
    }
  }

  // --- XBRL cross-filing: dilution, runway, trends, distress composites ------
  // A periodic filing is the trigger, but the numbers come from companyfacts
  // (the whole series), so recompute once per ticker that filed in the window.
  const triggers = new Map<string, { cik: string; accession: string; form: string; filingDate: string }>();
  for (const e of entries) {
    // Only the periodic reports carry fresh XBRL. The sweep now also returns
    // S-3s and 13Ds, which must not trigger a companyfacts recompute.
    if (!isPeriodicReport(e.form)) continue;
    const entry = byCik.get(e.cik);
    if (!entry) continue;
    const cur = triggers.get(entry.ticker);
    if (!cur || e.filingDate > cur.filingDate) {
      triggers.set(entry.ticker, {
        cik: e.cik,
        accession: e.accession,
        form: e.form,
        filingDate: e.filingDate,
      });
    }
  }

  for (const [ticker, trig] of triggers) {
    const tier = tierOf(trig.cik);
    const marketCap = capOf(trig.cik);
    const base = {
      ticker,
      cik: trig.cik,
      accession: trig.accession,
      form: trig.form,
      filingDate: trig.filingDate,
      marketCap,
      focus: focusOf(trig.cik),
    };
    try {
      const series = await fetchSeriesSet(trig.cik, FORENSIC_CONCEPTS);
      if (!series) continue;
      const trends = detectTrends(series);
      const annual = computeAnnualFundamentals(series);
      const beneish = beneishMScore(annual);
      const altman = altmanZScore(annual);

      // Dilution and runway run for every cap tier — they are simply far more
      // often *true* down the cap scale. Keyed on the period so each new
      // quarter's reading surfaces once rather than every sweep.
      const dilution = detectDilution(series);
      if (dilution) {
        signals.push({
          ...base,
          key: `${ticker}:dilution:${dilution.period}`,
          kind: 'dilution',
          severity: dilution.severity,
          direction: 'bearish',
          headline: dilution.headline,
          detail: dilution.detail,
        });
      }

      // Bullish XBRL: buybacks and fundamental inflections. Same series, read
      // for the turn UP rather than the turn down.
      for (const f of detectBullishInflections(series)) {
        signals.push({
          ...base,
          key: `${ticker}:${f.kind}:${f.id}:${f.period}`,
          kind: f.kind,
          severity: f.severity,
          direction: 'bullish',
          headline: f.headline,
          detail: f.detail,
        });
      }

      const runway = detectCashRunway(series);
      if (runway) {
        signals.push({
          ...base,
          key: `${ticker}:runway:${runway.period}`,
          kind: 'runway',
          severity: runway.severity,
          direction: 'bearish',
          headline: runway.headline,
          detail: runway.detail,
        });
      }

      for (const t of trends.findings) {
        if (t.severity === 'low') continue;
        const isRestatement = t.id === 'prior-period-restated';
        signals.push({
          ...base,
          key: `${ticker}:${isRestatement ? 'restatement' : 'trend'}:${t.id}`,
          kind: isRestatement ? 'restatement' : 'trend',
          severity: t.severity,
          direction: 'bearish',
          headline: t.claim.length > 130 ? `${t.claim.slice(0, 127)}…` : t.claim,
          detail: `series: ${t.series.map((s) => `${s.period}=${Number(s.value.toFixed(2))}`).join(' → ')}`,
        });
      }

      if (beneish?.flagged) {
        signals.push({
          ...base,
          key: `${ticker}:composite:beneish`,
          kind: 'composite',
          severity: 'high',
          direction: 'bearish',
          headline: `Beneish M-score ${beneish.mScore} above ${beneish.threshold} — earnings-manipulation screen flagged`,
          detail: beneish.dominantIndex ? `driven mainly by ${beneish.dominantIndex}` : '',
        });
      }
      // Distress is the permanent state of a pre-profit micro cap, not news.
      // Below small-cap scale, only the transition into it is reported.
      if (altman?.zone === 'distress' && altmanIsNews(annual, tier)) {
        signals.push({
          ...base,
          key: `${ticker}:composite:altman`,
          kind: 'composite',
          severity: 'high',
          direction: 'bearish',
          headline: `Altman Z''-score ${altman.zScore} in the distress zone`,
          detail: isSmallCap(tier) ? 'newly in distress — the prior year scored outside the zone' : '',
        });
      }
    } catch (err) {
      log(`  XBRL ${ticker} failed: ${(err as Error).message}`);
    }
  }

  return { signals, unfetchedDates };
}
