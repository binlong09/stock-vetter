// Citation verifier: runs after Pass 1, programmatically checks that each
// citation's `quote` appears as a verbatim substring in the cited section.
// Substring match is intentional — the citation-format rule allows quoting
// table headings or row labels (which are valid substrings of the cleaned
// section text) in addition to continuous prose. We're catching fabricated
// quotes, not enforcing stylistic preferences.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  isInsufficientPrimary,
  PRIMARY_DIMENSION_KEYS,
  type PrimaryDimensionKey,
  type PrimarySourceChecklist,
  type PrimarySourceCitation,
  type PrimarySourceSkeptic,
} from '@stock-vetter/schema';
import { getSecSection } from './cache.js';

// Match strength tiers, from strongest to weakest. Anything below
// `punctuation-normalized` means the underlying text isn't in the source —
// likely fabricated, hallucinated, or stitched across paragraphs.
//
// `punctuation-normalized` handles a real and frequent failure mode: SEC
// filings use curly quotes (’“”) and non-breaking spaces; LLMs often emit
// straight equivalents ('"). We normalize both sides so quotes that are
// otherwise verbatim still verify.
export type MatchTier =
  | 'exact'
  | 'whitespace-normalized'
  | 'case-insensitive'
  | 'punctuation-normalized'
  | 'no-match';

export type CitationVerification = {
  dimension: PrimaryDimensionKey;
  citationIndex: number;
  section: string;
  quote: string;
  // Where we looked. Helpful for debugging when match tier is no-match.
  lookedIn: 'sec-section-cache' | 'proxy-cache' | 'fixtures-fallback' | 'not-found';
  matchTier: MatchTier;
  // First 80 chars of the quote, for log readability.
  quotePreview: string;
};

export type VerificationResult = {
  total: number;
  exact: number;
  whitespaceNormalized: number;
  caseInsensitive: number;
  punctuationNormalized: number;
  noMatch: number;
  details: CitationVerification[];
};

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizePunctuation(s: string): string {
  // Curly quotes → straight, em/en dashes → ASCII hyphen-equivalents,
  // non-breaking and other unusual whitespace → regular space.
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadSectionText(
  filingAccession: string,
  ticker: string,
  section: string,
  proxyAccession?: string,
): Promise<{ text: string; source: CitationVerification['lookedIn'] } | null> {
  if (section === 'proxy') {
    if (proxyAccession) {
      const cached = await getSecSection<string>(proxyAccession, 'proxy');
      if (cached) return { text: cached, source: 'proxy-cache' };
    }
    // Fallback: read the on-disk proxy file we wrote during analyze-ticker.
    try {
      const dir = join('fixtures', ticker.toUpperCase(), 'proxy');
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(dir);
      const txt = files.find((f) => f.endsWith('.txt'));
      if (txt) {
        const text = await readFile(join(dir, txt), 'utf-8');
        return { text, source: 'fixtures-fallback' };
      }
    } catch {
      /* ignore */
    }
    return null;
  }
  // Try the cache first (fast).
  const cached = await getSecSection<string>(filingAccession, section);
  if (cached) return { text: cached, source: 'sec-section-cache' };
  // Fall back to the on-disk markdown file. The markdown has a header
  // prepended; the body section is what we want to match against. The
  // header is short (~5 lines) so leaving it in doesn't cause false-
  // positive matches, but quotes won't match against the header so it's safe.
  try {
    const path = join('fixtures', ticker.toUpperCase(), 'sec', filingAccession, `${section}.md`);
    const text = await readFile(path, 'utf-8');
    return { text, source: 'fixtures-fallback' };
  } catch {
    return null;
  }
}

export async function verifyChecklistCitations(
  checklist: PrimarySourceChecklist,
  proxyAccession?: string,
): Promise<VerificationResult> {
  const details: CitationVerification[] = [];
  // Pre-load each section once per dimension to avoid re-reading.
  const sectionTextCache = new Map<string, string | null>();
  const fetchSection = async (section: string): Promise<{ text: string; source: CitationVerification['lookedIn'] } | null> => {
    const key = section;
    if (sectionTextCache.has(key)) {
      const v = sectionTextCache.get(key);
      return v ? { text: v, source: 'sec-section-cache' } : null;
    }
    const result = await loadSectionText(checklist.filingAccession, checklist.ticker, section, proxyAccession);
    sectionTextCache.set(key, result?.text ?? null);
    return result;
  };

  for (const dim of PRIMARY_DIMENSION_KEYS) {
    const score = checklist.scores[dim];
    if (isInsufficientPrimary(score)) continue;
    for (let i = 0; i < score.citations.length; i++) {
      const c: PrimarySourceCitation = score.citations[i]!;
      const loaded = await fetchSection(c.section);
      if (!loaded) {
        details.push({
          dimension: dim,
          citationIndex: i,
          section: c.section,
          quote: c.quote,
          lookedIn: 'not-found',
          matchTier: 'no-match',
          quotePreview: c.quote.slice(0, 80),
        });
        continue;
      }
      let tier: MatchTier;
      if (loaded.text.includes(c.quote)) tier = 'exact';
      else if (normalizeWhitespace(loaded.text).includes(normalizeWhitespace(c.quote))) tier = 'whitespace-normalized';
      else if (loaded.text.toLowerCase().includes(c.quote.toLowerCase())) tier = 'case-insensitive';
      else if (normalizePunctuation(loaded.text).toLowerCase().includes(normalizePunctuation(c.quote).toLowerCase())) tier = 'punctuation-normalized';
      else tier = 'no-match';
      details.push({
        dimension: dim,
        citationIndex: i,
        section: c.section,
        quote: c.quote,
        lookedIn: loaded.source,
        matchTier: tier,
        quotePreview: c.quote.slice(0, 80),
      });
    }
  }

  const total = details.length;
  const exact = details.filter((d) => d.matchTier === 'exact').length;
  const whitespaceNormalized = details.filter((d) => d.matchTier === 'whitespace-normalized').length;
  const caseInsensitive = details.filter((d) => d.matchTier === 'case-insensitive').length;
  const punctuationNormalized = details.filter((d) => d.matchTier === 'punctuation-normalized').length;
  const noMatch = details.filter((d) => d.matchTier === 'no-match').length;
  return { total, exact, whitespaceNormalized, caseInsensitive, punctuationNormalized, noMatch, details };
}

// Verify Pass 2 (skeptic) citations the same way. Skeptic citations may
// emit a section like "proxy (DEF 14A) — Compensation Governance" that
// embeds a sub-section label after the section id; we tolerate this by
// extracting the leading section id token before the first space/paren.
export async function verifySkepticCitations(
  skeptic: PrimarySourceSkeptic,
  proxyAccession?: string,
): Promise<VerificationResult> {
  const details: CitationVerification[] = [];
  const sectionTextCache = new Map<string, string | null>();
  const fetchSection = async (
    section: string,
  ): Promise<{ text: string; source: CitationVerification['lookedIn'] } | null> => {
    // Normalize: take everything before the first space, em-dash, or paren.
    // Section ids contain hyphens (e.g. "financial-statements") so we
    // must NOT split on plain hyphens — only the em-dash separator.
    const normalizedId = section.split(/[\s(—]/)[0]?.trim().toLowerCase() ?? section;
    if (sectionTextCache.has(normalizedId)) {
      const v = sectionTextCache.get(normalizedId);
      return v ? { text: v, source: 'sec-section-cache' } : null;
    }
    const result = await loadSectionText(skeptic.filingAccession, skeptic.ticker, normalizedId, proxyAccession);
    sectionTextCache.set(normalizedId, result?.text ?? null);
    return result;
  };

  for (const dim of PRIMARY_DIMENSION_KEYS) {
    const r = skeptic.rebuttals[dim];
    for (let i = 0; i < r.citations.length; i++) {
      const c: PrimarySourceCitation = r.citations[i]!;
      const loaded = await fetchSection(c.section);
      if (!loaded) {
        details.push({
          dimension: dim,
          citationIndex: i,
          section: c.section,
          quote: c.quote,
          lookedIn: 'not-found',
          matchTier: 'no-match',
          quotePreview: c.quote.slice(0, 80),
        });
        continue;
      }
      let tier: MatchTier;
      if (loaded.text.includes(c.quote)) tier = 'exact';
      else if (normalizeWhitespace(loaded.text).includes(normalizeWhitespace(c.quote))) tier = 'whitespace-normalized';
      else if (loaded.text.toLowerCase().includes(c.quote.toLowerCase())) tier = 'case-insensitive';
      else if (normalizePunctuation(loaded.text).toLowerCase().includes(normalizePunctuation(c.quote).toLowerCase())) tier = 'punctuation-normalized';
      else tier = 'no-match';
      details.push({
        dimension: dim,
        citationIndex: i,
        section: c.section,
        quote: c.quote,
        lookedIn: loaded.source,
        matchTier: tier,
        quotePreview: c.quote.slice(0, 80),
      });
    }
  }

  const total = details.length;
  const exact = details.filter((d) => d.matchTier === 'exact').length;
  const whitespaceNormalized = details.filter((d) => d.matchTier === 'whitespace-normalized').length;
  const caseInsensitive = details.filter((d) => d.matchTier === 'case-insensitive').length;
  const punctuationNormalized = details.filter((d) => d.matchTier === 'punctuation-normalized').length;
  const noMatch = details.filter((d) => d.matchTier === 'no-match').length;
  return { total, exact, whitespaceNormalized, caseInsensitive, punctuationNormalized, noMatch, details };
}
