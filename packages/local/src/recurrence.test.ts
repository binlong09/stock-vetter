import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LookbackIndex } from './lookback.js';
import {
  contentTokens,
  detectRecurringOneTimeCharges,
  detectRepeatedExplanations,
  overlapRatio,
} from './recurrence.js';
import type { FilingChunk } from './chunk.js';

function chunk(accession: string, filingDate: string, text: string, form = '10-Q'): FilingChunk {
  return {
    id: `${accession}:mda:0`,
    ticker: 'TEST',
    cik: '0000000001',
    accession,
    form,
    filingDate,
    sectionId: 'mda',
    sectionLabel: "Management's Discussion and Analysis",
    index: 0,
    total: 1,
    headings: [],
    text,
    estimatedTokens: 200,
    hasTables: false,
    isTableContinuation: false,
  };
}

const TIMING_EXCUSE =
  'The sequential decline in segment results reflects the timing of distributor shipments ' +
  'and unfavorable channel inventory positioning during the period.';

async function withIndex(
  filings: Array<{ accession: string; date: string; text: string; form?: string }>,
  fn: (idx: LookbackIndex) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'recurrence-'));
  const idx = await LookbackIndex.open({ path: join(dir, 'test.db'), embedder: null });
  try {
    for (const f of filings) {
      await idx.indexFiling([chunk(f.accession, f.date, f.text, f.form)], { embed: false });
    }
    await fn(idx);
  } finally {
    await idx.close();
    // libsql on Windows releases the db file handle only at process exit, so
    // this rm can hit EBUSY there. Leak the temp dir (the OS temp cleaner
    // reaps it) rather than fail a test whose body already passed.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// --- token matching --------------------------------------------------------

test('finance-generic vocabulary is not treated as distinctive', () => {
  // Matching on "revenue increased compared to prior year" would make every
  // filing look like a repeat of every other filing.
  const t = contentTokens('Revenue increased compared to the prior year period');
  assert.equal(t.has('revenue'), false);
  assert.equal(t.has('increased'), false);
  assert.equal(t.has('prior'), false);
});

test('overlap is measured against the claim, not the candidate', () => {
  const claim = contentTokens('timing of distributor shipments and channel inventory');
  const long = contentTokens(
    'timing of distributor shipments and channel inventory plus a great deal of other unrelated discussion about many topics',
  );
  // A long passage containing the whole claim is a full match; normalizing by
  // the union would dilute it below threshold purely for being verbose.
  assert.equal(overlapRatio(claim, long), 1);
});

// --- repeated explanations -------------------------------------------------

test('an explanation given in three prior filings is surfaced', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2024-05-01', text: TIMING_EXCUSE },
      { accession: 'A2', date: '2024-08-01', text: TIMING_EXCUSE },
      { accession: 'A3', date: '2024-11-01', text: TIMING_EXCUSE },
      { accession: 'A4', date: '2025-02-01', text: TIMING_EXCUSE },
    ],
    async (idx) => {
      const findings = await detectRepeatedExplanations(idx, {
        ticker: 'TEST',
        accession: 'A4',
        claims: [{ claim: 'Decline was timing-related', quote: TIMING_EXCUSE }],
      });
      assert.equal(findings.length, 1);
      assert.equal(findings[0]!.distinctPriorFilings, 3);
      assert.equal(findings[0]!.severity, 'medium');
      // A cause described as timing across four filings is not timing.
      assert.match(findings[0]!.claim, /is neither/);
      assert.deepEqual(findings[0]!.priorOccurrences.map((p) => p.accession), ['A3', 'A2', 'A1']);
    },
  );
});

test('the filing under analysis is never counted as its own precedent', async () => {
  await withIndex([{ accession: 'A1', date: '2025-02-01', text: TIMING_EXCUSE }], async (idx) => {
    const findings = await detectRepeatedExplanations(idx, {
      ticker: 'TEST',
      accession: 'A1',
      claims: [{ claim: 'x', quote: TIMING_EXCUSE }],
    });
    assert.deepEqual(findings, []);
  });
});

test('a genuinely new explanation is not reported', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2024-05-01', text: 'Results benefited from favorable product mix in the enterprise segment.' },
      { accession: 'A2', date: '2024-08-01', text: 'Growth was driven by pricing actions taken across the portfolio.' },
      { accession: 'A3', date: '2025-02-01', text: TIMING_EXCUSE },
    ],
    async (idx) => {
      const findings = await detectRepeatedExplanations(idx, {
        ticker: 'TEST',
        accession: 'A3',
        claims: [{ claim: 'timing', quote: TIMING_EXCUSE }],
      });
      assert.deepEqual(findings, []);
    },
  );
});

test('a single prior mention is below the bar', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2024-11-01', text: TIMING_EXCUSE },
      { accession: 'A2', date: '2025-02-01', text: TIMING_EXCUSE },
    ],
    async (idx) => {
      const findings = await detectRepeatedExplanations(idx, {
        ticker: 'TEST',
        accession: 'A2',
        claims: [{ claim: 'x', quote: TIMING_EXCUSE }],
      });
      assert.deepEqual(findings, []);
    },
  );
});

test('a quote with too few distinctive words is skipped rather than matched loosely', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2024-05-01', text: 'Revenue increased.' },
      { accession: 'A2', date: '2024-08-01', text: 'Revenue increased.' },
      { accession: 'A3', date: '2025-02-01', text: 'Revenue increased.' },
    ],
    async (idx) => {
      const findings = await detectRepeatedExplanations(idx, {
        ticker: 'TEST',
        accession: 'A3',
        claims: [{ claim: 'x', quote: 'Revenue increased.' }],
      });
      assert.deepEqual(findings, []);
    },
  );
});

test('the until cutoff excludes filings the analysis could not have seen', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2024-05-01', text: TIMING_EXCUSE },
      { accession: 'A2', date: '2024-08-01', text: TIMING_EXCUSE },
      { accession: 'A3', date: '2026-02-01', text: TIMING_EXCUSE },
      { accession: 'A4', date: '2024-11-01', text: TIMING_EXCUSE },
    ],
    async (idx) => {
      const findings = await detectRepeatedExplanations(
        idx,
        { ticker: 'TEST', accession: 'A4', claims: [{ claim: 'x', quote: TIMING_EXCUSE }] },
        { until: '2024-11-01' },
      );
      assert.equal(findings.length, 1);
      // A3 is in the corpus but postdates the filing under analysis.
      assert.equal(findings[0]!.priorOccurrences.some((p) => p.accession === 'A3'), false);
      assert.equal(findings[0]!.distinctPriorFilings, 2);
    },
  );
});

// --- recurring "one-time" charges ------------------------------------------

const RESTRUCTURE = (yr: number): string =>
  `In ${yr} the Company approved a restructuring plan intended to streamline operations, ` +
  `recording a restructuring charge of $42.0 million related to severance and facility exit costs.`;

test('a restructuring charge taken every year is flagged', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2022-02-01', text: RESTRUCTURE(2021), form: '10-K' },
      { accession: 'A2', date: '2023-02-01', text: RESTRUCTURE(2022), form: '10-K' },
      { accession: 'A3', date: '2024-02-01', text: RESTRUCTURE(2023), form: '10-K' },
      { accession: 'A4', date: '2025-02-01', text: RESTRUCTURE(2024), form: '10-K' },
    ],
    async (idx) => {
      const findings = await detectRecurringOneTimeCharges(idx, { ticker: 'TEST', accession: 'A4' });
      const f = findings.find((x) => x.claim.includes('restructuring charge'));
      assert.ok(f, 'recurring restructuring not detected');
      assert.equal(f.distinctPriorFilings, 3);
      // The point is the non-GAAP consequence, not the charge itself.
      assert.match(f.claim, /overstates run-rate earnings/);
    },
  );
});

test('a company that restructured years ago and stopped is not flagged', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2021-02-01', text: RESTRUCTURE(2020), form: '10-K' },
      { accession: 'A2', date: '2022-02-01', text: RESTRUCTURE(2021), form: '10-K' },
      { accession: 'A3', date: '2025-02-01', text: 'Operations performed in line with expectations across all segments.', form: '10-K' },
    ],
    async (idx) => {
      const findings = await detectRecurringOneTimeCharges(idx, { ticker: 'TEST', accession: 'A3' });
      assert.deepEqual(findings, []);
    },
  );
});

test('ranked retrieval alone does not create a match — the phrase must be present', async () => {
  await withIndex(
    [
      { accession: 'A1', date: '2023-02-01', text: 'The plan to restructure the sales organization was completed.', form: '10-K' },
      { accession: 'A2', date: '2024-02-01', text: 'A charge was recorded for severance.', form: '10-K' },
      { accession: 'A3', date: '2025-02-01', text: RESTRUCTURE(2024), form: '10-K' },
    ],
    async (idx) => {
      const findings = await detectRecurringOneTimeCharges(idx, { ticker: 'TEST', accession: 'A3' });
      // BM25 returns both prior filings for "restructuring charge" because they
      // share terms. Neither contains the phrase, so neither counts.
      assert.deepEqual(findings, []);
    },
  );
});
