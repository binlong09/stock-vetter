// Layout-preserving rendering of SEC filing HTML.
//
// WHY THIS EXISTS. `sec-parser.ts` builds its section bodies from
// `$('body').text().replace(/\s+/g, ' ')`, which is exactly right for its job
// (anchor-scoring and cheap keyword search) but destroys table structure. A
// real income statement comes out of it looking like:
//
//   Net Sales $ 6,203.2 $ 6,107.1 $ 5,867.9 Cost of sales 3,428.4 3,317.0 ...
//
// Three unlabeled year columns in a run-on line, with the header row that said
// which year is which stranded hundreds of characters away. That is survivable
// for a frontier model with a big context and lots of reasoning budget; it is
// NOT survivable for a local 30B-class model asked to emit structured YoY
// deltas. It will bind numbers to the wrong period, and every downstream
// aggregate inherits the error silently.
//
// So this module re-renders the same HTML into an ordered list of blocks where
// tables stay tables (rendered as markdown pipe tables, headers intact) and
// prose stays prose. The chunker consumes blocks, which is what makes
// "never split a table" expressible at all.
//
// This module does NOT replace `parseFiling`. It runs alongside it:
// `parseFiling` decides WHERE Item 7 and Item 8 start and end; this decides
// what the text inside those boundaries looks like. `locateSectionBlocks`
// joins the two.

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

// cheerio's node types come from `domhandler`, which isn't a direct dependency.
// `sec-parser.ts` uses `any` at DOM boundaries for the same reason; match it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DomNode = any;

export type LayoutBlock = {
  kind: 'heading' | 'para' | 'table';
  /** Collapsed plain text. For tables, cells joined by spaces — this is what
   *  matches `parseFiling`'s section bodies, and what keyword search indexes. */
  text: string;
  /** What we actually feed a model. Identical to `text` for prose; a markdown
   *  pipe table for tables. */
  markdown: string;
  /** Tables only: the cleaned cell grid, for callers that want to do numeric
   *  work without re-parsing markdown. */
  rows?: string[][];
};

// Tags that force a block boundary. `tr`/`td` are deliberately absent: tables
// are captured whole by `renderTable`, never walked as generic blocks.
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'center', 'dd', 'div',
  'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p',
  'pre', 'section', 'ul',
]);

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function collapse(s: string): string {
  // Non-breaking space is pervasive in SEC HTML and is NOT matched by \s in
  // older engines; normalize it explicitly before collapsing.
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function styleIsBold(style: string): boolean {
  const m = style.match(/font-weight\s*:\s*(\d+|bold)/i);
  if (!m) return false;
  return m[1]!.toLowerCase() === 'bold' || parseInt(m[1]!, 10) >= 600;
}

// A short line that is bold, all-caps, or an <h*> reads as a heading. Headings
// matter to the chunker: it prefers to break immediately BEFORE one, so a
// chunk starts at a topic boundary rather than mid-thought.
function isHeadingLike($: CheerioAPI, el: DomNode, text: string): boolean {
  if (!text || text.length > 200) return false;
  const tag = (el?.tagName ?? '').toLowerCase();
  if (HEADING_TAGS.has(tag)) return true;
  const style = ($(el).attr('style') ?? '').replace(/\s+/g, ' ');
  if (styleIsBold(style)) return true;
  let boldChild = false;
  $(el)
    .find('[style]')
    .each((_, c) => {
      if (styleIsBold(($(c).attr('style') ?? '').replace(/\s+/g, ' '))) {
        boldChild = true;
        return false;
      }
      return undefined;
    });
  if (boldChild) return true;
  // All-caps with at least one letter, e.g. "OVERVIEW", "NOTE 12 — INCOME TAXES".
  return text === text.toUpperCase() && /[A-Z]/.test(text);
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

// SEC filers lay numbers out with the currency symbol, the parenthesis of a
// negative, and the percent sign each in their OWN <td>, padded by empty
// spacer columns. A raw cell-by-cell read of one income-statement line gives:
//
//   ['Interest expense', '', '$', '(', '95.2', ')', '', '$', '(', '95.0', ')']
//
// We want ['Interest expense', '$(95.2)', '$(95.0)']. `mergeDecorations`
// folds the orphan symbols into their neighbours and `dropEmptyColumns`
// removes the spacers.
const DECOR_LEADING = new Set(['$', '(', '$(']);
const DECOR_TRAILING = new Set([')', '%', ')%']);

// Merge decorations and drop the spacers in one pass, per row.
//
// We deliberately do NOT try to preserve cross-row column indices. Filers are
// not consistent about it: a data row spends three <td>s on "$", "6,203.2", ""
// while the header row above spends one on "2025" (or spans them with a
// colspan, or not). Any scheme that keys off the source column index is
// fitting noise. Compacting each row to its non-empty cells and reconciling
// widths afterwards is what actually survives real filings.
//
// The one thing this trades away: a data cell that is genuinely blank
// mid-row shifts left. In practice filers write an em-dash or "-" for a
// nil value rather than leaving the cell empty, so this is rare — and a
// shifted cell is visible in the output, where a mis-merged "$" is not.
function compactRow(cells: string[]): string[] {
  const out: string[] = [];
  let pendingPrefix = '';
  for (const raw of cells) {
    const cell = raw.trim();
    if (cell === '') continue;
    if (DECOR_LEADING.has(cell)) {
      pendingPrefix += cell;
      continue;
    }
    if (DECOR_TRAILING.has(cell)) {
      if (out.length) out[out.length - 1] = out[out.length - 1]! + cell;
      else out.push(cell);
      continue;
    }
    out.push(pendingPrefix + cell);
    pendingPrefix = '';
  }
  // A prefix with nothing to attach to (a lone "$" column) is dropped, not
  // emitted as a bare "$" cell.
  return out;
}

function cellIsNumeric(c: string): boolean {
  return /\d/.test(c) && /^[$(\s]*-?[\d,.]+[)%\s]*$/.test(c);
}

// A data row is a labelled row of figures: a text label in column 0 and at
// least one number after it. Testing "does the row contain a number" instead
// would misread the period header — "2025 | 2024 | 2023" is entirely numeric,
// and calling it data is how the column names get lost.
function rowIsData(row: string[]): boolean {
  if (row.length < 2) return false;
  if (cellIsNumeric(row[0]!)) return false;
  return row.slice(1).some(cellIsNumeric);
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function renderTable($: CheerioAPI, tableEl: DomNode): LayoutBlock {
  const $table = $(tableEl);
  const rows: string[][] = [];

  $table.find('tr').each((_, tr) => {
    // A nested <table> inside a cell produces its own <tr>s; those belong to
    // the inner table, not this one. Skip any row whose nearest table ancestor
    // isn't us — the inner table gets rendered when we reach it as a block.
    if ($(tr).closest('table')[0] !== tableEl) return;
    const cells: string[] = [];
    $(tr)
      .children('td, th')
      .each((__, td) => {
        cells.push(collapse($(td).text()));
      });
    const compact = compactRow(cells);
    if (compact.length) rows.push(compact);
  });

  if (!rows.length) return { kind: 'table', text: '', markdown: '', rows: [] };

  // Leading non-numeric rows are headers. SEC tables routinely stack two or
  // three ("Year Ended December 31," above "2025 2024 2023"). Cap at 3 so a
  // long prose-in-a-table block doesn't become all header.
  let headerCount = 0;
  while (headerCount < Math.min(3, rows.length) && !rowIsData(rows[headerCount]!)) {
    headerCount++;
  }
  // If nothing after the candidate headers is actually data, this is prose
  // laid out in a table — which SEC filers do constantly. Promoting rows to a
  // header would silently delete sentences from the filing.
  if (!rows.slice(headerCount).some(rowIsData)) headerCount = 0;

  // A header row holding a single cell is a caption spanning the whole table
  // ("Year Ended December 31,", "(in millions, except per share amounts)").
  // It is not a column header, and forcing it into one strands the label over
  // column 1. Lift it above the table instead, where it stays attached — the
  // chunker never splits a table, so the caption always travels with its rows.
  const headerRows = rows.slice(0, headerCount);
  const captions = headerRows.filter((r) => r.length === 1).map((r) => r[0]!);
  const columnHeaderRows = headerRows.filter((r) => r.length > 1);
  const dataRows = rows.slice(headerCount);

  // Stacked multi-cell header rows merge positionally: "2025" under "Q3" reads
  // as "Q3 2025".
  let header: string[] = [];
  if (columnHeaderRows.length) {
    const hw = columnHeaderRows.reduce((m, r) => Math.max(m, r.length), 0);
    header = Array.from({ length: hw }, (_, i) =>
      columnHeaderRows.map((r) => r[i] ?? '').filter(Boolean).join(' '),
    );
  }

  const dataWidth = dataRows.reduce((m, r) => Math.max(m, r.length), 0);
  // The header almost always omits a cell for the row-label column: the data
  // says "Net Sales | 6,203.2 | 6,107.1" while the header says "2025 | 2024".
  // One short = prepend a blank label column. More than one short is a table
  // we don't understand; pad on the right and leave it visibly ragged rather
  // than inventing an alignment.
  if (header.length && dataWidth - header.length === 1) header = ['', ...header];

  const width = Math.max(dataWidth, header.length);
  const pad = (r: string[]): string =>
    `| ${Array.from({ length: width }, (_, i) => escapePipes(r[i] ?? '')).join(' | ')} |`;

  const lines: string[] = [];
  lines.push(pad(header.length ? header : []));
  lines.push(`| ${Array.from({ length: width }, () => '---').join(' | ')} |`);
  for (const r of dataRows) lines.push(pad(r));

  const tableMd = lines.join('\n');
  const markdown = captions.length ? `${captions.join('\n')}\n\n${tableMd}` : tableMd;
  // `text` mirrors what parseFiling's flat rendering produces for this table,
  // so `locateSectionBlocks` can still match it. Built from `rows`, which
  // already contains the caption row — prepending `captions` here would
  // duplicate it and break the join.
  const text = rows.map((r) => r.join(' ')).join(' ');

  return { kind: 'table', text, markdown, rows };
}

// ---------------------------------------------------------------------------
// Document walk
// ---------------------------------------------------------------------------

/**
 * Render filing HTML into ordered layout blocks. Prose blocks carry collapsed
 * text; tables carry a markdown pipe table with their header rows intact.
 */
export function renderFilingLayout(html: string): LayoutBlock[] {
  const $ = cheerio.load(html);
  $('script, style, head, noscript').remove();
  const blocks: LayoutBlock[] = [];
  let pending = '';

  const flush = (el: DomNode | null): void => {
    const text = collapse(pending);
    pending = '';
    if (!text) return;
    const kind = el && isHeadingLike($, el, text) ? 'heading' : 'para';
    blocks.push({ kind, text, markdown: text });
  };

  const walk = (node: DomNode, blockOwner: DomNode | null): void => {
    for (const child of node.childNodes ?? []) {
      if (child.type === 'text') {
        pending += child.data ?? '';
        continue;
      }
      if (child.type !== 'tag') continue;
      const tag = (child.name ?? '').toLowerCase();
      if (tag === 'table') {
        flush(blockOwner);
        const t = renderTable($, child);
        if (t.text) blocks.push(t);
        continue;
      }
      if (tag === 'br') {
        pending += ' ';
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        // Text accumulated so far belongs to the enclosing block, not this one.
        flush(blockOwner);
        walk(child, child);
        // ...and whatever this element contributed directly is its own block.
        flush(child);
        continue;
      }
      // Inline element (span, b, a, font, ...): keep accumulating.
      walk(child, blockOwner);
    }
  };

  const body = $('body')[0];
  if (body) walk(body, body);
  flush(null);
  return blocks;
}

// ---------------------------------------------------------------------------
// Joining layout blocks back to parseFiling's section boundaries
// ---------------------------------------------------------------------------

// `parseFiling` and `renderFilingLayout` read the same text nodes in the same
// order, but they differ in whitespace (the layout walk inserts block
// boundaries where the flat walk did not). Matching on a whitespace- and
// punctuation-insensitive key makes the join immune to that difference.
function searchKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Given the full block list and one section body from `parseFiling`, return
 * the blocks covering that section.
 *
 * Returns null when the section can't be located — a real possibility for
 * odd filers — so callers can fall back to the flat section text rather than
 * silently analyzing the wrong range. Never guesses.
 */
export function locateSectionBlocks(
  blocks: LayoutBlock[],
  sectionBody: string,
): LayoutBlock[] | null {
  if (!sectionBody.trim()) return null;

  // Concatenated normalized text, with a parallel array recording where each
  // block starts, so a hit maps back to a block index.
  const starts: number[] = [];
  let norm = '';
  for (const b of blocks) {
    starts.push(norm.length);
    norm += searchKey(b.text);
  }

  // Probe with the section's opening. 200 normalized chars is long enough to
  // be unique in a filing and short enough to survive a boundary difference.
  const head = searchKey(sectionBody).slice(0, 200);
  const tailSource = searchKey(sectionBody);
  if (head.length < 40) return null;

  const startChar = norm.indexOf(head);
  if (startChar === -1) return null;

  const tail = tailSource.slice(-200);
  let endChar = tail.length >= 40 ? norm.indexOf(tail, startChar) : -1;
  endChar = endChar === -1 ? startChar + tailSource.length : endChar + tail.length;

  // Map char offsets to block indices: first block whose start is <= startChar
  // (so a section beginning mid-block still includes that block), through the
  // last block that begins before endChar.
  let first = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! <= startChar) first = i;
    else break;
  }
  let last = first;
  for (let i = first; i < starts.length; i++) {
    if (starts[i]! < endChar) last = i;
    else break;
  }
  return blocks.slice(first, last + 1);
}

/** Blocks → the string we actually hand a model. */
export function blocksToMarkdown(blocks: LayoutBlock[]): string {
  return blocks.map((b) => b.markdown).join('\n\n');
}
