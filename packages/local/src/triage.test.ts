import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BriefFlag, FilingBrief } from '@stock-vetter/schema';
import { triage } from './triage.js';

function flag(over: Partial<BriefFlag> = {}): BriefFlag {
  return {
    category: 'margin',
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
  crossFiling: null,
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
  const d = triage(brief({ flags: [flag(), flag({ category: 'inventory' })] }));
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
  const categories = ['receivables', 'inventory', 'cash-conversion'] as const;
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
  const b = brief({ flags: [flag({ category: 'receivables', severity: 'medium' })] });
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

// --- cross-filing evidence -------------------------------------------------

function trend(over: Partial<import('@stock-vetter/schema').TrendFinding> = {}) {
  return {
    id: 'dso-lengthening',
    metric: 'dso',
    category: 'receivables' as const,
    severity: 'medium' as const,
    claim: 'DSO lengthened to 78 days from 61 a year earlier over 4 consecutive quarters',
    direction: 'deteriorating' as const,
    consecutivePeriods: 4,
    latestPeriod: '2025Q4',
    latestValue: 78,
    yearAgoValue: 61,
    change: 17,
    changeUnit: 'days' as const,
    series: [{ period: '2025Q4', value: 78 }],
    sourceTags: ['AccountsReceivableNetCurrent'],
    usesRestatedData: false,
    ...over,
  };
}

function crossFiling(over: Partial<import('@stock-vetter/schema').CrossFilingAnalysis> = {}) {
  return {
    trends: [],
    recurrence: [],
    beneish: null,
    altman: null,
    periodsAvailable: 12,
    latestPeriod: '2025Q4',
    warnings: [],
    ...over,
  };
}

test('a multi-quarter trend outweighs the same finding seen in one filing', () => {
  const single = triage(
    brief({ flags: [flag({ category: 'receivables', severity: 'medium' })] }),
  );
  const multi = triage(brief({ crossFiling: crossFiling({ trends: [trend()] }) }));
  // The trend is exact and has already survived "was that just one odd
  // quarter?"; the extracted flag has done neither.
  assert.ok(multi.score > single.score, `trend ${multi.score} vs flag ${single.score}`);
  assert.ok(multi.reasons.some((r) => r.startsWith('TREND ')));
});

test('a high-severity trend escalates on its own', () => {
  const d = triage(brief({ crossFiling: crossFiling({ trends: [trend({ severity: 'high' })] }) }));
  assert.equal(d.escalate, true);
});

test('a Beneish flag contributes but cannot escalate by itself', () => {
  // ~17.5% false-positive rate: across 2,000 companies that is hundreds of
  // false alarms a year if it is allowed to be decisive.
  const d = triage(
    brief({
      crossFiling: crossFiling({
        beneish: {
          period: '2025FY',
          mScore: -1.2,
          threshold: -1.78,
          flagged: true,
          indices: [],
          missing: [],
          dominantIndex: 'SGI',
        },
      }),
    }),
  );
  assert.equal(d.escalate, false);
  assert.ok(d.reasons.some((r) => /Beneish/.test(r) && /driven by SGI/.test(r)));
});

test('a strong trend survives a data-quality hold caused by bad text parsing', () => {
  const d = triage(
    brief({
      chunksProcessed: 2,
      chunksFailed: 18,
      crossFiling: crossFiling({ trends: [trend({ severity: 'high' })] }),
    }),
  );
  // The trend came from XBRL, not from the chunks that failed. Suppressing it
  // because the HTML wouldn't parse would bury the strongest evidence for a
  // reason unrelated to it.
  assert.equal(d.dataQualityHold, false);
  assert.equal(d.escalate, true);
});

test('a bad text parse still holds a filing whose only evidence came from text', () => {
  const d = triage(
    brief({
      chunksProcessed: 2,
      chunksFailed: 18,
      flags: [flag({ category: 'going-concern', severity: 'high' })],
      crossFiling: crossFiling(),
    }),
  );
  assert.equal(d.dataQualityHold, true);
  assert.equal(d.escalate, false);
});

test('trends count toward the distinct-category combination bonus', () => {
  const d = triage(
    brief({
      flags: [flag({ category: 'cash-conversion', severity: 'medium' })],
      crossFiling: crossFiling({
        trends: [
          trend({ category: 'receivables' }),
          trend({ id: 'dio-lengthening', category: 'inventory' }),
        ],
      }),
    }),
  );
  assert.ok(d.reasons.some((r) => /3 distinct non-trivial flag categories/.test(r)));
});

test('recurrence across prior filings is scored and attributed', () => {
  const d = triage(
    brief({
      crossFiling: crossFiling({
        recurrence: [
          {
            id: 'recurring-one-time-charge',
            category: 'one-time-items',
            severity: 'high',
            claim: 'restructuring charge in 4 prior filings',
            quote: 'restructuring charge of $42.0 million',
            priorOccurrences: [],
            distinctPriorFilings: 4,
          },
        ],
      }),
    }),
  );
  assert.ok(d.reasons.some((r) => /RECURRENCE recurring-one-time-charge across 4 prior filings/.test(r)));
});

test('an absent cross-filing analysis changes nothing about the score', () => {
  const withNull = triage(brief({ flags: [flag({ category: 'auditor', severity: 'high' })] }));
  const withEmpty = triage(
    brief({ flags: [flag({ category: 'auditor', severity: 'high' })], crossFiling: crossFiling() }),
  );
  // "Not computed" and "computed, found nothing" must not be conflated, but
  // neither should invent or remove points.
  assert.equal(withNull.score, withEmpty.score);
});
