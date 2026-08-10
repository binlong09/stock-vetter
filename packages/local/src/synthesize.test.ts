// The synthesis stage, exercised end to end against a stand-in Anthropic API.
//
// The tool loop is where a mistake is most expensive and least visible: a
// citation marked verified that was never checked, a tool error that silently
// aborts an analysis, a model that never submits and burns the iteration
// budget. None of that is observable from output shape alone, so it is pinned
// here.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newCostTracker } from '@stock-vetter/core';
import type { FilingBrief } from '@stock-vetter/schema';
import { LookbackIndex } from './lookback.js';
import {
  buildVerificationTools,
  synthesizeAssessment,
  renderAssessmentMarkdown,
  renderMarketSnapshot,
} from './synthesize.js';
import type { FilingChunk } from './chunk.js';

const AR_TEXT =
  'NOTE 4 — ACCOUNTS RECEIVABLE\n(in millions)\n\n|  | 2025 | 2024 |\n| --- | --- | --- |\n' +
  '| Accounts receivable, net | 1,204.5 | 987.1 |\n\n' +
  'Days sales outstanding increased to 78 days from 61 days in the prior year.';

function chunk(over: Partial<FilingChunk> = {}): FilingChunk {
  return {
    id: 'c1',
    ticker: 'TEST',
    cik: '0000000001',
    accession: 'ACC-1',
    form: '10-K',
    filingDate: '2026-02-12',
    sectionId: 'financial-statements',
    sectionLabel: 'Financial Statements',
    index: 0,
    total: 1,
    headings: ['NOTE 4 — ACCOUNTS RECEIVABLE'],
    text: AR_TEXT,
    estimatedTokens: 100,
    hasTables: true,
    isTableContinuation: false,
    ...over,
  };
}

const BRIEF: FilingBrief = {
  ticker: 'TEST',
  cik: '0000000001',
  accession: 'ACC-1',
  form: '10-K',
  filingDate: '2026-02-12',
  eightKItems: [],
  crossFiling: null,
  summary: ['Receivables up 22% on 1.6% sales growth'],
  metrics: [],
  flags: [
    {
      category: 'receivables',
      severity: 'high',
      claim: 'DSO rose to 78 days from 61 days',
      quote: 'Days sales outstanding increased to 78 days from 61 days in the prior year.',
      whyItMatters: 'Revenue may be pulled forward via terms concessions.',
      sourceChunkIds: ['c1'],
      occurrences: 1,
    },
  ],
  managementClaims: [],
  flagCounts: { 'receivables': 1 },
  chunksProcessed: 1,
  chunksFailed: 0,
  quotesDropped: 0,
  estimatedTokens: 400,
  warnings: [],
};

async function withIndex(fn: (idx: LookbackIndex) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'synth-'));
  const idx = await LookbackIndex.open({ path: join(dir, 'test.db'), embedder: null });
  try {
    await idx.indexFiling([chunk()], { embed: false });
    await fn(idx);
  } finally {
    await idx.close();
    // libsql on Windows releases the db file handle only at process exit, so
    // this rm can hit EBUSY there. Leak the temp dir (the OS temp cleaner
    // reaps it) rather than fail a test whose body already passed.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// --- verification tools ----------------------------------------------------

test('search_filings returns passages scoped to the filing under analysis', async () => {
  await withIndex(async (idx) => {
    const [search] = buildVerificationTools(idx, { ticker: 'TEST', accession: 'ACC-1' });
    const out = await search!.handler({ query: 'days sales outstanding' });
    assert.match(out, /78 days from 61 days/);
    assert.match(out, /accession ACC-1/);
  });
});

test('a search that finds nothing says so without implying the fact is false', async () => {
  await withIndex(async (idx) => {
    const [search] = buildVerificationTools(idx, { ticker: 'TEST', accession: 'ACC-1' });
    const out = await search!.handler({ query: 'goodwill impairment charge recognized' });
    assert.match(out, /No passages found/);
    // The distinction matters: "not in the index" and "not true" are different
    // claims, and conflating them invents findings out of parser failures.
    assert.match(out, /not evidence that the underlying fact is false/);
  });
});

test('verify_quote confirms verbatim text and rejects a rewording', async () => {
  await withIndex(async (idx) => {
    const tools = buildVerificationTools(idx, { ticker: 'TEST', accession: 'ACC-1' });
    const verify = tools.find((t) => t.name === 'verify_quote')!;
    assert.match(
      await verify.handler({ quote: 'Days sales outstanding increased to 78 days from 61 days' }),
      /^VERIFIED/,
    );
    // Every word is in the filing; the sentence is not.
    assert.match(await verify.handler({ quote: 'Days sales outstanding rose to 78 days' }), /^NOT FOUND/);
  });
});

test('the two tools are distinct: ranked search never reports a verification', async () => {
  await withIndex(async (idx) => {
    const tools = buildVerificationTools(idx, { ticker: 'TEST', accession: 'ACC-1' });
    const search = tools.find((t) => t.name === 'search_filings')!;
    assert.match(search.description, /RANKED CANDIDATES/);
    const out = await search.handler({ query: 'days sales outstanding rose to 45 days' });
    // Ranked retrieval happily returns the chunk for a query containing a
    // figure that isn't in it. Only verify_quote settles a citation.
    assert.doesNotMatch(out, /VERIFIED/);
  });
});

// --- the tool loop ---------------------------------------------------------

type Turn = { content: unknown[]; stop_reason?: string };

// ONE server for the whole file, started once.
//
// `llm.ts` caches its Anthropic client at module scope (correct in
// production — one client, one connection pool). That means the base URL is
// fixed by the first call, so a per-test server would leave the client
// pointed at a closed port and every later test would spend the full retry
// backoff on ECONNREFUSED before failing.
let currentTurns: Turn[] = [];
let seenRequests: any[] = [];
let server: Server;

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seenRequests.push(JSON.parse(raw));
      const turn = currentTurns[Math.min(seenRequests.length - 1, currentTurns.length - 1)]!;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: `msg_${seenRequests.length}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-6',
          content: turn.content,
          stop_reason: turn.stop_reason ?? 'tool_use',
          usage: { input_tokens: 1000, output_tokens: 200 },
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

async function withAnthropic(turns: Turn[], fn: (seen: any[]) => Promise<void>): Promise<void> {
  currentTurns = turns;
  seenRequests = [];
  await fn(seenRequests);
}

const ASSESSMENT = {
  verdict: 'mispriced-short',
  thesis: 'Revenue is being pulled forward through distributor terms concessions.',
  direction: 'short',
  conviction: 6,
  catalysts: [{ event: 'Next 10-Q receivables disclosure', expectedWindow: 'Q1 2026' }],
  evidence: [
    {
      point: 'DSO rose to 78 days from 61 days',
      category: 'receivables',
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
  counterThesis: 'Terms concessions were a one-time competitive response and normalize next quarter.',
  whatWouldKillThis: ['Receivables decline sequentially while revenue holds'],
  executionRisks: ['High short interest'],
  unverifiedClaims: [],
};

const submitBlock = (input: unknown = ASSESSMENT) => ({
  type: 'tool_use',
  id: 'tu_submit',
  name: 'submit_assessment',
  input,
});

test('the model verifies through the local index before submitting', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        {
          content: [
            { type: 'text', text: 'Checking the DSO figure.' },
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'verify_quote',
              input: { quote: 'Days sales outstanding increased to 78 days from 61 days' },
            },
          ],
        },
        { content: [submitBlock()], stop_reason: 'tool_use' },
      ],
      async (seen) => {
        const tracker = newCostTracker();
        const r = await synthesizeAssessment(BRIEF, idx, tracker);
        assert.equal(r.assessment.verdict, 'mispriced-short');
        assert.equal(r.iterations, 2);
        assert.equal(r.toolCalls.length, 1);
        assert.equal(r.toolCalls[0]!.name, 'verify_quote');
        assert.match(r.toolCalls[0]!.result, /^VERIFIED/);
        // The tool result must be fed back as a tool_result block, or the
        // model answers the second turn having learned nothing.
        const second = seen[1];
        const toolResult = second.messages.at(-1).content[0];
        assert.equal(toolResult.type, 'tool_result');
        assert.equal(toolResult.tool_use_id, 'tu_1');
        assert.ok(tracker.total > 0, 'tool-loop turns were not costed');
        assert.equal(tracker.byCall.length, 2);
        // The brief is cached on the first turn and the growing conversation on
        // each subsequent turn, so re-reads are billed at the cache rate rather
        // than full input price — the dominant synthesis cost otherwise.
        assert.ok(
          seen[0].messages.at(-1).content.at(-1).cache_control,
          'the brief was not marked cacheable on the first turn',
        );
        assert.ok(
          toolResult.cache_control,
          'the conversation prefix was not cached on the follow-up turn',
        );
      },
    );
  });
});

test('both verification tools plus submit are offered to the model', async () => {
  await withIndex(async (idx) => {
    await withAnthropic([{ content: [submitBlock()] }], async (seen) => {
      await synthesizeAssessment(BRIEF, idx, newCostTracker());
      const names = seen[0].tools.map((t: { name: string }) => t.name);
      assert.deepEqual(names.sort(), ['search_filings', 'submit_assessment', 'verify_quote']);
      assert.ok(seen[0].system[0].cache_control, 'system prompt was not marked cacheable');
    });
  });
});

test('a throwing tool is reported to the model instead of aborting the analysis', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        {
          content: [{ type: 'tool_use', id: 'tu_1', name: 'search_filings', input: {} }],
        },
        { content: [submitBlock()] },
      ],
      async () => {
        const r = await synthesizeAssessment(BRIEF, idx, newCostTracker());
        // A malformed tool call costs one turn, not the whole run.
        assert.equal(r.toolCalls[0]!.isError, false);
        assert.match(r.toolCalls[0]!.result, /query is required/);
        assert.equal(r.assessment.verdict, 'mispriced-short');
      },
    );
  });
});

test('an unknown tool name is answered, not thrown', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        { content: [{ type: 'tool_use', id: 'tu_1', name: 'read_bloomberg', input: {} }] },
        { content: [submitBlock()] },
      ],
      async () => {
        const r = await synthesizeAssessment(BRIEF, idx, newCostTracker());
        assert.equal(r.toolCalls[0]!.isError, true);
        assert.match(r.toolCalls[0]!.result, /No such tool/);
      },
    );
  });
});

test('a submission failing a Zod refinement is handed back for correction', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        // conviction 99 satisfies the JSON Schema type but violates .max(10),
        // which JSON Schema cannot express and the API therefore accepts.
        { content: [submitBlock({ ...ASSESSMENT, conviction: 99 })] },
        { content: [submitBlock({ ...ASSESSMENT, conviction: 5 })] },
      ],
      async (seen) => {
        const r = await synthesizeAssessment(BRIEF, idx, newCostTracker());
        assert.equal(r.assessment.conviction, 5);
        const retry = seen[1].messages.at(-1).content[0];
        assert.equal(retry.is_error, true);
        assert.match(retry.content, /conviction/);
      },
    );
  });
});

test('prose instead of a submission is redirected to the submit tool', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        { content: [{ type: 'text', text: 'I think this is a short.' }], stop_reason: 'end_turn' },
        { content: [submitBlock()] },
      ],
      async (seen) => {
        const r = await synthesizeAssessment(BRIEF, idx, newCostTracker());
        assert.equal(r.assessment.verdict, 'mispriced-short');
        assert.match(JSON.stringify(seen[1].messages.at(-1)), /must record your answer/);
      },
    );
  });
});

test('a model that never submits fails loudly at the iteration cap', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [{ content: [{ type: 'tool_use', id: 'tu_x', name: 'search_filings', input: { query: 'receivables' } }] }],
      async (seen) => {
        await assert.rejects(
          synthesizeAssessment(BRIEF, idx, newCostTracker(), { maxIterations: 3 }),
          /did not submit an answer within 3 iterations/,
        );
        // On the final turns only `submit` is offered AND the tool choice is
        // forced, so a real API cannot reach this error by indecision — only a
        // model that keeps producing something other than a valid submission
        // (which this scripted one does, to pin the failure path).
        assert.equal(seen.length, 4, 'cap turns + one grace turn');
        assert.deepEqual(seen.at(-1).tools.map((t: { name: string }) => t.name), ['submit_assessment']);
        assert.deepEqual(seen.at(-1).tool_choice, { type: 'tool', name: 'submit_assessment' });
      },
    );
  });
});

test('the final turn says research is over and forces the submission', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        { content: [{ type: 'tool_use', id: 'tu_1', name: 'search_filings', input: { query: 'receivables' } }] },
        { content: [submitBlock()] },
      ],
      async (seen) => {
        const r = await synthesizeAssessment(BRIEF, idx, newCostTracker(), { maxIterations: 2 });
        assert.equal(r.assessment.verdict, 'mispriced-short');
        assert.equal(r.iterations, 2);
        const final = seen[1];
        // All three levers at once: the notice in the conversation, the tool
        // list narrowed to submit, and the choice forced. A dense filing that
        // burns the budget on verification ends as a hedged answer, not a
        // wasted synthesis.
        assert.match(JSON.stringify(final.messages.at(-1)), /FINAL TURN/);
        assert.deepEqual(final.tools.map((t: { name: string }) => t.name), ['submit_assessment']);
        assert.deepEqual(final.tool_choice, { type: 'tool', name: 'submit_assessment' });
      },
    );
  });
});

test('a validation failure on the forced final turn gets one grace correction', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        { content: [{ type: 'tool_use', id: 'tu_1', name: 'search_filings', input: { query: 'receivables' } }] },
        { content: [submitBlock({ ...ASSESSMENT, conviction: 99 })] },
        { content: [submitBlock({ ...ASSESSMENT, conviction: 4 })] },
      ],
      async (seen) => {
        const r = await synthesizeAssessment(BRIEF, idx, newCostTracker(), { maxIterations: 2 });
        // Without the grace turn the Zod rejection at the cap would throw away
        // the whole run; with it, the correction lands one turn later.
        assert.equal(r.assessment.conviction, 4);
        assert.equal(r.iterations, 3, 'the grace turn runs past the nominal cap');
        assert.deepEqual(seen[2].tool_choice, { type: 'tool', name: 'submit_assessment' });
      },
    );
  });
});

test('the full trajectory comes back for fine-tuning capture', async () => {
  await withIndex(async (idx) => {
    await withAnthropic(
      [
        {
          content: [
            { type: 'text', text: 'Verifying the DSO quote first.' },
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'verify_quote',
              input: { quote: 'Days sales outstanding increased to 78 days from 61 days' },
            },
          ],
        },
        { content: [submitBlock()] },
      ],
      async () => {
        const r = await synthesizeAssessment(BRIEF, idx, newCostTracker());
        assert.match(r.transcript.system, /mispricing/i);
        const msgs = r.transcript.messages as Array<{ role: string; content: unknown }>;
        // A trainable trajectory is the WHOLE conversation: the brief in, the
        // intermediate tool turn, and — the part the loop never pushes onto
        // its own message list — the final assistant turn with the submit.
        assert.equal(msgs[0]!.role, 'user');
        const last = msgs.at(-1)! as { role: string; content: Array<{ type: string; name?: string }> };
        assert.equal(last.role, 'assistant');
        assert.ok(
          last.content.some((b) => b.type === 'tool_use' && b.name === 'submit_assessment'),
          'the final submit turn is present',
        );
        assert.equal(JSON.stringify(msgs).includes('cache_control'), false, 'transport markers stripped');
      },
    );
  });
});

// --- market snapshot -------------------------------------------------------

const SNAPSHOT = {
  ticker: 'TEST',
  price: 4.1,
  marketCap: 3.1e8,
  fiftyTwoWeekHigh: 12.4,
  fiftyTwoWeekLow: 3.6,
  avgDollarVolume: 2.4e6,
  fetchedAt: '2026-08-08T18:00:00Z',
};

test('the market snapshot renders price, cap, range position, and liquidity', () => {
  const s = renderMarketSnapshot(SNAPSHOT);
  assert.match(s, /Price: \$4\.10/);
  assert.match(s, /Market cap: \$310\.0M/);
  // The range position is the model's main evidence for "how much is priced
  // in" — it must arrive computed, not as two raw numbers to misdivide.
  assert.match(s, /\$3\.60–\$12\.40 \(currently 67% below the high\)/);
  assert.match(s, /dollar volume: \$2\.4M/);
});

test('a missing snapshot says out loud that the price is unknown', () => {
  // The silent failure mode this guards: no price and no admission of it,
  // and the model answers "already priced in" from stale training memory.
  for (const empty of [null, undefined, { ...SNAPSHOT, price: null }]) {
    const s = renderMarketSnapshot(empty);
    assert.match(s, /No market data is available/);
    assert.match(s, /Do not fill the gap from memory/);
    assert.match(s, /unverifiedClaims/);
  }
});

test('the snapshot reaches the model appended to the brief', async () => {
  await withIndex(async (idx) => {
    await withAnthropic([{ content: [submitBlock()] }], async (seen) => {
      await synthesizeAssessment(BRIEF, idx, newCostTracker(), { market: SNAPSHOT });
      const userMsg = JSON.stringify(seen[0].messages[0]);
      assert.match(userMsg, /Market snapshot/);
      assert.match(userMsg, /67% below the high/);
    });
  });
});

test('the rendered assessment distinguishes verified citations from unverified ones', async () => {
  await withIndex(async (idx) => {
    await withAnthropic([{ content: [submitBlock()] }], async () => {
      const r = await synthesizeAssessment(BRIEF, idx, newCostTracker());
      const md = renderAssessmentMarkdown(BRIEF, r);
      assert.match(md, /verified against filing text/);
      assert.match(md, /1\/1 citations verified/);
    });
  });
});

// --- metric history tool ---------------------------------------------------

import { buildConceptSeries, type ConceptSeries, type SeriesSet } from '@stock-vetter/core';
import { FORENSIC_CONCEPTS } from './concepts.js';

function fakeSeries(): SeriesSet {
  const tags: Record<string, unknown[]> = {};
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
  const ends: Record<string, [string, string]> = {
    Q1: ['-01-01', '-03-31'],
    Q2: ['-04-01', '-06-30'],
    Q3: ['-07-01', '-09-30'],
    Q4: ['-10-01', '-12-31'],
  };
  let i = 0;
  for (const fy of [2024, 2025]) {
    for (const fp of quarters) {
      const [st, en] = ends[fp]!;
      (tags.RevenueFromContractWithCustomerExcludingAssessedTax ??= []).push({
        start: `${fy}${st}`, end: `${fy}${en}`, val: 1000, fy, fp, form: '10-Q',
      });
      (tags.AccountsReceivableNetCurrent ??= []).push({
        end: `${fy}${en}`, val: 700 + i * 40, fy, fp, form: '10-Q',
      });
      i++;
    }
  }
  const byConcept = new Map<string, ConceptSeries>();
  for (const spec of FORENSIC_CONCEPTS) {
    const relevant = Object.fromEntries(
      spec.tags.filter((t) => tags[t]).map((t) => [t, { units: { [spec.unit ?? 'USD']: tags[t] } }]),
    );
    byConcept.set(spec.concept, buildConceptSeries({ cik: 1, facts: { 'us-gaap': relevant } } as any, spec));
  }
  return { cik: '1', entityName: 'Test Co', byConcept, missing: [] };
}

test('get_metric_history returns the quarterly series behind a trend claim', async () => {
  await withIndex(async (idx) => {
    const tools = buildVerificationTools(idx, { ticker: 'TEST', accession: 'ACC-1' }, { series: fakeSeries() });
    const hist = tools.find((t) => t.name === 'get_metric_history')!;
    const out = await hist.handler({ metric: 'dso' });
    assert.match(out, /2025Q4/);
    assert.match(out, /2024Q1/);
    // The tool must tell the model how to read it; sequential comparison is
    // meaningless for a seasonal business and it has no way to know that.
    assert.match(out, /SAME fiscal quarter one year earlier/);
  });
});

test('get_metric_history respects the as-of cutoff', async () => {
  await withIndex(async (idx) => {
    const tools = buildVerificationTools(
      idx,
      { ticker: 'TEST', accession: 'ACC-1' },
      { series: fakeSeries(), asOf: '2024-12-31' },
    );
    const out = await tools.find((t) => t.name === 'get_metric_history')!.handler({ metric: 'dso' });
    // Grade only the data block — the trailing guidance is prose, not periods.
    const data = out.split('\n\n')[0]!;
    // Handing the model 2025 numbers while it analyzes a 2024 filing
    // contaminates every conclusion with hindsight.
    assert.doesNotMatch(data, /2025Q/);
    assert.match(data, /2024Q4/);
  });
});

test('an unknown metric lists the available ones instead of failing silently', async () => {
  await withIndex(async (idx) => {
    const tools = buildVerificationTools(idx, { ticker: 'TEST', accession: 'ACC-1' }, { series: fakeSeries() });
    const out = await tools.find((t) => t.name === 'get_metric_history')!.handler({ metric: 'ebitda' });
    assert.match(out, /Unknown metric "ebitda"/);
    assert.match(out, /dso/);
  });
});

test('the history tool is not offered when there is no series to read', async () => {
  await withIndex(async (idx) => {
    // A tool that always answers "no data" teaches the model to stop calling
    // it, including on the companies where it would have worked.
    const tools = buildVerificationTools(idx, { ticker: 'TEST', accession: 'ACC-1' });
    assert.equal(tools.some((t) => t.name === 'get_metric_history'), false);
    assert.equal(tools.length, 2);
  });
});
