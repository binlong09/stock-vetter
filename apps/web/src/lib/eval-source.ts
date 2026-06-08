/**
 * Presentation helpers for eval-log rows: turn an (event identity, source) into
 * a human label and a best-effort source link, plus the outcome chip styling.
 */

export type EvalOutcome = 'no_candidate' | 'neutral' | 'signal';

const SEC_FORM: Record<string, string> = {
  'sec-8k': '8-K',
  'sec-10q': '10-Q',
  'sec-10k': '10-K',
};

/** A short human label for what was evaluated. */
export function evalSourceLabel(source: string, eventDedupKey: string, ticker: string): string {
  if (source in SEC_FORM) return `${SEC_FORM[source]} ${eventDedupKey}`;
  if (source === 'av-transcript') {
    const q = eventDedupKey.split(':')[2] ?? '';
    return `${ticker} ${q} earnings call`;
  }
  if (source === 'fmp-estimates') return 'Consensus estimates snapshot';
  if (source === 'fmp-revisions') return 'Analyst-ratings snapshot';
  if (source === 'manual') return 'Manual note';
  return eventDedupKey;
}

/**
 * Best-effort link to the source. For SEC filings we link to the ticker's
 * EDGAR filing list filtered by form (a reliable accession-only deep link
 * isn't available without the CIK, which the eval row doesn't carry); the row
 * shows the accession + date so the exact filing is identifiable. FMP /
 * transcript / manual rows have no public per-event URL → null.
 */
export function evalSourceUrl(source: string, _eventDedupKey: string, ticker: string): string | null {
  if (source in SEC_FORM) {
    const form = SEC_FORM[source];
    return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(
      ticker,
    )}&type=${encodeURIComponent(form!)}&dateb=&owner=include&count=40`;
  }
  return null;
}

export function outcomeMeta(o: string): { label: string; pill: string } {
  switch (o) {
    case 'signal':
      return { label: 'signal', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'neutral':
      return { label: 'neutral', pill: 'bg-slate-100 text-slate-600 border-slate-300' };
    case 'no_candidate':
    default:
      return { label: 'no candidate', pill: 'bg-slate-50 text-slate-400 border-slate-200' };
  }
}
