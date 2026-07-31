// The "lite" always-on radar: deterministic short-side signals over a watchlist,
// with NO GPU and NO model. It is the cheap, runs-anywhere tier of the
// short-scanner — reacting same-day to material 8-K items and, a few days behind
// the filing (companyfacts lags), to multi-period XBRL deterioration. The
// model-read flags (tier 2) are deliberately excluded so this can run on a plain
// cron over EDGAR + arithmetic.
//
// Each signal carries a stable `key` so a daily run surfaces it exactly once;
// the persistence layer treats an already-seen key as old.

import { sweepFilings, listFilings, fetchEightK, fetchSeriesSet } from '@stock-vetter/core';
import type { RadarSignal } from '@stock-vetter/schema';
import { FORENSIC_CONCEPTS } from './concepts.js';
import { detectTrends } from './trends.js';
import { computeAnnualFundamentals } from './ratios.js';
import { beneishMScore, altmanZScore } from './composite-scores.js';

export type WatchlistEntry = { ticker: string; cik: string };

export type RadarOptions = {
  since: Date;
  until?: Date;
  onProgress?: (message: string) => void;
};

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
  const cikToTicker = new Map(watchlist.map((w) => [w.cik.padStart(10, '0'), w.ticker]));

  // A day whose index can't be fetched is NOT an empty day — surface it so the
  // caller can re-run rather than silently reporting "no signals".
  const unfetchedDates: string[] = [];
  const entries = await sweepFilings({
    ciks: new Set(cikToTicker.keys()),
    forms: ['8-K', '10-K', '10-Q'],
    since: opts.since,
    until: opts.until,
    onDayError: (date, err) => {
      unfetchedDates.push(date);
      log(`  ⚠ could not fetch ${date}: ${err.message}`);
    },
  });
  log(`${entries.length} filings in the window`);

  const signals: RadarSignal[] = [];

  // --- 8-K material items: same-day, fully deterministic ---------------------
  for (const e of entries.filter((x) => x.form.startsWith('8-K'))) {
    const ticker = cikToTicker.get(e.cik);
    if (!ticker) continue;
    try {
      // The daily index has no primary-document name; resolve the concrete ref.
      const refs = await listFilings(ticker, { forms: ['8-K'], since: e.filingDate });
      const ref = refs.find((r) => r.accession === e.accession);
      if (!ref) continue;
      const filing = await fetchEightK(ref);
      for (const item of filing.parsed.items) {
        // Radar surfaces only the loud items; medium/low (earnings releases, new
        // agreements) are routine and would drown the signal.
        if (item.severity !== 'critical' && item.severity !== 'high') continue;
        signals.push({
          key: `${e.accession}:8k:${item.number}`,
          ticker,
          cik: e.cik,
          accession: e.accession,
          form: e.form,
          filingDate: e.filingDate,
          kind: '8k-item',
          severity: item.severity,
          headline: `8-K Item ${item.number}: ${item.label}`,
          detail: item.shortSideNote ?? item.label,
        });
      }
    } catch (err) {
      log(`  8-K ${ticker} ${e.accession} failed: ${(err as Error).message}`);
    }
  }

  // --- XBRL cross-filing: trends, restatement, distress composites -----------
  // A periodic filing is the trigger, but the numbers come from companyfacts
  // (the whole series), so recompute once per ticker that filed in the window.
  const triggers = new Map<string, { cik: string; accession: string; form: string; filingDate: string }>();
  for (const e of entries) {
    if (e.form.startsWith('8-K')) continue;
    const ticker = cikToTicker.get(e.cik);
    if (!ticker) continue;
    const cur = triggers.get(ticker);
    if (!cur || e.filingDate > cur.filingDate) {
      triggers.set(ticker, { cik: e.cik, accession: e.accession, form: e.form, filingDate: e.filingDate });
    }
  }

  for (const [ticker, trig] of triggers) {
    try {
      const series = await fetchSeriesSet(trig.cik, FORENSIC_CONCEPTS);
      if (!series) continue;
      const trends = detectTrends(series);
      const annual = computeAnnualFundamentals(series);
      const beneish = beneishMScore(annual);
      const altman = altmanZScore(annual);

      for (const t of trends.findings) {
        if (t.severity === 'low') continue;
        const isRestatement = t.id === 'prior-period-restated';
        signals.push({
          key: `${ticker}:${isRestatement ? 'restatement' : 'trend'}:${t.id}`,
          ticker,
          cik: trig.cik,
          accession: trig.accession,
          form: trig.form,
          filingDate: trig.filingDate,
          kind: isRestatement ? 'restatement' : 'trend',
          severity: t.severity,
          headline: t.claim.length > 130 ? `${t.claim.slice(0, 127)}…` : t.claim,
          detail: `series: ${t.series.map((s) => `${s.period}=${Number(s.value.toFixed(2))}`).join(' → ')}`,
        });
      }

      if (beneish?.flagged) {
        signals.push({
          key: `${ticker}:composite:beneish`,
          ticker,
          cik: trig.cik,
          accession: trig.accession,
          form: trig.form,
          filingDate: trig.filingDate,
          kind: 'composite',
          severity: 'high',
          headline: `Beneish M-score ${beneish.mScore} above ${beneish.threshold} — earnings-manipulation screen flagged`,
          detail: beneish.dominantIndex ? `driven mainly by ${beneish.dominantIndex}` : '',
        });
      }
      if (altman?.zone === 'distress') {
        signals.push({
          key: `${ticker}:composite:altman`,
          ticker,
          cik: trig.cik,
          accession: trig.accession,
          form: trig.form,
          filingDate: trig.filingDate,
          kind: 'composite',
          severity: 'high',
          headline: `Altman Z''-score ${altman.zScore} in the distress zone`,
          detail: '',
        });
      }
    } catch (err) {
      log(`  XBRL ${ticker} failed: ${(err as Error).message}`);
    }
  }

  return { signals, unfetchedDates };
}
