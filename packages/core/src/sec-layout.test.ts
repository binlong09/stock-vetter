// Tests for the layout-preserving renderer.
//
// The HTML below reproduces the conventions real SEC filers actually emit, as
// observed in this repo's own fixtures: currency symbols and the closing paren
// of a negative each in their own <td>, empty spacer columns between every
// data column, stacked header rows, inline `font-weight:700` headings instead
// of <h*> tags, and layout tables holding prose.
//
// EDGAR is not reachable from CI, so this is the contract. Re-run
// `scripts/verify-layout.ts <TICKER>` against a live filing on a machine with
// EDGAR access before trusting a change to the renderer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFilingLayout, locateSectionBlocks, blocksToMarkdown } from './sec-layout.js';

const INCOME_STATEMENT_HTML = `
<html><body>
<div style="font-weight:700">ITEM 8. FINANCIAL STATEMENTS AND SUPPLEMENTARY DATA</div>
<div>The following consolidated statements should be read with the accompanying notes.</div>
<table>
  <tr>
    <td></td><td colspan="8">Year Ended December 31,</td>
  </tr>
  <tr>
    <td></td><td></td><td>2025</td><td></td><td></td><td>2024</td><td></td><td></td><td>2023</td>
  </tr>
  <tr>
    <td>Net Sales</td><td></td><td>$</td><td>6,203.2</td><td></td><td>$</td><td>6,107.1</td><td>$</td><td>5,867.9</td>
  </tr>
  <tr>
    <td>Cost of sales</td><td></td><td></td><td>3,428.4</td><td></td><td></td><td>3,317.0</td><td></td><td>3,279.4</td>
  </tr>
  <tr>
    <td>Interest expense</td><td></td><td>(</td><td>95.2</td><td>)</td><td>(</td><td>95.0</td><td>)</td><td>(110.9)</td>
  </tr>
</table>
<div style="font-weight:700">NOTE 1 &#8212; SIGNIFICANT ACCOUNTING POLICIES</div>
<div>Revenue is recognized when control transfers to the customer.</div>
</body></html>`;

test('table cells keep their column identity instead of collapsing to a run-on line', () => {
  const blocks = renderFilingLayout(INCOME_STATEMENT_HTML);
  const table = blocks.find((b) => b.kind === 'table');
  assert.ok(table, 'expected a table block');

  const dataRow = table.rows!.find((r) => r[0] === 'Net Sales');
  assert.ok(dataRow, 'expected the Net Sales row');
  // The spacer columns are gone and each year is its own cell — this is the
  // whole point. Flat-text parsing gives "Net Sales $ 6,203.2 $ 6,107.1 ...".
  assert.deepEqual(dataRow, ['Net Sales', '$6,203.2', '$6,107.1', '$5,867.9']);
});

test('orphaned $ and ) cells are folded into the number they belong to', () => {
  const blocks = renderFilingLayout(INCOME_STATEMENT_HTML);
  const table = blocks.find((b) => b.kind === 'table')!;
  const row = table.rows!.find((r) => r[0] === 'Interest expense');
  // Both the split form ( / 95.2 / ) and the already-joined form (110.9)
  // must land on the same representation.
  assert.deepEqual(row, ['Interest expense', '(95.2)', '(95.0)', '(110.9)']);
});

test('period columns survive as a header row, with the spanning caption lifted above', () => {
  const blocks = renderFilingLayout(INCOME_STATEMENT_HTML);
  const table = blocks.find((b) => b.kind === 'table')!;
  const lines = table.markdown.split('\n');
  // "Year Ended December 31," spanned the whole table, so it is a caption, not
  // a column header. Forcing it into the header would strand it over column 1.
  assert.equal(lines[0], 'Year Ended December 31,');
  // The year row is entirely numeric; a naive "row contains a number ⇒ data"
  // test loses it, and with it every column's identity.
  assert.equal(lines[2], '|  | 2025 | 2024 | 2023 |');
  // Header gained a blank leading cell to line up with the label column.
  assert.match(lines[4]!, /^\| Net Sales \| \$6,203\.2 \|/);
});

test('markdown table is well-formed with a consistent column count', () => {
  const blocks = renderFilingLayout(INCOME_STATEMENT_HTML);
  const table = blocks.find((b) => b.kind === 'table')!;
  // Caption lines sit above the grid and aren't pipe rows; only grade the grid.
  const gridLines = table.markdown.split('\n').filter((l) => l.startsWith('|'));
  const widths = new Set(gridLines.map((l) => l.split('|').length));
  assert.equal(widths.size, 1, `ragged table:\n${table.markdown}`);
  assert.match(gridLines[1]!, /^\|( ---( \||$))+/, 'expected a separator row');
});

test('bold and all-caps lines are classified as headings', () => {
  const blocks = renderFilingLayout(INCOME_STATEMENT_HTML);
  const headings = blocks.filter((b) => b.kind === 'heading').map((b) => b.text);
  assert.ok(headings.some((h) => h.startsWith('ITEM 8.')));
  assert.ok(headings.some((h) => h.startsWith('NOTE 1')));
  const paras = blocks.filter((b) => b.kind === 'para').map((b) => b.text);
  assert.ok(paras.some((p) => p.startsWith('The following consolidated')));
});

test('nested layout tables do not steal the outer table rows', () => {
  const html = `<html><body><table><tr><td>Outer</td><td>1.0</td></tr>
    <tr><td><table><tr><td>Inner</td><td>2.0</td></tr></table></td><td>3.0</td></tr></table></body></html>`;
  const blocks = renderFilingLayout(html);
  const tables = blocks.filter((b) => b.kind === 'table');
  const outer = tables.find((t) => t.rows!.some((r) => r[0] === 'Outer'));
  assert.ok(outer);
  // The inner table's row must not appear as a row of the outer table.
  assert.ok(!outer.rows!.some((r) => r[0] === 'Inner'), 'inner row leaked into outer table');
});

test('locateSectionBlocks maps a parseFiling section body onto layout blocks', () => {
  const blocks = renderFilingLayout(INCOME_STATEMENT_HTML);
  // Simulates what parseFiling hands us: fully collapsed, whitespace-flattened
  // text spanning the section. Note the whitespace does NOT match the layout
  // rendering — that's exactly the mismatch the join has to survive.
  const flat =
    'ITEM 8. FINANCIAL STATEMENTS AND SUPPLEMENTARY DATA The following consolidated ' +
    'statements should be read with the accompanying notes. Year Ended December 31, ' +
    '2025 2024 2023 Net Sales $ 6,203.2 $ 6,107.1 $ 5,867.9 Cost of sales 3,428.4 ' +
    '3,317.0 3,279.4 Interest expense ( 95.2 ) ( 95.0 ) (110.9) NOTE 1 — SIGNIFICANT ' +
    'ACCOUNTING POLICIES Revenue is recognized when control transfers to the customer.';
  const located = locateSectionBlocks(blocks, flat);
  assert.ok(located, 'section should be locatable');
  assert.ok(located.some((b) => b.kind === 'table'), 'located range should include the table');
  assert.match(blocksToMarkdown(located), /Net Sales/);
});

test('locateSectionBlocks returns null rather than guessing when text is absent', () => {
  const blocks = renderFilingLayout(INCOME_STATEMENT_HTML);
  assert.equal(
    locateSectionBlocks(blocks, 'This paragraph appears nowhere in the filing whatsoever and is long enough to probe.'),
    null,
  );
});

test('prose-only layout tables are not given a fabricated header row', () => {
  const html = `<html><body><table><tr><td>We compete on brand strength.</td></tr>
    <tr><td>Our results depend on retail partners.</td></tr></table></body></html>`;
  const table = renderFilingLayout(html).find((b) => b.kind === 'table')!;
  // No numeric rows anywhere, so treating row 1 as a header would silently
  // delete a sentence from the filing.
  assert.equal(table.rows!.length, 2);
  assert.match(table.markdown, /We compete on brand strength/);
  assert.match(table.markdown, /Our results depend on retail partners/);
});
