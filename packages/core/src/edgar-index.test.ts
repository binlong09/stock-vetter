import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMasterIdx, isUsMarketHoliday } from './edgar-index.js';

test('US market holidays are recognized so the sweep skips their absent index', () => {
  const isHoliday = (s: string): boolean => isUsMarketHoliday(new Date(`${s}T00:00:00Z`));
  assert.equal(isHoliday('2026-06-19'), true, 'Juneteenth');
  assert.equal(isHoliday('2026-07-03'), true, 'Independence Day observed (Jul 4 is a Saturday → Fri)');
  assert.equal(isHoliday('2026-12-25'), true, 'Christmas');
  assert.equal(isHoliday('2026-01-19'), true, 'MLK Day, 3rd Mon Jan');
  assert.equal(isHoliday('2026-05-25'), true, 'Memorial Day, last Mon May');
  assert.equal(isHoliday('2026-11-26'), true, 'Thanksgiving, 4th Thu Nov');
  // Normal trading days are not holidays — 2026-07-29 is the day MSFT filed its
  // 10-K, which the sweep must not skip.
  assert.equal(isHoliday('2026-07-29'), false);
  assert.equal(isHoliday('2026-07-28'), false);
});

// Verbatim shape of a real master.<date>.idx, preamble included. Dates are
// YYYYMMDD (no dashes) as EDGAR actually publishes them — an earlier fixture
// used dashed dates and the parser silently rejected every real row.
const SAMPLE = `Description:           Master Index of EDGAR Dissemination Feed by Company Name
Last Data Received:    November 1, 2025
Comments:              webmaster@sec.gov

CIK|Company Name|Form Type|Date Filed|Filename
--------------------------------------------------------------------------------
320193|Apple Inc.|10-K|20251101|edgar/data/320193/0000320193-25-000073.txt
1045810|NVIDIA CORP|8-K|20251101|edgar/data/1045810/0001045810-25-000221.txt
789019|MICROSOFT CORP|10-Q/A|20251101|edgar/data/789019/0000789019-25-000104.txt
1018724|AMAZON COM INC|4|20251101|edgar/data/1018724/0001018724-25-000512.txt
`;

test('parses pipe-delimited rows and normalizes the YYYYMMDD date', () => {
  const rows = parseMasterIdx(SAMPLE);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], {
    cik: '0000320193',
    companyName: 'Apple Inc.',
    form: '10-K',
    filingDate: '2025-11-01', // normalized from 20251101
    accession: '0000320193-25-000073',
  });
});

test('CIK is zero-padded to 10 so it joins against FilingMeta.cik', () => {
  // The index gives an unpadded integer; submissions/FilingMeta use the padded
  // form. Comparing the two raw is how a universe filter silently matches
  // nothing.
  const rows = parseMasterIdx(SAMPLE);
  assert.equal(rows[1]!.cik, '0001045810');
  assert.ok(rows.every((r) => r.cik.length === 10));
});

test('amendment form types are preserved verbatim', () => {
  const rows = parseMasterIdx(SAMPLE);
  assert.equal(rows[2]!.form, '10-Q/A');
});

test('malformed and truncated lines are dropped, not thrown on', () => {
  const rows = parseMasterIdx('garbage\n||||\n123|X|8-K|not-a-date|edgar/data/1/x.txt\n');
  assert.deepEqual(rows, []);
});
