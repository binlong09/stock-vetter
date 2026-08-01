// End-to-end orchestration: chunks in, indexed corpus and an assessment out,
// with both model tiers stubbed. This is the test that would catch a phase
// being wired up backwards — e.g. synthesis running before the filing is
// indexed, which would make every verification return "not found".

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newCostTracker } from '@stock-vetter/core';
import { LookbackIndex } from './lookback.js';
import { OllamaClient } from './ollama.js';
import { chunkBlocks } from './chunk.js';
import { markdownToBlocks, scanPrepared, type PreparedFiling } from './pipeline.js';

const FILING_MD = `NOTE 4 — ACCOUNTS RECEIVABLE

(in millions)

|  | 2025 | 2024 |
| --- | --- | --- |
| Accounts receivable, net | 1,204.5 | 987.1 |

Days sales outstanding increased to 78 days from 61 days in the prior year, reflecting extended payment terms granted to two large distributors.`;

const EXTRACTION = {
  summary: ['DSO 78 days vs 61 days prior year'],
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
  ],
  flags: [
    {
      category: 'receivables-quality',
      severity: 'high',
      claim: 'DSO rose to 78 days from 61 days',
      quote: 'Days sales outstanding increased to 78 days from 61 days in the prior year',
      whyItMatters: 'Revenue may be pulled forward via terms concessions.',
    },
  ],
  managementClaims: [],
  nothingMaterial: false,
};

const EMPTY_EXTRACTION = {
  summary: [],
  metrics: [],
  flags: [],
  managementClaims: [],
  nothingMaterial: true,
};

const ASSESSMENT = {
  verdict: 'mispriced-short',
  thesis: 'Revenue pulled forward through distributor terms.',
  direction: 'short',
  conviction: 6,
  catalysts: [{ event: 'Next 10-Q', expectedWindow: 'Q1 2026' }],
  evidence: [
    {
      point: 'DSO rose to 78 days',
      category: 'receivables-quality',
      severity: 'high',
      citation: {
        claim: 'DSO rose',
        quote: 'Days sales outstanding increased to 78 days from 61 days',
        accession: 'ACC-1',
        sectionId: 'financial-statements',
        verified: true,
      },
    },
  ],
  counterThesis: 'One-time competitive response.',
  whatWouldKillThis: ['Receivables decline sequentially'],
  executionRisks: ['High short interest'],
  unverifiedClaims: [],
};

// --- stub servers ----------------------------------------------------------

let ollamaServer: Server;
let anthropicServer: Server;
let ollamaHost = '';
let localResponse: unknown = EXTRACTION;
let anthropicTurns: unknown[][] = [];
let anthropicCalls = 0;

before(async () => {
  ollamaServer = createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: [{ name: 'qwen3:32b' }] }));
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          response: JSON.stringify(localResponse),
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 1200,
          eval_count: 300,
        }),
      );
    });
  });
  await new Promise<void>((r) => ollamaServer.listen(0, '127.0.0.1', r));
  ollamaHost = `http://127.0.0.1:${(ollamaServer.address() as { port: number }).port}`;

  anthropicServer = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const content = anthropicTurns[Math.min(anthropicCalls, anthropicTurns.length - 1)]!;
      anthropicCalls++;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-6',
          content,
          stop_reason: 'tool_use',
          usage: { input_tokens: 5000, output_tokens: 800 },
        }),
      );
    });
  });
  await new Promise<void>((r) => anthropicServer.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(anthropicServer.address() as { port: number }).port}`;
});

after(async () => {
  await new Promise<void>((r) => ollamaServer.close(() => r()));
  await new Promise<void>((r) => anthropicServer.close(() => r()));
});

function prepared(): PreparedFiling {
  const blocks = markdownToBlocks(FILING_MD);
  return {
    chunks: chunkBlocks(blocks, {
      ticker: 'TEST',
      cik: '0000000001',
      accession: 'ACC-1',
      form: '10-K',
      filingDate: '2026-02-12',
      sectionId: 'financial-statements',
      sectionLabel: 'Financial Statements',
    }),
    stripReports: [],
    warnings: [],
    eightKItems: [],
  };
}

const META = {
  ticker: 'TEST',
  cik: '0000000001',
  accession: 'ACC-1',
  form: '10-K',
  filingDate: '2026-02-12',
};

async function withDeps(
  fn: (deps: { ollama: OllamaClient; index: LookbackIndex; tracker: ReturnType<typeof newCostTracker> }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pipeline-'));
  const index = await LookbackIndex.open({ path: join(dir, 'test.db'), embedder: null });
  try {
    await fn({
      ollama: new OllamaClient({ host: ollamaHost, numCtx: 32768 }),
      index,
      tracker: newCostTracker(),
    });
  } finally {
    await index.close();
    await rm(dir, { recursive: true, force: true });
  }
}

// --- tests -----------------------------------------------------------------

test('markdownToBlocks keeps a table whole rather than splitting on blank lines', () => {
  const blocks = markdownToBlocks(FILING_MD);
  const table = blocks.find((b) => b.kind === 'table');
  assert.ok(table, 'table block not recognized');
  assert.match(table.markdown, /\| 2025 \| 2024 \|/);
  assert.match(table.markdown, /Accounts receivable, net \| 1,204\.5/);
  assert.ok(blocks.some((b) => b.kind === 'heading' && b.text.startsWith('NOTE 4')));
});

test('index-only stops before any model call but still populates the corpus', async () => {
  await withDeps(async (deps) => {
    const r = await scanPrepared(prepared(), META, deps, { indexOnly: true });
    assert.equal(r.skipped, 'index-only run');
    assert.ok(r.indexed.chunksIndexed > 0);
    assert.equal(r.brief, null);
    assert.equal(deps.ollama.stats.calls, 0);
    // Retrieval works immediately, which is what makes an index-only backfill
    // useful before any GPU time is spent.
    const hits = await deps.index.search('days sales outstanding', { ticker: 'TEST', keywordOnly: true });
    assert.equal(hits.length, 1);
  });
});

test('a filing is indexed even when triage declines to escalate it', async () => {
  localResponse = EMPTY_EXTRACTION;
  await withDeps(async (deps) => {
    const r = await scanPrepared(prepared(), META, deps, {});
    assert.equal(r.decision!.escalate, false);
    assert.equal(r.assessment, null);
    // This year's boring 10-K is next year's comparison baseline. Dropping it
    // means re-fetching and re-parsing it later to answer "was this new?".
    assert.ok(r.indexed.chunksIndexed > 0);
    const found = await deps.index.verifyQuote('Days sales outstanding increased to 78 days', {
      ticker: 'TEST',
    });
    assert.equal(found.found, true);
  });
});

test('a scored filing escalates and the cloud model can verify against the index', async () => {
  localResponse = EXTRACTION;
  anthropicTurns = [
    [
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'verify_quote',
        input: { quote: 'Days sales outstanding increased to 78 days from 61 days' },
      },
    ],
    [{ type: 'tool_use', id: 'tu_2', name: 'submit_assessment', input: ASSESSMENT }],
  ];
  anthropicCalls = 0;
  await withDeps(async (deps) => {
    const r = await scanPrepared(prepared(), META, deps, {});
    assert.equal(r.decision!.escalate, true);
    assert.equal(r.assessment!.verdict, 'mispriced-short');
    // The verification must succeed, which it only can if indexing ran first.
    assert.equal(r.toolCalls.length, 1);
    assert.match(r.toolCalls[0]!.result, /^VERIFIED/);
    assert.ok(deps.tracker.total > 0);
  });
});

test('--no-synthesis runs the local tier and stops, whatever triage decides', async () => {
  localResponse = EXTRACTION;
  await withDeps(async (deps) => {
    const r = await scanPrepared(prepared(), META, deps, { noSynthesis: true });
    assert.equal(r.decision!.escalate, true);
    assert.equal(r.skipped, 'synthesis disabled');
    assert.equal(r.assessment, null);
    assert.ok(r.brief!.flags.length > 0, 'the brief should still be built');
  });
});

test('an empty filing is reported as such rather than as a clean one', async () => {
  await withDeps(async (deps) => {
    const r = await scanPrepared(
      { chunks: [], stripReports: [], warnings: [], eightKItems: [] },
      META,
      deps,
      {},
    );
    assert.match(r.skipped!, /no readable content/);
    assert.equal(r.brief, null);
    assert.equal(r.decision, null);
  });
});

test('a critical 8-K escalates even though the local model found nothing', async () => {
  localResponse = EMPTY_EXTRACTION;
  anthropicTurns = [[{ type: 'tool_use', id: 'tu_1', name: 'submit_assessment', input: ASSESSMENT }]];
  anthropicCalls = 0;
  await withDeps(async (deps) => {
    const p = prepared();
    p.eightKItems = [{ number: '4.02', label: 'Non-Reliance', severity: 'critical' }];
    const r = await scanPrepared(p, { ...META, form: '8-K' }, deps, {});
    // The escalation came from the item number, parsed deterministically —
    // not from anything the model read or failed to read.
    assert.equal(r.decision!.escalate, true);
    assert.ok(r.decision!.reasons.some((x) => /escalated unconditionally/.test(x)));
    assert.ok(r.assessment);
  });
});

test('local extraction failures are surfaced on the brief, not swallowed', async () => {
  localResponse = { summary: 'not an array' };
  await withDeps(async (deps) => {
    const r = await scanPrepared(prepared(), META, deps, {});
    assert.ok(r.brief!.chunksFailed > 0);
    assert.ok(r.brief!.warnings.some((w) => /chunks failed extraction/.test(w)));
    assert.equal(r.decision!.dataQualityHold, true);
    assert.equal(r.assessment, null);
  });
});
