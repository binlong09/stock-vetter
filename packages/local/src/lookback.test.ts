import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LookbackIndex, toFtsQuery } from './lookback.js';
import { Embedder, packF32, unpackF32, cosineSimilarity } from './embed.js';
import { extractSnippet } from './snippet.js';
import type { FilingChunk } from './chunk.js';

// A deterministic stand-in for the Ollama embedding model: a bag-of-words hash
// into a fixed-width vector. It has no semantics, but it is stable and
// symmetric, which is everything the index's plumbing needs to be exercised.
class FakeEmbedder extends Embedder {
  override async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array(64).fill(0);
      for (const w of t.toLowerCase().split(/\W+/).filter(Boolean)) {
        let h = 0;
        for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
        v[h % 64]! += 1;
      }
      return v;
    });
  }
}

function chunk(id: string, text: string, over: Partial<FilingChunk> = {}): FilingChunk {
  return {
    id,
    ticker: 'TEST',
    cik: '0000000001',
    accession: 'ACC-1',
    form: '10-K',
    filingDate: '2026-02-12',
    sectionId: 'financial-statements',
    sectionLabel: 'Financial Statements',
    index: 0,
    total: 1,
    headings: [],
    text,
    estimatedTokens: 100,
    hasTables: false,
    isTableContinuation: false,
    ...over,
  };
}

async function withIndex(fn: (idx: LookbackIndex) => Promise<void>, embed = true): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'lookback-'));
  const idx = await LookbackIndex.open({
    path: join(dir, 'test.db'),
    embedder: embed ? new FakeEmbedder() : null,
  });
  try {
    await fn(idx);
  } finally {
    await idx.close();
    // libsql on Windows releases the db file handle only at process exit, so
    // this rm can hit EBUSY there. Leak the temp dir (the OS temp cleaner
    // reaps it) rather than fail a test whose body already passed.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const AR_TEXT =
  'NOTE 4 — ACCOUNTS RECEIVABLE\n(in millions)\n\n|  | 2025 | 2024 |\n| --- | --- | --- |\n' +
  '| Accounts receivable, net | 1,204.5 | 987.1 |\n| Allowance for credit losses | 41.2 | 38.0 |\n\n' +
  'Days sales outstanding increased to 78 days from 61 days in the prior year.';

const INVENTORY_TEXT =
  'NOTE 5 — INVENTORIES\n\nInventories consist of raw materials and finished goods. ' +
  'Finished goods inventory rose 31% year over year on softer sell-through in the fourth quarter.';

test('an indexed filing is retrievable by exact figure', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT), chunk('c2', INVENTORY_TEXT, { index: 1 })]);
    const hits = await idx.search('1,204.5 accounts receivable', { ticker: 'TEST' });
    assert.ok(hits.length > 0);
    assert.equal(hits[0]!.chunkId, 'c1');
  });
});

test('keyword search finds a literal number that carries no semantic signal', async () => {
  // The case pure-vector retrieval handles worst: "78 days" embeds like any
  // other short numeric phrase, but BM25 lands on it immediately.
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT), chunk('c2', INVENTORY_TEXT, { index: 1 })]);
    const hits = await idx.search('78 days', { ticker: 'TEST', keywordOnly: true });
    assert.equal(hits[0]!.chunkId, 'c1');
    assert.ok(hits[0]!.matchedBy.includes('keyword'));
  });
});

test('a retrieved table row arrives with its header and units attached', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT)]);
    const hits = await idx.search('accounts receivable net 1,204.5', { ticker: 'TEST' });
    const text = hits[0]!.snippet.text;
    // Without the header this snippet is "| Accounts receivable, net | 1,204.5
    // | 987.1 |" — two numbers with no periods and no scale, which is not a
    // verification, it is a guess with a citation attached.
    assert.match(text, /\| 2025 \| 2024 \|/, 'snippet lost the period header');
    assert.match(text, /in millions/, 'snippet lost the units caption');
    assert.match(text, /1,204\.5/);
  });
});

test('snippets are held near the requested token budget', async () => {
  await withIndex(async (idx) => {
    const long = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} discussing receivables and collections in detail.`).join('\n');
    await idx.indexFiling([chunk('c1', long)]);
    const hits = await idx.search('receivables collections', { ticker: 'TEST', snippetTokens: 200 });
    assert.ok(hits[0]!.snippet.estimatedTokens <= 260, `snippet was ${hits[0]!.snippet.estimatedTokens} tokens`);
  });
});

test('filters scope retrieval to one ticker and one filing', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('a1', AR_TEXT)]);
    await idx.indexFiling([
      chunk('b1', AR_TEXT, { ticker: 'OTHER', accession: 'ACC-2', filingDate: '2026-03-01' }),
    ]);
    const all = await idx.search('accounts receivable', {});
    assert.equal(all.length, 2);
    const scoped = await idx.search('accounts receivable', { ticker: 'OTHER' });
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]!.chunkId, 'b1');
    const byAccession = await idx.search('accounts receivable', { accession: 'ACC-1' });
    assert.equal(byAccession[0]!.chunkId, 'a1');
  });
});

test('re-indexing a filing replaces it rather than leaving two generations', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT)]);
    await idx.indexFiling([chunk('c1', 'Completely different corrected text about inventories.')]);
    const s = await idx.stats();
    assert.equal(s.chunks, 1);
    assert.equal(s.filings, 1);
    // The stale text must no longer match — an FTS external-content table
    // keeps matching deleted rows unless they are withdrawn explicitly.
    // Keyword-only: the vector arm returns nearest neighbours for any query
    // whatsoever, so it can't distinguish "matched" from "was the only row".
    const stale = await idx.search('days sales outstanding', { ticker: 'TEST', keywordOnly: true });
    assert.equal(stale.length, 0, 'deleted text still matched a query');
  });
});

test('removing a filing withdraws it from the keyword index too', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT)]);
    await idx.removeFiling('ACC-1');
    assert.deepEqual(await idx.search('days sales outstanding', {}), []);
    const s = await idx.stats();
    assert.equal(s.chunks, 0);
    assert.equal(s.embeddings, 0);
  });
});

test('verifyQuote confirms a real citation and rejects a fabricated one', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT)]);
    const good = await idx.verifyQuote('Days sales outstanding increased to 78 days from 61 days', { ticker: 'TEST' });
    assert.equal(good.found, true);
    assert.equal(good.chunkId, 'c1');
    const bad = await idx.verifyQuote('Days sales outstanding decreased to 45 days from 61 days', { ticker: 'TEST' });
    assert.equal(bad.found, false);
  });
});

test('verifyQuote is exact, not approximate — a near-miss is a miss', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT)]);
    // Every term is present in the filing; the assembled sentence is not.
    // Ranked search would happily return this chunk; a citation check must not.
    const r = await idx.verifyQuote('Accounts receivable, net decreased to 987.1 in 2025', { ticker: 'TEST' });
    assert.equal(r.found, false);
  });
});

test('the index works with no embedder at all, on keyword search alone', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT)]);
    const s = await idx.stats();
    assert.equal(s.embeddings, 0);
    const hits = await idx.search('days sales outstanding', { ticker: 'TEST' });
    assert.equal(hits[0]!.chunkId, 'c1');
  }, false);
});

test('both retrieval arms contribute, and agreement raises the fused score', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT), chunk('c2', INVENTORY_TEXT, { index: 1 })]);
    const hits = await idx.search('accounts receivable days sales outstanding', { ticker: 'TEST' });
    const top = hits[0]!;
    assert.ok(top.matchedBy.includes('keyword'));
    assert.ok(top.matchedBy.includes('vector'), 'vector arm did not contribute');
  });
});

test('FTS operators in a query are neutralized rather than throwing', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('c1', AR_TEXT)]);
    // A model writing a natural-language query emits exactly this shape, and
    // unquoted it is an FTS5 syntax error, not a search.
    for (const q of ['AR growth vs. revenue — is DSO up?', 'receivables AND (inventory OR NEAR)', '"""', '*']) {
      await assert.doesNotReject(idx.search(q, { ticker: 'TEST' }), `query threw: ${q}`);
    }
  });
});

test('toFtsQuery quotes every term and drops operator words', () => {
  const q = toFtsQuery('receivables AND inventory NEAR* days');
  assert.doesNotMatch(q, /\bAND\b|\bNEAR\b/);
  assert.match(q, /"receivables"/);
  assert.match(q, /"inventory"/);
  assert.equal(toFtsQuery('!!! ???'), '');
});

test('filingsFor lists a ticker history newest first', async () => {
  await withIndex(async (idx) => {
    await idx.indexFiling([chunk('a', AR_TEXT, { accession: 'A1', filingDate: '2024-02-01' })]);
    await idx.indexFiling([chunk('b', AR_TEXT, { accession: 'A2', filingDate: '2026-02-01' })]);
    await idx.indexFiling([chunk('c', AR_TEXT, { accession: 'A3', filingDate: '2025-02-01' })]);
    const list = await idx.filingsFor('TEST');
    assert.deepEqual(list.map((f) => f.accession), ['A2', 'A3', 'A1']);
  });
});

test('float32 packing survives a round trip', () => {
  const v = [0.1, -0.25, 1e-8, 3.5];
  const back = unpackF32(packF32(v));
  for (let i = 0; i < v.length; i++) assert.ok(Math.abs(back[i]! - v[i]!) < 1e-6);
});

test('cosine similarity is 1 for identical vectors and 0 for orthogonal ones', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('a snippet from prose returns the matching passage, not the chunk head', () => {
  const text = Array.from({ length: 50 }, (_, i) => `Line ${i} about unrelated matters.`).join('\n') +
    '\nThe allowance for credit losses was increased by 12.4 million in the fourth quarter.';
  const s = extractSnippet(text, 'allowance for credit losses 12.4', 200);
  assert.match(s.text, /allowance for credit losses was increased by 12\.4/);
  assert.equal(s.tableContextAdded, false);
});
