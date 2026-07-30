import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BriefFlag, FilingBrief } from '@stock-vetter/schema';
import { triage } from './triage.js';

function flag(over: Partial<BriefFlag> = {}): BriefFlag {
  return {
    category: 'margin-compression',
    severity: 'low',
    claim: 'Gross margin fell 100bps',
    quote: 'Gross margin was 44.7% compared with 45.7%',
    whyItMatters: 'Input costs',
    sourceChunkIds: ['c1'],
    occurrences: 1,
    ...over,
  };
}

function brief(over: Partial<FilingBrief> = {}): FilingBrief {
  return {
    ticker: 'TEST',
    cik: '1',
    accession: 'A',
    form: '10-K',
    filingDate: '2026-02-12',
    eightKItems: [],
    summary: [],
    metrics: [],
    flags: [],
    managementClaims: [],
    flagCounts: {},
    chunksProcessed: 20,
    chunksFailed: 0,
    quotesDropped: 0,
    estimatedTokens: 4000,
    warnings: [],
    ...over,
  };
}

test('an ordinary filing with routine variance does not escalate', () => {
  // The default answer. Most filings from most companies are this.
  const d = triage(brief({ flags: [flag(), flag({ category: 'inventory-buildup' })] }));
  assert.equal(d.escalate, false);
  assert.ok(d.reasons.some((r) => /below threshold/.test(r)));
});

test('a restatement 8-K escalates unconditionally, whatever the flags say', () => {
  const d = triage(
    brief({
      form: '8-K',
      eightKItems: [{ number: '4.02', label: 'Non-Reliance on Previously Issued Financial Statements', severity: 'critical' }],
      flags: [],
    }),
  );
  assert.equal(d.escalate, true);
  assert.ok(d.reasons.some((r) => /escalated unconditionally/.test(r)));
});

test('no accumulation of soft flags can outvote a critical 8-K item', () => {
  // The point of the deterministic tier: a company withdrawing its own
  // financial statements is not a score to be weighed against a reassuring
  // narrative elsewhere in the filing.
  const d = triage(
    brief({
      form: '8-K',
      eightKItems: [{ number: '4.02', label: 'Non-Reliance', severity: 'critical' }],
      chunksFailed: 15,
      chunksProcessed: 5,
      warnings: ['treat this brief’s completeness as suspect'],
    }),
  );
  assert.equal(d.escalate, true);
});

test('a single high-severity going-concern flag clears the threshold alone', () => {
  const d = triage(brief({ flags: [flag({ category: 'going-concern', severity: 'high' })] }));
  assert.equal(d.escalate, true);
  assert.ok(d.score >= 20);
});

test('a single high-severity customer-concentration flag does not', () => {
  // Same severity, very different predictive value. Weighting them equally is
  // how the queue fills with things that were true and did not matter.
  const d = triage(brief({ flags: [flag({ category: 'customer-concentration', severity: 'high' })] }));
  assert.equal(d.escalate, false);
});

test('corroboration across chunks helps, sub-linearly', () => {
  const once = triage(brief({ flags: [flag({ category: 'cash-conversion', severity: 'medium', occurrences: 1 })] }));
  const twice = triage(brief({ flags: [flag({ category: 'cash-conversion', severity: 'medium', occurrences: 2 })] }));
  const eight = triage(brief({ flags: [flag({ category: 'cash-conversion', severity: 'medium', occurrences: 8 })] }));
  assert.ok(twice.score > once.score);
  // Repetition inside a filing is usually one fact stated in two places, not
  // two pieces of evidence. Eight mentions must not score like eight findings.
  assert.ok(eight.score < once.score * 3, `8× occurrences scored ${eight.score} vs ${once.score} for one`);
});

test('several independent problem areas escalate where any one would not', () => {
  const categories = ['receivables-quality', 'inventory-buildup', 'cash-conversion'] as const;
  for (const c of categories) {
    assert.equal(triage(brief({ flags: [flag({ category: c, severity: 'medium' })] })).escalate, false);
  }
  const combined = triage(brief({ flags: categories.map((c) => flag({ category: c, severity: 'medium' })) }));
  assert.equal(combined.escalate, true);
  assert.ok(combined.reasons.some((r) => /distinct non-trivial flag categories/.test(r)));
});

test('a filing we largely failed to read is held, not escalated and not scored zero', () => {
  const d = triage(
    brief({
      chunksProcessed: 4,
      chunksFailed: 16,
      flags: [flag({ category: 'going-concern', severity: 'high' })],
    }),
  );
  // Escalating burns cloud spend on a brief that is mostly holes; silently
  // passing pretends we checked. Neither.
  assert.equal(d.escalate, false);
  assert.equal(d.dataQualityHold, true);
  assert.ok(d.reasons.some((r) => /data quality hold/.test(r)));
});

test('a high quote-drop rate also triggers the hold', () => {
  const d = triage(
    brief({
      warnings: ['320 of 900 findings (36%) were dropped because their quotes were not in the source text — treat this brief’s completeness as suspect'],
      flags: [flag({ category: 'auditor', severity: 'high' })],
    }),
  );
  assert.equal(d.dataQualityHold, true);
  assert.equal(d.escalate, false);
});

test('force overrides both the threshold and the data-quality hold', () => {
  const d = triage(brief({ chunksProcessed: 1, chunksFailed: 19 }), { force: true });
  assert.equal(d.escalate, true);
});

test('the threshold is tunable and the score is reported either way', () => {
  const b = brief({ flags: [flag({ category: 'receivables-quality', severity: 'medium' })] });
  assert.equal(triage(b, { threshold: 100 }).escalate, false);
  assert.equal(triage(b, { threshold: 1 }).escalate, true);
  assert.equal(triage(b, { threshold: 1 }).score, triage(b, { threshold: 100 }).score);
});

test('specific forms can be escalated unconditionally', () => {
  const d = triage(brief({ form: '10-K' }), { alwaysEscalateForms: ['10-K'] });
  assert.equal(d.escalate, true);
  assert.ok(d.reasons.some((r) => /always-escalate list/.test(r)));
  assert.equal(triage(brief({ form: '10-Q' }), { alwaysEscalateForms: ['10-K'] }).escalate, false);
});

test('an amended form matches its base form on the always-escalate list', () => {
  assert.equal(triage(brief({ form: '10-K/A' }), { alwaysEscalateForms: ['10-K'] }).escalate, true);
});

test('every scored contribution is attributed in reasons', () => {
  const d = triage(
    brief({
      flags: [flag({ category: 'auditor', severity: 'high', claim: 'Auditor resigned mid-audit' })],
    }),
  );
  assert.ok(d.reasons.some((r) => /auditor \(high\)/.test(r) && /\+\d/.test(r)));
});
