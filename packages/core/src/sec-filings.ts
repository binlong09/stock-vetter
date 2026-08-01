// Top-level SEC filings interface for the ticker-first workflow. Resolves
// ticker → CIK → latest filings, fetches HTML, parses sections, caches
// everything. The cache is keyed by accession number, so on subsequent
// runs we skip re-fetching unless EDGAR shows a newer filing.

import { parseFiling, type ExtractedSection, type ParseResult } from './sec-parser.js';
import { TENK_ITEMS, TENQ_ITEMS, type ItemDef } from './sec-constants.js';
import {
  getSecFilingMeta,
  putSecFilingMeta,
  getSecSection,
  putSecSection,
} from './cache.js';
import { secFetchJson, secFetchText } from './sec-http.js';
import { parseEightK, type ParsedEightK } from './sec-8k.js';
import { renderFilingLayout, locateSectionBlocks, blocksToMarkdown, type LayoutBlock } from './sec-layout.js';

export type FilingForm = '10-K' | '10-Q' | 'DEF 14A' | '8-K';

export type FilingMeta = {
  ticker: string;
  cik: string;
  accession: string;
  form: FilingForm;
  filingDate: string;
  primaryDocument: string;
  parsedAt: string;
  cleanedTextLength: number;
  sections: Array<{
    id: string;
    label: string;
    itemNumber: string;
    charLength: number;
    confidence: 'high' | 'low' | 'failed';
    warnings: string[];
    bundled?: string[];
    chosenAnchor: { text: string; score: number; signals: string[] };
  }>;
  parserWarnings: string[];
  missing: string[];
};

let _tickerToCikCache: Map<string, string> | null = null;

async function loadTickerMap(): Promise<Map<string, string>> {
  if (_tickerToCikCache) return _tickerToCikCache;
  const json = await secFetchJson<Record<string, { cik_str: number; ticker: string; title?: string }>>(
    'https://www.sec.gov/files/company_tickers.json',
  );
  const map = new Map<string, string>();
  for (const v of Object.values(json)) {
    map.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, '0'));
  }
  _tickerToCikCache = map;
  return map;
}

async function tickerToCik(ticker: string): Promise<string> {
  const map = await loadTickerMap();
  const cik = map.get(ticker.toUpperCase());
  if (!cik) throw new Error(`ticker not found: ${ticker}`);
  return cik;
}

/** Ticker → zero-padded CIK. Exported for the universe builder and the sweep. */
export async function resolveCik(ticker: string): Promise<string> {
  return tickerToCik(ticker);
}

/** The whole ticker→CIK table, for building a universe's CIK set in one request. */
export async function allTickerCiks(): Promise<Map<string, string>> {
  return new Map(await loadTickerMap());
}

type SubmissionsResponse = {
  cik: string;
  name?: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
};

async function fetchSubmissions(cik: string): Promise<SubmissionsResponse> {
  return secFetchJson<SubmissionsResponse>(`https://data.sec.gov/submissions/CIK${cik}.json`);
}

function findLatestFiling(
  sub: SubmissionsResponse,
  form: FilingForm,
): { accession: string; primaryDoc: string; filingDate: string } | null {
  const r = sub.filings.recent;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] === form) {
      return {
        accession: r.accessionNumber[i]!,
        primaryDoc: r.primaryDocument[i]!,
        filingDate: r.filingDate[i]!,
      };
    }
  }
  return null;
}

function filingDirUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${String(parseInt(cik, 10))}/${accession.replace(/-/g, '')}`;
}

async function fetchFilingHtml(cik: string, accession: string, primaryDoc: string): Promise<string> {
  return secFetchText(`${filingDirUrl(cik, accession)}/${primaryDoc}`);
}

function itemsForForm(form: FilingForm): ItemDef[] {
  if (form === '10-K') return TENK_ITEMS;
  if (form === '10-Q') return TENQ_ITEMS;
  // DEF 14A doesn't use the Item N. structure — proxy statements have their
  // own conventions. Return empty so the parser falls back to no extraction;
  // we'll handle DEF 14A separately with a dedicated parser path.
  return [];
}

// True iff every section the meta claims has text (charLength > 0) still has a
// resolvable body in the `sec` cache. A section parsed as empty/failed legitimately
// has no body, so it doesn't count against presence. Used to detect a meta that
// has outlived its section bodies (see fetchAndParseFiling's cache-hit branch).
async function sectionBodiesPresent(meta: FilingMeta): Promise<boolean> {
  const expected = meta.sections.filter((s) => s.charLength > 0);
  for (const s of expected) {
    const body = await getSecSection<string>(meta.accession, s.id);
    if (body == null) return false;
  }
  return true;
}

// Public API: fetch + parse + cache one filing. Returns the meta plus a
// loader for individual sections. Sections aren't returned in memory by
// default to keep this lightweight.
export async function fetchAndParseFiling(
  ticker: string,
  form: '10-K' | '10-Q',
): Promise<{ meta: FilingMeta; getSection: (id: string) => Promise<string | null> }> {
  const cik = await tickerToCik(ticker);
  const sub = await fetchSubmissions(cik);
  const latest = findLatestFiling(sub, form);
  if (!latest) throw new Error(`no ${form} found for ${ticker}`);
  return parseFilingByRef({
    ticker: ticker.toUpperCase(),
    cik,
    accession: latest.accession,
    form,
    filingDate: latest.filingDate,
    primaryDocument: latest.primaryDoc,
  });
}

/**
 * Parse a SPECIFIC filing, identified by reference rather than by "the latest
 * one of this form".
 *
 * A universe sweep discovers filings by accession number, and several filings
 * of the same form can fall inside one window — four 10-Qs in a year's
 * backfill, or an original plus its amendment. Routing those through the
 * latest-filing path would process the newest one repeatedly and silently drop
 * the rest.
 */
export async function parseFilingByRef(
  ref: FilingRef,
): Promise<{ meta: FilingMeta; getSection: (id: string) => Promise<string | null> }> {
  const { cik, accession, primaryDocument: primaryDoc, filingDate } = ref;
  const form = (ref.form.startsWith('10-K') ? '10-K' : '10-Q') as '10-K' | '10-Q';
  const found = { accession, primaryDoc, filingDate };

  // Cache hit is only trustworthy when the section BODIES are still present.
  // The meta (`sec-meta` namespace) and the bodies (`sec` namespace) are written
  // separately, so the meta can outlive the bodies (partial cache clear, an
  // interrupted earlier write). Returning a cached meta whose getSection yields
  // null would silently feed empty section text to downstream consumers — e.g.
  // the 10-Q delta pass then sees no MD&A/risk text and skips with no error.
  // So we validate the bodies exist and fall through to a full re-parse if not.
  const cachedMeta = await getSecFilingMeta<FilingMeta>(found.accession);
  if (cachedMeta && (await sectionBodiesPresent(cachedMeta))) {
    return {
      meta: cachedMeta,
      getSection: (id) => getSecSection<string>(found.accession, id),
    };
  }

  const html = await fetchFilingHtml(cik, found.accession, found.primaryDoc);
  const items = itemsForForm(form);
  const result: ParseResult = parseFiling(html, items);

  // Persist each section body individually, then write the meta. Order matters:
  // bodies first, meta last, so a cache hit on the meta implies the bodies are
  // already written (and the presence check above guards the inverse).
  for (const s of result.sections) {
    await putSecSection<string>(found.accession, s.id, s.body);
  }

  const meta: FilingMeta = {
    ticker: ref.ticker.toUpperCase(),
    cik,
    accession: found.accession,
    form,
    filingDate: found.filingDate,
    primaryDocument: found.primaryDoc,
    parsedAt: new Date().toISOString(),
    cleanedTextLength: result.cleanedTextLength,
    sections: result.sections.map((s: ExtractedSection) => ({
      id: s.id,
      label: s.label,
      itemNumber: s.itemNumber,
      charLength: s.charLength,
      confidence: s.confidence,
      warnings: s.warnings,
      bundled: s.bundled,
      chosenAnchor: { text: s.chosenAnchor.text, score: s.chosenAnchor.score, signals: s.chosenAnchor.signals },
    })),
    parserWarnings: result.parserWarnings,
    missing: result.missing,
  };
  await putSecFilingMeta(found.accession, meta);

  return {
    meta,
    getSection: (id) => getSecSection<string>(found.accession, id),
  };
}

// Public API: fetch latest DEF 14A (proxy). Returns the raw cleaned text
// since proxy statements don't follow the Item-N structure of 10-K/Q. The
// primary-source value-checklist's insider-alignment dimension will run
// against this text directly.
export async function fetchLatestProxy(ticker: string): Promise<{
  ticker: string;
  cik: string;
  accession: string;
  filingDate: string;
  cleanedText: string;
} | null> {
  const cik = await tickerToCik(ticker);
  const sub = await fetchSubmissions(cik);
  const found = findLatestFiling(sub, 'DEF 14A');
  if (!found) return null;

  // Cache the cleaned text under sec/<accession>_proxy
  const cached = await getSecSection<string>(found.accession, 'proxy');
  if (cached) {
    return {
      ticker: ticker.toUpperCase(),
      cik,
      accession: found.accession,
      filingDate: found.filingDate,
      cleanedText: cached,
    };
  }

  const html = await fetchFilingHtml(cik, found.accession, found.primaryDoc);
  // For proxies we don't currently extract sections; the value-checklist
  // pass will be given the whole proxy as a single corpus and must cite by
  // search-snippet rather than by section name. This is good-enough for
  // Weekend 1; Weekend 2's primary-source pass can refine.
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  $('script, style, head, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  await putSecSection<string>(found.accession, 'proxy', text);
  return {
    ticker: ticker.toUpperCase(),
    cik,
    accession: found.accession,
    filingDate: found.filingDate,
    cleanedText: text,
  };
}

// ---------------------------------------------------------------------------
// Multi-filing discovery and 8-K support
//
// Everything above answers "give me the LATEST 10-K/10-Q for this ticker",
// which is the right shape for on-demand vetting of one company. The
// short-side scanner asks a different question — "what has this company filed
// since I last looked, and which of those do I need to read?" — so it needs
// listing rather than latest-only, and it needs 8-K, whose structure the
// Item-N parser above does not model.
// ---------------------------------------------------------------------------

export type FilingRef = {
  ticker: string;
  cik: string;
  accession: string;
  form: string;
  filingDate: string;
  primaryDocument: string;
};

export type ListFilingsOptions = {
  /** Forms to include. Matches amendments too: '10-K' also matches '10-K/A'. */
  forms: string[];
  /** Inclusive lower bound on filing date, 'YYYY-MM-DD'. */
  since?: string;
  /** Cap on returned filings, newest first. */
  limit?: number;
};

function formMatchesAny(form: string, wanted: string[]): boolean {
  const f = form.toUpperCase();
  return wanted.some((w) => {
    const W = w.toUpperCase();
    return f === W || f.startsWith(`${W}/`);
  });
}

/**
 * List a company's filings, newest first.
 *
 * Backed by the submissions API's `filings.recent` block, which covers roughly
 * the last 1,000 filings or one year, whichever is smaller. That is ample for
 * incremental "since my last sweep" polling and NOT sufficient for deep
 * history — for backfill, walk the daily indexes in `edgar-index.ts` instead.
 */
export async function listFilings(
  ticker: string,
  opts: ListFilingsOptions,
): Promise<FilingRef[]> {
  const cik = await tickerToCik(ticker);
  const sub = await fetchSubmissions(cik);
  const r = sub.filings.recent;
  const out: FilingRef[] = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i]!;
    const filingDate = r.filingDate[i]!;
    if (!formMatchesAny(form, opts.forms)) continue;
    if (opts.since && filingDate < opts.since) continue;
    out.push({
      ticker: ticker.toUpperCase(),
      cik,
      accession: r.accessionNumber[i]!,
      form,
      filingDate,
      primaryDocument: r.primaryDocument[i]!,
    });
  }
  out.sort((a, b) => (a.filingDate < b.filingDate ? 1 : a.filingDate > b.filingDate ? -1 : 0));
  return opts.limit ? out.slice(0, opts.limit) : out;
}

type DirectoryListing = {
  directory: { item: Array<{ name: string; type?: string; size?: string }> };
};

export type FilingExhibit = { name: string; html: string };

/**
 * Fetch a filing's EX-99 exhibits.
 *
 * This matters most for 8-K Item 2.02: the body routinely says nothing but
 * "the press release is furnished as Exhibit 99.1", and every number lives in
 * the exhibit. Analyzing the body alone would find an empty filing.
 *
 * Selection is by filename convention (`ex99`, `ex-99`, `exhibit99`) rather
 * than by declared exhibit type, because the directory listing does not carry
 * the type. That catches the overwhelming majority; a filer using an
 * idiosyncratic name yields no exhibit rather than a wrong one.
 */
export async function fetchExhibits(
  cik: string,
  accession: string,
  opts: { maxExhibits?: number } = {},
): Promise<FilingExhibit[]> {
  const dir = filingDirUrl(cik, accession);
  let listing: DirectoryListing;
  try {
    listing = await secFetchJson<DirectoryListing>(`${dir}/index.json`);
  } catch {
    return [];
  }
  const names = (listing.directory?.item ?? [])
    .map((i) => i.name)
    .filter((n) => /ex-?(hibit)?-?99/i.test(n) && /\.(htm|html|txt)$/i.test(n))
    .sort();
  const out: FilingExhibit[] = [];
  for (const name of names.slice(0, opts.maxExhibits ?? 3)) {
    try {
      out.push({ name, html: await secFetchText(`${dir}/${name}`) });
    } catch {
      // A single unreadable exhibit shouldn't sink the filing.
    }
  }
  return out;
}

export type EightKFiling = {
  ref: FilingRef;
  parsed: ParsedEightK;
  exhibits: FilingExhibit[];
  /** Body + exhibits, markdown-rendered. What the local model actually reads. */
  fullText: string;
};

/**
 * Fetch and parse one 8-K, including its EX-99 exhibits.
 *
 * Cached by accession like the 10-K path: 8-Ks are immutable once filed, so a
 * cache hit is always safe.
 */
export async function fetchEightK(ref: FilingRef): Promise<EightKFiling> {
  const cached = await getSecSection<EightKFiling>(ref.accession, '8k');
  if (cached) return cached;

  const html = await fetchFilingHtml(ref.cik, ref.accession, ref.primaryDocument);
  const parsed = parseEightK(html);
  // Exhibits are only worth the extra requests when the 8-K actually points at
  // one. Item 9.01 is the exhibit index; 2.02 is the earnings release.
  const wantsExhibits = parsed.items.some((i) => i.number === '9.01' || i.number === '2.02');
  const exhibits = wantsExhibits ? await fetchExhibits(ref.cik, ref.accession) : [];

  const parts = [parsed.items.map((i) => i.body).join('\n\n')];
  for (const ex of exhibits) {
    parts.push(`\n\n--- EXHIBIT ${ex.name} ---\n\n${blocksToMarkdown(renderFilingLayout(ex.html))}`);
  }

  const result: EightKFiling = { ref, parsed, exhibits, fullText: parts.join('').trim() };
  // Don't persist raw exhibit HTML — it's large and re-derivable. The rendered
  // text in `fullText` is what downstream stages consume.
  await putSecSection<EightKFiling>(ref.accession, '8k', {
    ...result,
    exhibits: exhibits.map((e) => ({ name: e.name, html: '' })),
  });
  return result;
}

export type LayoutSection = {
  id: string;
  label: string;
  itemNumber: string;
  confidence: 'high' | 'low' | 'failed';
  /** Markdown with tables preserved, or the flat text when layout join failed. */
  markdown: string;
  /**
   * The section's layout blocks. Consumers that chunk or strip should use
   * these rather than re-parsing `markdown` — a markdown round trip loses the
   * heading/table/prose distinction that "never split a table" depends on.
   * Empty when the layout join failed (see `layoutDegraded`).
   */
  blocks: LayoutBlock[];
  /** True when we fell back to flat text — tables in here are run-on lines. */
  layoutDegraded: boolean;
};

/**
 * Fetch a 10-K/10-Q and return the requested sections rendered WITH layout.
 *
 * `fetchAndParseFiling` gives correct section boundaries but flat text.
 * `renderFilingLayout` gives correct structure but no section boundaries.
 * This composes them, and reports honestly (`layoutDegraded`) when the join
 * failed for a section rather than quietly serving run-on tables that the
 * local model will misread.
 */
export async function fetchFilingSectionsWithLayout(
  ticker: string,
  form: '10-K' | '10-Q',
  sectionIds: string[],
): Promise<{ meta: FilingMeta; sections: LayoutSection[] }> {
  return renderSections(await fetchAndParseFiling(ticker, form), sectionIds);
}

/** As above, for a specific filing rather than the latest of its form. */
export async function fetchFilingSectionsWithLayoutByRef(
  ref: FilingRef,
  sectionIds: string[],
): Promise<{ meta: FilingMeta; sections: LayoutSection[] }> {
  return renderSections(await parseFilingByRef(ref), sectionIds);
}

async function renderSections(
  parsed: { meta: FilingMeta; getSection: (id: string) => Promise<string | null> },
  sectionIds: string[],
): Promise<{ meta: FilingMeta; sections: LayoutSection[] }> {
  const { meta, getSection } = parsed;
  const html = await fetchFilingHtml(meta.cik, meta.accession, meta.primaryDocument);
  const blocks = renderFilingLayout(html);

  const sections: LayoutSection[] = [];
  for (const id of sectionIds) {
    const info = meta.sections.find((s) => s.id === id);
    if (!info) continue;
    const flat = await getSection(id);
    if (!flat) continue;
    const located = locateSectionBlocks(blocks, flat);
    sections.push({
      id,
      label: info.label,
      itemNumber: info.itemNumber,
      confidence: info.confidence,
      markdown: located ? blocksToMarkdown(located) : flat,
      blocks: located ?? [],
      layoutDegraded: located === null,
    });
  }
  return { meta, sections };
}
