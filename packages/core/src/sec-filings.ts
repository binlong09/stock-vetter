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

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? 'stock-vetter (https://example.com / contact@example.com)';

export type FilingForm = '10-K' | '10-Q' | 'DEF 14A';

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

async function tickerToCik(ticker: string): Promise<string> {
  if (_tickerToCikCache) {
    const v = _tickerToCikCache.get(ticker.toUpperCase());
    if (v) return v;
    throw new Error(`ticker not found: ${ticker}`);
  }
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_USER_AGENT },
  });
  if (!res.ok) throw new Error(`SEC ticker list fetch failed: ${res.status}`);
  const json = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  const map = new Map<string, string>();
  for (const v of Object.values(json)) {
    map.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, '0'));
  }
  _tickerToCikCache = map;
  const cik = map.get(ticker.toUpperCase());
  if (!cik) throw new Error(`ticker not found: ${ticker}`);
  return cik;
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
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } });
  if (!res.ok) throw new Error(`SEC submissions fetch failed: ${res.status}`);
  return (await res.json()) as SubmissionsResponse;
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

async function fetchFilingHtml(cik: string, accession: string, primaryDoc: string): Promise<string> {
  const accNoDash = accession.replace(/-/g, '');
  const cikInt = String(parseInt(cik, 10));
  const url = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/${primaryDoc}`;
  const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } });
  if (!res.ok) throw new Error(`filing fetch failed: ${res.status} (${url})`);
  return await res.text();
}

function itemsForForm(form: FilingForm): ItemDef[] {
  if (form === '10-K') return TENK_ITEMS;
  if (form === '10-Q') return TENQ_ITEMS;
  // DEF 14A doesn't use the Item N. structure — proxy statements have their
  // own conventions. Return empty so the parser falls back to no extraction;
  // we'll handle DEF 14A separately with a dedicated parser path.
  return [];
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
  const found = findLatestFiling(sub, form);
  if (!found) throw new Error(`no ${form} found for ${ticker}`);

  const cachedMeta = await getSecFilingMeta<FilingMeta>(found.accession);
  if (cachedMeta) {
    return {
      meta: cachedMeta,
      getSection: (id) => getSecSection<string>(found.accession, id),
    };
  }

  const html = await fetchFilingHtml(cik, found.accession, found.primaryDoc);
  const items = itemsForForm(form);
  const result: ParseResult = parseFiling(html, items);

  // Persist each section body individually, then write the meta.
  for (const s of result.sections) {
    await putSecSection<string>(found.accession, s.id, s.body);
  }

  const meta: FilingMeta = {
    ticker: ticker.toUpperCase(),
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
