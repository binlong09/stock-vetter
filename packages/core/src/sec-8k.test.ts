import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEightK, criticalItems } from './sec-8k.js';

const RESTATEMENT_8K = `<html><body>
<div style="font-weight:700">UNITED STATES SECURITIES AND EXCHANGE COMMISSION</div>
<div style="font-weight:700">Item 4.02 Non-Reliance on Previously Issued Financial Statements or a Related Audit Report or Completed Interim Review.</div>
<div>On March 3, 2026, the Audit Committee of the Board of Directors of the Company concluded that the Company's previously issued consolidated financial statements for the fiscal years ended December 31, 2024 and 2023 should no longer be relied upon because of errors in the recognition of revenue for certain distributor arrangements.</div>
<div style="font-weight:700">Item 9.01 Financial Statements and Exhibits.</div>
<div>(d) Exhibits. 99.1 Press Release dated March 3, 2026.</div>
</body></html>`;

test('items are split on their own numbered headings', () => {
  const parsed = parseEightK(RESTATEMENT_8K);
  assert.deepEqual(parsed.items.map((i) => i.number), ['4.02', '9.01']);
});

test('item body carries the disclosure text, not just the heading', () => {
  const parsed = parseEightK(RESTATEMENT_8K);
  const item = parsed.items.find((i) => i.number === '4.02')!;
  assert.match(item.body, /should no longer be relied upon/);
  // The next item's text must NOT bleed into this one.
  assert.doesNotMatch(item.body, /Press Release dated/);
});

test('a restatement is flagged critical with no model in the loop', () => {
  const parsed = parseEightK(RESTATEMENT_8K);
  // This is the point of the deterministic tier: Item 4.02 means the company
  // is withdrawing its own numbers, and no amount of soothing narrative in the
  // body should be able to talk the pipeline down from escalating.
  assert.equal(parsed.maxSeverity, 'critical');
  assert.deepEqual(criticalItems(parsed).map((i) => i.number), ['4.02']);
  assert.match(parsed.items[0]!.shortSideNote!, /restatement/i);
});

test('cross-references in prose do not open spurious items', () => {
  const html = `<html><body>
    <div style="font-weight:700">Item 2.02 Results of Operations and Financial Condition.</div>
    <div>On February 1, 2026 the Company issued a press release. The information in this Item 2.02, including the exhibit referenced under Item 9.01 below, is furnished and shall not be deemed filed for purposes of Section 18 of the Securities Exchange Act of 1934, and the disclosure requirements of Item 9.01 are addressed there.</div>
  </body></html>`;
  const parsed = parseEightK(html);
  // Only the real heading opens an item; the two mentions of 9.01 inside a
  // long paragraph must not.
  assert.deepEqual(parsed.items.map((i) => i.number), ['2.02']);
});

test('unrecognized item numbers parse but stay low severity', () => {
  const html = `<html><body><div style="font-weight:700">Item 6.05 Some Newly Added Item.</div>
    <div>Details follow.</div></body></html>`;
  const parsed = parseEightK(html);
  assert.deepEqual(parsed.unknownItems, ['6.05']);
  assert.equal(parsed.maxSeverity, 'low');
});

test('an 8-K with tables keeps them as tables', () => {
  const html = `<html><body>
    <div style="font-weight:700">Item 2.02 Results of Operations and Financial Condition.</div>
    <table>
      <tr><td></td><td>Q4 2025</td><td>Q4 2024</td></tr>
      <tr><td>Revenue</td><td>$</td><td>1,204.5</td></tr>
    </table>
  </body></html>`;
  const parsed = parseEightK(html);
  assert.match(parsed.items[0]!.body, /\| Revenue \|/);
});
