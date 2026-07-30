import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { ChunkExtraction, ChunkExtractionRecord } from '@stock-vetter/schema';
import { OllamaClient } from './ollama.js';
import { extractChunk, extractChunks, verifyQuotes } from './extract.js';
import { buildFilingBrief, renderBriefMarkdown } from './brief.js';
import type { FilingChunk } from './chunk.js';
import { OVERLAP_MARKER, OVERLAP_END_MARKER } from './chunk.js';

const CHUNK_BODY =
  'NOTE 4 — ACCOUNTS RECEIVABLE\n\n' +
  '| Accounts receivable, net | 1,204.5 | 987.1 |\n' +
  'Accounts receivable increased 22.0% while net sales increased 1.6%, reflecting extended ' +
  'payment terms granted to two large distributors in the fourth quarter.';

function chunk(overrides: Partial<FilingChunk> = {}): FilingChunk {
  return {
    id: '0000000001-26-000001:financial-statements:3',
    ticker: 'TEST',
    cik: '0000000001',
    accession: '0000000001-26-000001',
    form: '10-K',
    filingDate: '2026-02-12',
    sectionId: 'financial-statements',
    sectionLabel: 'Financial Statements',
    index: 3,
    total: 10,
    headings: ['NOTE 4 — ACCOUNTS RECEIVABLE'],
    text: CHUNK_BODY,
    estimatedTokens: 120,
    hasTables: true,
    isTableContinuation: false,
    ...overrides,
  };
}

const EMPTY: ChunkExtraction = {
  summary: [],
  metrics: [],
  flags: [],
  managementClaims: [],
  nothingMaterial: true,
};

async function withOllama(
  respond: (body: any) => unknown,
  fn: (client: OllamaClient, seen: any[]) => Promise<void>,
): Promise<void> {
  const seen: any[] = [];
  const server: Server = createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: [{ name: 'qwen3:32b' }] }));
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push(JSON.parse(raw));
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          response: JSON.stringify(respond(JSON.parse(raw))),
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 500,
          eval_count: 200,
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(new OllamaClient({ host: `http://127.0.0.1:${port}`, numCtx: 32768 }), seen);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('a fabricated quote drops its finding; a real quote keeps it', () => {
  const e: ChunkExtraction = {
    ...EMPTY,
    nothingMaterial: false,
    metrics: [
      {
        label: 'Accounts receivable, net',
        value: 1204.5,
        unit: 'USD millions',
        period: 'FY2025',
        priorValue: 987.1,
        priorPeriod: 'FY2024',
        quote: '| Accounts receivable, net | 1,204.5 | 987.1 |',
      },
      {
        label: 'Deferred revenue',
        value: 455.2,
        unit: 'USD millions',
        period: 'FY2025',
        priorValue: null,
        priorPeriod: null,
        // Plausible, correctly formatted, and nowhere in the chunk.
        quote: '| Deferred revenue | 455.2 | 401.0 |',
      },
    ],
  };
  const { extraction, check } = verifyQuotes(e, CHUNK_BODY);
  assert.equal(extraction.metrics.length, 1);
  assert.equal(extraction.metrics[0]!.label, 'Accounts receivable, net');
  assert.equal(check.dropped, 1);
});

test('quote matching tolerates whitespace and curly-quote normalization', () => {
  const source = 'Management’s  discussion   of the  period';
  const e: ChunkExtraction = {
    ...EMPTY,
    managementClaims: [{ claim: 'c', quote: "Management's discussion of the period", checkable: true }],
  };
  // Models routinely straighten curly apostrophes and collapse the multiple
  // spaces that survive HTML rendering. Neither is a hallucination.
  assert.equal(verifyQuotes(e, source).extraction.managementClaims.length, 1);
});

test('quotes too short to be evidence are rejected', () => {
  const e: ChunkExtraction = {
    ...EMPTY,
    flags: [
      {
        category: 'liquidity',
        severity: 'high',
        claim: 'x',
        // Appears in the text, but would appear in any filing's text.
        quote: 'cash',
        whyItMatters: 'y',
      },
    ],
  };
  assert.equal(verifyQuotes(e, 'we had cash on hand at year end').extraction.flags.length, 0);
});

test('quotes are verified against the chunk body, never the overlap preamble', async () => {
  const overlapped = chunk({
    text: `${OVERLAP_MARKER}\nRevenue for the prior period was 5,867.9 million dollars.\n${OVERLAP_END_MARKER}\n\n${CHUNK_BODY}`,
  });
  await withOllama(
    () => ({
      ...EMPTY,
      nothingMaterial: false,
      metrics: [
        {
          label: 'Revenue',
          value: 5867.9,
          unit: 'USD millions',
          period: 'FY2023',
          priorValue: null,
          priorPeriod: null,
          // Real text — but it belongs to the PREVIOUS chunk. Counting it here
          // double-counts the figure during aggregation.
          quote: 'Revenue for the prior period was 5,867.9 million dollars.',
        },
      ],
    }),
    async (client) => {
      const rec = await extractChunk(client, overlapped);
      assert.equal(rec.extraction.metrics.length, 0);
      assert.equal(rec.droppedForBadQuote, 1);
    },
  );
});

test('the prompt tells the model which chunk of which filing it is reading', async () => {
  await withOllama(
    () => EMPTY,
    async (client, seen) => {
      await extractChunk(client, chunk());
      assert.match(seen[0].prompt, /TEST 10-K filed 2026-02-12/);
      assert.match(seen[0].prompt, /CHUNK: 4 of 10/);
      assert.match(seen[0].system, /verbatim/i);
    },
  );
});

test('a split-table chunk is told not to describe totals it cannot see', async () => {
  await withOllama(
    () => EMPTY,
    async (client, seen) => {
      await extractChunk(client, chunk({ isTableContinuation: true }));
      assert.match(seen[0].prompt, /part of a table that was split/);
    },
  );
});

test('a failed chunk is recorded as a failure, not as an empty result', async () => {
  await withOllama(
    // The second chunk's section label is the trigger, so the failure follows
    // the chunk rather than a call count (generateJson retries, so counting
    // calls attributes the failure to the wrong chunk).
    (body) => (String(body.prompt).includes('Broken Section') ? { summary: 'not an array' } : EMPTY),
    async (client) => {
      const chunks = [
        chunk({ id: 'a', index: 0 }),
        chunk({ id: 'b', index: 1, sectionLabel: 'Broken Section' }),
      ];
      const { records, failures } = await extractChunks(client, chunks);
      // "No findings" and "the model fell over" must not look the same
      // downstream — one means the filing is clean, the other means we didn't read it.
      assert.equal(records.length, 1);
      assert.equal(failures.length, 1);
      assert.equal(failures[0]!.chunkId, 'b');
    },
  );
});

// --- brief aggregation -----------------------------------------------------

function rec(id: string, e: Partial<ChunkExtraction>): ChunkExtractionRecord {
  return {
    chunkId: id,
    ticker: 'TEST',
    accession: 'A',
    sectionId: 'mda',
    chunkIndex: 0,
    extraction: { ...EMPTY, nothingMaterial: false, ...e },
    droppedForBadQuote: 0,
  };
}

const FLAG = {
  category: 'receivables-quality' as const,
  severity: 'medium' as const,
  claim: 'Receivables grew 22.0% against 1.6% sales growth',
  quote: 'Accounts receivable increased 22.0% while net sales increased 1.6%',
  whyItMatters: 'Revenue may be pulled forward via terms concessions.',
};

test('the same flag raised in several chunks is merged and counted, not duplicated', () => {
  const brief = buildFilingBrief(
    [rec('c1', { flags: [FLAG] }), rec('c2', { flags: [FLAG] }), rec('c3', { flags: [FLAG] })],
    { ticker: 'TEST', cik: '1', accession: 'A', form: '10-K', filingDate: '2026-02-12', chunksAttempted: 3, chunksFailed: 0 },
  );
  assert.equal(brief.flags.length, 1);
  assert.equal(brief.flags[0]!.occurrences, 3);
  assert.deepEqual(brief.flags[0]!.sourceChunkIds, ['c1', 'c2', 'c3']);
});

test('flags differing only in their figures stay separate findings', () => {
  const brief = buildFilingBrief(
    [
      rec('c1', { flags: [{ ...FLAG, claim: 'DSO rose to 78 days' }] }),
      rec('c2', { flags: [{ ...FLAG, claim: 'DSO rose to 61 days' }] }),
    ],
    { ticker: 'TEST', cik: '1', accession: 'A', form: '10-K', filingDate: '2026-02-12', chunksAttempted: 2, chunksFailed: 0 },
  );
  assert.equal(brief.flags.length, 2);
});

test('the merged flag keeps the most severe reading', () => {
  const brief = buildFilingBrief(
    [rec('c1', { flags: [{ ...FLAG, severity: 'low' }] }), rec('c2', { flags: [{ ...FLAG, severity: 'high' }] })],
    { ticker: 'TEST', cik: '1', accession: 'A', form: '10-K', filingDate: '2026-02-12', chunksAttempted: 2, chunksFailed: 0 },
  );
  assert.equal(brief.flags[0]!.severity, 'high');
});

test('a high drop rate surfaces as a warning on the brief', () => {
  const records = [
    { ...rec('c1', { flags: [FLAG] }), droppedForBadQuote: 9 },
  ];
  const brief = buildFilingBrief(records, {
    ticker: 'TEST', cik: '1', accession: 'A', form: '10-K', filingDate: '2026-02-12',
    chunksAttempted: 1, chunksFailed: 0,
  });
  assert.ok(brief.warnings.some((w) => /completeness as suspect/.test(w)));
});

test('failed chunks are disclosed on the brief rather than silently reducing coverage', () => {
  const brief = buildFilingBrief([rec('c1', {})], {
    ticker: 'TEST', cik: '1', accession: 'A', form: '10-K', filingDate: '2026-02-12',
    chunksAttempted: 10, chunksFailed: 9,
  });
  assert.ok(brief.warnings.some((w) => /9 of 10 chunks failed/.test(w)));
});

test('the brief is trimmed toward its token target, keeping high-severity flags', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    rec(`c${i}`, {
      summary: Array.from({ length: 8 }, (_, j) => `Bullet ${i}-${j} with some length to it for token weight`),
      flags: [{ ...FLAG, severity: i % 5 === 0 ? 'high' : 'low', claim: `Claim number ${i} about receivables` }],
    }),
  );
  const brief = buildFilingBrief(many, {
    ticker: 'TEST', cik: '1', accession: 'A', form: '10-K', filingDate: '2026-02-12',
    chunksAttempted: 40, chunksFailed: 0,
  }, { targetTokens: 1500 });
  assert.ok(brief.estimatedTokens <= 1800, `brief was ${brief.estimatedTokens} tokens`);
  assert.ok(brief.flags.some((f) => f.severity === 'high'), 'trimming removed every high-severity flag');
});

test('the rendered brief carries every quote a citation would need', () => {
  const brief = buildFilingBrief([rec('c1', { flags: [FLAG] })], {
    ticker: 'TEST', cik: '1', accession: 'A', form: '10-K', filingDate: '2026-02-12',
    chunksAttempted: 1, chunksFailed: 0,
  });
  const md = renderBriefMarkdown(brief);
  assert.match(md, /Accounts receivable increased 22\.0%/);
  assert.match(md, /source: c1/);
});
