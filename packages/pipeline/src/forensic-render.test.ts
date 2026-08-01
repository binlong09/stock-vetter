import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCrossFilingMarkdown } from './forensic-render.js';
import type { CrossFilingAnalysis } from '@stock-vetter/schema';

const base: CrossFilingAnalysis = {
  trends: [],
  recurrence: [],
  beneish: null,
  altman: null,
  periodsAvailable: 13,
  latestPeriod: '2026Q4',
  warnings: [],
};

test('renders a trend with its series and the composite screens', () => {
  const cf: CrossFilingAnalysis = {
    ...base,
    trends: [
      {
        id: 'dpo-lengthening',
        metric: 'dpo',
        category: 'cash-conversion',
        severity: 'high',
        claim: 'Days payable outstanding lengthened to 130.7 days from 105.1 a year earlier',
        direction: 'deteriorating',
        consecutivePeriods: 7,
        latestPeriod: '2026Q4',
        latestValue: 130.7,
        yearAgoValue: 105.1,
        change: 25.6,
        changeUnit: 'days',
        series: [
          { period: '2026Q3', value: 124.45 },
          { period: '2026Q4', value: 130.73 },
        ],
        sourceTags: ['AccountsPayableCurrent'],
        usesRestatedData: false,
      },
    ],
    beneish: {
      period: '2026FY',
      mScore: -2.446,
      threshold: -1.78,
      flagged: false,
      indices: [],
      missing: [],
      dominantIndex: 'SGI',
    },
    altman: {
      period: '2026FY',
      zScore: 4.59,
      variant: 'Z-double-prime',
      distressThreshold: 1.1,
      safeThreshold: 2.6,
      zone: 'safe',
      components: [],
      missing: [],
    },
  };
  const md = renderCrossFilingMarkdown(cf);
  assert.match(md, /Forensic cross-filing signals/);
  assert.match(md, /\[high\] dpo-lengthening/);
  assert.match(md, /2026Q4=130\.73/); // the auditable series is shown
  assert.match(md, /Beneish M-score -2\.446 vs threshold -1\.78 — not flagged, driven mainly by SGI/);
  assert.match(md, /Altman Z''-score 4\.59 — safe zone/);
});

test('an empty forensic section says so rather than implying nothing to check', () => {
  const md = renderCrossFilingMarkdown(base);
  assert.match(md, /no multi-period deterioration detected/);
  assert.doesNotMatch(md, /Composite screens/); // no composites rendered when both are null
});
