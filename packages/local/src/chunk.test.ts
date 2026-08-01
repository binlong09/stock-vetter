import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LayoutBlock } from '@stock-vetter/core';
import { chunkBlocks, chunkBodyOnly, OVERLAP_MARKER, OVERLAP_END_MARKER, TABLE_SPLIT_MARKER } from './chunk.js';
import { estimateTokens } from './tokens.js';

const SOURCE = {
  ticker: 'TEST',
  cik: '0000000001',
  accession: '0000000001-26-000001',
  form: '10-K',
  filingDate: '2026-02-12',
  sectionId: 'financial-statements',
  sectionLabel: 'Financial Statements',
};

function para(text: string): LayoutBlock {
  return { kind: 'para', text, markdown: text };
}
function heading(text: string): LayoutBlock {
  return { kind: 'heading', text, markdown: text };
}
function table(rowCount: number): LayoutBlock {
  const lines = ['|  | 2025 | 2024 |', '| --- | --- | --- |'];
  for (let i = 0; i < rowCount; i++) lines.push(`| Line item ${i} | ${1000 + i}.0 | ${900 + i}.0 |`);
  const md = lines.join('\n');
  return { kind: 'table', text: md.replace(/\|/g, ' '), markdown: md, rows: [] };
}

// ~120 tokens of filler prose.
const FILLER = 'The Company recorded revenue growth driven by volume and pricing across its segments. '.repeat(8);

test('a table is never split across chunks when it fits', () => {
  const blocks: LayoutBlock[] = [];
  for (let i = 0; i < 12; i++) blocks.push(para(FILLER));
  blocks.push(table(10));
  for (let i = 0; i < 12; i++) blocks.push(para(FILLER));

  const chunks = chunkBlocks(blocks, SOURCE, { maxTokens: 900, minTokens: 400 });
  const withTable = chunks.filter((c) => c.text.includes('Line item 0'));
  assert.equal(withTable.length, 1, 'table appeared in more than one chunk');
  // Every row of that table must be in the same chunk as row 0.
  for (let i = 0; i < 10; i++) {
    assert.ok(withTable[0]!.text.includes(`Line item ${i} `), `row ${i} separated from its table`);
  }
});

test('a table larger than the budget splits by rows, repeating the header', () => {
  const chunks = chunkBlocks([table(400)], SOURCE, { maxTokens: 500, minTokens: 200 });
  assert.ok(chunks.length > 1, 'expected the oversized table to split');
  for (const c of chunks) {
    // Each piece must carry the period header, or its numbers name no year.
    assert.match(c.text, /\| 2025 \| 2024 \|/, `piece ${c.index} lost the header row`);
  }
  assert.ok(chunks.slice(1).every((c) => c.text.includes(TABLE_SPLIT_MARKER)));
  assert.ok(chunks.every((c) => c.isTableContinuation));
  // No row may be lost in the split.
  const seen = chunks.map((c) => c.text).join('\n');
  for (let i = 0; i < 400; i++) assert.ok(seen.includes(`Line item ${i} `), `row ${i} vanished`);
});

test('chunks stay within the token ceiling', () => {
  const blocks = Array.from({ length: 60 }, () => para(FILLER));
  const chunks = chunkBlocks(blocks, SOURCE, { maxTokens: 800, minTokens: 400 });
  for (const c of chunks) {
    assert.ok(c.estimatedTokens <= 800 + 200, `chunk ${c.index} is ${c.estimatedTokens} tokens`);
  }
});

test('chunk boundaries prefer headings once the minimum is met', () => {
  const blocks: LayoutBlock[] = [];
  for (let s = 0; s < 5; s++) {
    blocks.push(heading(`NOTE ${s} — SOME TOPIC`));
    for (let i = 0; i < 6; i++) blocks.push(para(FILLER));
  }
  const chunks = chunkBlocks(blocks, SOURCE, { maxTokens: 1400, minTokens: 500 });
  assert.ok(chunks.length > 1);
  // Every chunk after the first should open at a note boundary (after its
  // overlap preamble), not mid-paragraph.
  for (const c of chunks.slice(1)) {
    assert.match(chunkBodyOnly(c), /^NOTE \d+ — SOME TOPIC/, `chunk ${c.index} did not start at a heading`);
  }
});

test('overlap carries prose forward but never table rows', () => {
  const blocks: LayoutBlock[] = [];
  for (let i = 0; i < 8; i++) blocks.push(para(`Paragraph ${i}. ${FILLER}`));
  blocks.push(table(6));
  for (let i = 8; i < 16; i++) blocks.push(para(`Paragraph ${i}. ${FILLER}`));

  const chunks = chunkBlocks(blocks, SOURCE, { maxTokens: 700, minTokens: 300, overlapTokens: 100 });
  assert.ok(chunks.length > 1);
  const withOverlap = chunks.slice(1).filter((c) => c.text.startsWith(OVERLAP_MARKER));
  assert.ok(withOverlap.length > 0, 'expected at least one chunk to carry overlap');
  for (const c of withOverlap) {
    const preamble = c.text.slice(0, c.text.indexOf(OVERLAP_END_MARKER));
    // Duplicating a table row across chunks would double-count the figure
    // when per-chunk extractions are aggregated.
    assert.doesNotMatch(preamble, /Line item \d/, `chunk ${c.index} overlapped table rows`);
  }
});

test('overlap is disabled cleanly when set to zero', () => {
  const blocks = Array.from({ length: 40 }, () => para(FILLER));
  const chunks = chunkBlocks(blocks, SOURCE, { maxTokens: 600, minTokens: 300, overlapTokens: 0 });
  assert.ok(chunks.every((c) => !c.text.includes(OVERLAP_MARKER)));
});

test('chunk ids are stable and carry filing provenance', () => {
  const chunks = chunkBlocks([para(FILLER), table(3)], SOURCE, { maxTokens: 5000, minTokens: 1000 });
  assert.equal(chunks[0]!.id, '0000000001-26-000001:financial-statements:0');
  assert.equal(chunks[0]!.ticker, 'TEST');
  assert.equal(chunks[0]!.total, chunks.length);
});

test('headings spanned by a chunk are recorded for citation provenance', () => {
  const chunks = chunkBlocks(
    [heading('NOTE 7 — INVENTORIES'), para(FILLER), heading('NOTE 8 — DEBT'), para(FILLER)],
    SOURCE,
    { maxTokens: 5000, minTokens: 1000 },
  );
  assert.deepEqual(chunks[0]!.headings, ['NOTE 7 — INVENTORIES', 'NOTE 8 — DEBT']);
});

test('empty input yields no chunks rather than one empty chunk', () => {
  assert.deepEqual(chunkBlocks([], SOURCE), []);
});

test('token estimator over-counts numeric text rather than under-counting it', () => {
  // Under-counting is the dangerous direction: it overflows the model's
  // context and truncates a table mid-row, silently.
  const numeric = '| Net Sales | 6,203.2 | 6,107.1 | 5,867.9 |';
  const prose = 'The company reported higher sales in the period compared to';
  assert.ok(estimateTokens(numeric) > numeric.length / 4, 'numeric text under-counted');
  assert.ok(estimateTokens(prose) >= prose.length / 4.5);
});
