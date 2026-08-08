import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimBusinessSummary } from './market-screen.js';

test('a legal suffix period does not end the sentence', () => {
  // The single most common failure: nearly every summary opens with
  // "<Name>, Inc. provides…" — cutting at "Inc." would reduce every
  // description to a company name.
  const s = trimBusinessSummary(
    'PAR Technology Corp. provides point-of-sale software to restaurants. ' +
      'It operates through two segments. The company was founded in 1968.',
  );
  assert.equal(
    s,
    'PAR Technology Corp. provides point-of-sale software to restaurants. It operates through two segments.',
  );
});

test('takes at most two sentences', () => {
  const s = trimBusinessSummary('One. Two. Three. Four.');
  assert.equal(s, 'One. Two.');
});

test('a second sentence that blows the cap is dropped, keeping the first whole', () => {
  const s = trimBusinessSummary(`Short opener. ${'word '.repeat(100)}end.`, 80);
  assert.equal(s, 'Short opener.');
});

test('a single run-on sentence with no boundary is hard-capped', () => {
  const s = trimBusinessSummary('word '.repeat(100), 60);
  assert.ok(s!.length <= 60);
  assert.ok(s!.endsWith('…'));
});

test('whitespace is normalized and empty input maps to null', () => {
  assert.equal(trimBusinessSummary('  Designs\n\nchips.  '), 'Designs chips.');
  assert.equal(trimBusinessSummary(''), null);
  assert.equal(trimBusinessSummary('   '), null);
  assert.equal(trimBusinessSummary(null), null);
  assert.equal(trimBusinessSummary(undefined), null);
});

test('decimals and mid-word periods do not split sentences', () => {
  const s = trimBusinessSummary('Revenue grew 3.5x on chips.example demand. Second sentence here.');
  assert.equal(s, 'Revenue grew 3.5x on chips.example demand. Second sentence here.');
});
