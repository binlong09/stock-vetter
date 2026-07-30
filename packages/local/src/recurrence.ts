// Cross-filing TEXT signals: things a company keeps saying.
//
// The numeric detectors in `trends.ts` catch deterioration in the figures.
// This catches a different and complementary thing — an explanation that has
// stopped being an explanation.
//
// "The decline reflects the timing of shipments" is a perfectly reasonable
// sentence in one quarter. In the fourth consecutive quarter it is no longer
// describing timing; it is describing a trend that management is declining to
// call a trend. Same with a "non-recurring" restructuring charge taken every
// year for five years: the charge is recurring, the label is not.
//
// Neither is visible from one filing, which is exactly why they survive. The
// lookback index makes them cheap to find: the corpus is already local, and a
// keyword search across a company's own history costs nothing.
//
// Matching is deterministic token overlap, not a model. Two sentences are "the
// same explanation" when they share enough distinctive content words. That is
// crude, and it is the right kind of crude: a model asked "is this the same
// excuse?" will find creative similarities everywhere, and this detector's
// entire value depends on its false-positive rate being near zero.

import type { FlagSeverity, ShortFlagCategory } from '@stock-vetter/schema';
import type { LookbackIndex } from './lookback.js';

// Words too common to distinguish one explanation from another. Deliberately
// includes finance-generic vocabulary ("revenue", "increase") — those appear in
// every filing and matching on them would make everything look repeated.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'was', 'were', 'are', 'our', 'its', 'this', 'that', 'with', 'from', 'have',
  'has', 'had', 'not', 'but', 'their', 'they', 'which', 'been', 'will', 'would', 'could', 'may',
  'due', 'primarily', 'partially', 'compared', 'prior', 'year', 'quarter', 'period', 'periods',
  'increase', 'increased', 'decrease', 'decreased', 'higher', 'lower', 'million', 'billion',
  'revenue', 'revenues', 'sales', 'net', 'total', 'company', 'we', 'us', 'in', 'of', 'to', 'a',
  'an', 'as', 'at', 'by', 'on', 'or', 'is', 'it', 'be', 'been', 'during', 'over', 'under', 'than',
]);

export function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

/** Fraction of the claim's distinctive words that also appear in the candidate. */
export function overlapRatio(claim: Set<string>, candidate: Set<string>): number {
  if (!claim.size) return 0;
  let hits = 0;
  for (const w of claim) if (candidate.has(w)) hits++;
  return hits / claim.size;
}

export type RecurrenceFinding = {
  id: 'repeated-explanation' | 'recurring-one-time-charge';
  category: ShortFlagCategory;
  severity: FlagSeverity;
  claim: string;
  /** The wording in the filing under analysis. */
  quote: string;
  /** Prior filings where the same explanation appears, newest first. */
  priorOccurrences: Array<{ accession: string; form: string; filingDate: string; excerpt: string }>;
  /** Distinct prior filings, which is what the severity keys off. */
  distinctPriorFilings: number;
};

export type RecurrenceOptions = {
  /** Prior filings required before reporting. Default 2 (so 3 total). */
  minPriorFilings?: number;
  /** Token-overlap fraction that counts as the same explanation. Default 0.6. */
  minOverlap?: number;
  /** Candidate passages pulled per claim. Default 12. */
  searchLimit?: number;
  /** Only consider filings on or before this date — as-of correctness. */
  until?: string;
};

/**
 * Find management explanations in this filing that the company has given
 * before.
 *
 * Claims come from the local extraction pass, so they are already
 * quote-verified against the filing text; this only asks whether the same
 * explanation appears in the company's earlier filings.
 */
export async function detectRepeatedExplanations(
  index: LookbackIndex,
  input: {
    ticker: string;
    accession: string;
    claims: Array<{ claim: string; quote: string }>;
  },
  opts: RecurrenceOptions = {},
): Promise<RecurrenceFinding[]> {
  const minPrior = opts.minPriorFilings ?? 2;
  const minOverlap = opts.minOverlap ?? 0.6;
  const limit = opts.searchLimit ?? 12;
  const out: RecurrenceFinding[] = [];

  for (const c of input.claims) {
    const tokens = contentTokens(c.quote);
    // A quote with too few distinctive words will match anything. Reporting on
    // it would be reporting on the stopword list.
    if (tokens.size < 4) continue;

    const hits = await index.search([...tokens].join(' '), {
      ticker: input.ticker,
      excludeAccession: input.accession,
      limit,
      keywordOnly: true, // exact wording is the point; semantic neighbours are not
      snippetTokens: 220,
    });

    const byFiling = new Map<string, { form: string; filingDate: string; excerpt: string }>();
    for (const h of hits) {
      if (opts.until && h.filingDate > opts.until) continue;
      if (overlapRatio(tokens, contentTokens(h.snippet.text)) < minOverlap) continue;
      if (!byFiling.has(h.accession)) {
        byFiling.set(h.accession, {
          form: h.form,
          filingDate: h.filingDate,
          excerpt: h.snippet.text.slice(0, 300),
        });
      }
    }

    if (byFiling.size < minPrior) continue;

    const priorOccurrences = [...byFiling.entries()]
      .map(([accession, v]) => ({ accession, ...v }))
      .sort((a, b) => b.filingDate.localeCompare(a.filingDate));

    out.push({
      id: 'repeated-explanation',
      category: 'guidance',
      severity: byFiling.size >= 4 ? 'high' : byFiling.size >= 3 ? 'medium' : 'low',
      claim:
        `Management has given substantially this explanation in ${byFiling.size} prior filings ` +
        `(${priorOccurrences.map((p) => `${p.form} ${p.filingDate}`).join(', ')}). ` +
        `A cause described as timing or one-off across ${byFiling.size + 1} filings is neither.`,
      quote: c.quote,
      priorOccurrences,
      distinctPriorFilings: byFiling.size,
    });
  }

  return out;
}

// Phrases companies use to signal "don't count this against us". Each is
// searched independently, because a filing containing several of them is not
// more interesting than one containing the same phrase repeatedly.
const ONE_TIME_PHRASES = [
  'non-recurring',
  'nonrecurring',
  'one-time charge',
  'restructuring charge',
  'restructuring plan',
  'unusual items',
  'special charges',
  'exit costs',
];

/**
 * Find "one-time" charges the company has taken repeatedly.
 *
 * The classic non-GAAP tell: a restructuring plan every year for five years is
 * an operating expense with better branding. Only visible across filings.
 */
export async function detectRecurringOneTimeCharges(
  index: LookbackIndex,
  input: { ticker: string; accession: string },
  opts: RecurrenceOptions = {},
): Promise<RecurrenceFinding[]> {
  const minPrior = opts.minPriorFilings ?? 2;
  const out: RecurrenceFinding[] = [];

  for (const phrase of ONE_TIME_PHRASES) {
    const hits = await index.search(phrase, {
      ticker: input.ticker,
      limit: 30,
      keywordOnly: true,
      snippetTokens: 200,
    });

    const byFiling = new Map<string, { form: string; filingDate: string; excerpt: string }>();
    let currentFilingExcerpt: string | null = null;
    for (const h of hits) {
      if (opts.until && h.filingDate > opts.until) continue;
      // The phrase must actually be present — ranked retrieval returns
      // passages matching some of the terms, which is not the same thing.
      if (!h.snippet.text.toLowerCase().includes(phrase)) continue;
      if (h.accession === input.accession) {
        currentFilingExcerpt ??= h.snippet.text.slice(0, 300);
        continue;
      }
      if (!byFiling.has(h.accession)) {
        byFiling.set(h.accession, {
          form: h.form,
          filingDate: h.filingDate,
          excerpt: h.snippet.text.slice(0, 300),
        });
      }
    }

    // Only interesting if THIS filing also uses the language. A company that
    // restructured twice years ago and stopped is not a finding.
    if (!currentFilingExcerpt || byFiling.size < minPrior) continue;

    const priorOccurrences = [...byFiling.entries()]
      .map(([accession, v]) => ({ accession, ...v }))
      .sort((a, b) => b.filingDate.localeCompare(a.filingDate));

    out.push({
      id: 'recurring-one-time-charge',
      category: 'one-time-recurring',
      severity: byFiling.size >= 4 ? 'high' : 'medium',
      claim:
        `"${phrase}" appears in this filing and in ${byFiling.size} prior filings ` +
        `(${priorOccurrences.map((p) => `${p.form} ${p.filingDate}`).join(', ')}). ` +
        `A charge taken this often is an operating expense with better branding, and any ` +
        `non-GAAP measure adding it back overstates run-rate earnings.`,
      quote: currentFilingExcerpt,
      priorOccurrences,
      distinctPriorFilings: byFiling.size,
    });
  }

  return out;
}
