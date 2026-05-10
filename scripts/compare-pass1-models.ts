#!/usr/bin/env tsx
/**
 * Compare Pass 1 (primary-source value checklist) outputs from Sonnet 4.6
 * vs Haiku 4.5 for the same ticker. Both runs use triple-sampling. The
 * harness loads existing Sonnet output (assumed already run) and runs Haiku
 * fresh, then prints a comparison table:
 *   - score deltas per dimension
 *   - citation grep-verify rate
 *   - counter-evidence text length (rough proxy for depth)
 *
 * Usage: pnpm tsx scripts/compare-pass1-models.ts <TICKER>
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  isInsufficientPrimary,
  PRIMARY_DIMENSION_KEYS,
  PrimarySourceChecklist,
  type PrimaryDimensionKey,
} from '@stock-vetter/schema';
import { runPrimarySourcePass1 } from '../packages/pipeline/src/primary-source.js';
import { fetchFinancialSnapshot } from '../packages/pipeline/src/financials.js';
import { buildReverseDcf } from '../packages/pipeline/src/reverse-dcf.js';
import { verifyChecklistCitations } from '../packages/pipeline/src/citation-verifier.js';
import { newCostTracker, summarizeCost } from '../packages/pipeline/src/llm.js';

const HAIKU = 'claude-haiku-4-5-20251001';

async function loadSonnetPass1(ticker: string): Promise<PrimarySourceChecklist> {
  const path = join('fixtures', ticker.toUpperCase(), 'primary-source-checklist.json');
  const body = await readFile(path, 'utf-8');
  const raw = JSON.parse(body) as { pass1?: unknown };
  return PrimarySourceChecklist.parse(raw.pass1 ?? raw);
}

async function main() {
  const ticker = process.argv[2];
  if (!ticker) {
    console.error('Usage: pnpm tsx scripts/compare-pass1-models.ts <TICKER>');
    process.exit(1);
  }
  const upper = ticker.toUpperCase();
  console.error(`[compare] loading existing Sonnet Pass 1 output for ${upper}...`);
  const sonnetPass1 = await loadSonnetPass1(upper);

  console.error(`[compare] running Haiku Pass 1 for ${upper} (forceTriple)...`);
  const tracker = newCostTracker();
  const snapshot = await fetchFinancialSnapshot(upper);
  const dcf = snapshot ? buildReverseDcf(snapshot) : null;
  const haikuPass1 = await runPrimarySourcePass1(upper, {
    snapshot,
    dcf,
    forceTriple: true,
    pass1Model: HAIKU,
    tracker,
  });

  const haikuCost = summarizeCost(tracker);

  console.error(`[compare] verifying citations (Sonnet)...`);
  const sonnetVerif = await verifyChecklistCitations(sonnetPass1);
  console.error(`[compare] verifying citations (Haiku)...`);
  const haikuVerif = await verifyChecklistCitations(haikuPass1);

  console.log('');
  console.log(`# Pass 1 model comparison for ${upper}`);
  console.log('');
  console.log('| Dimension | Sonnet score | Haiku score | Δ | Sonnet range | Haiku range |');
  console.log('|---|---|---|---|---|---|');
  let maxDelta = 0;
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const s = sonnetPass1.scores[key];
    const h = haikuPass1.scores[key];
    const sScore = isInsufficientPrimary(s) ? null : s.score;
    const hScore = isInsufficientPrimary(h) ? null : h.score;
    const delta = sScore != null && hScore != null ? Math.abs(sScore - hScore) : null;
    if (delta != null && delta > maxDelta) maxDelta = delta;
    const sRange = isInsufficientPrimary(s) ? '—' : (s.range != null ? s.range.toFixed(1) : 'n/a');
    const hRange = isInsufficientPrimary(h) ? '—' : (h.range != null ? h.range.toFixed(1) : 'n/a');
    console.log(
      `| ${key} | ${sScore != null ? sScore.toFixed(1) : 'insuff'} | ${hScore != null ? hScore.toFixed(1) : 'insuff'} | ${delta != null ? `${(hScore! - sScore!) >= 0 ? '+' : ''}${(hScore! - sScore!).toFixed(1)}` : '—'} | ${sRange} | ${hRange} |`,
    );
  }
  console.log('');
  console.log(`Max absolute score delta: ${maxDelta.toFixed(1)} (acceptable: ≤0.5; problematic: >0.5)`);
  console.log('');

  console.log('## Citation grep-verify rate');
  console.log('');
  console.log(`- Sonnet: ${sonnetVerif.exact}/${sonnetVerif.total} exact, ${sonnetVerif.whitespaceNormalized} ws-norm, ${sonnetVerif.caseInsensitive} case-only, ${sonnetVerif.punctuationNormalized} punct-norm, ${sonnetVerif.noMatch} **no-match**`);
  console.log(`- Haiku:  ${haikuVerif.exact}/${haikuVerif.total} exact, ${haikuVerif.whitespaceNormalized} ws-norm, ${haikuVerif.caseInsensitive} case-only, ${haikuVerif.punctuationNormalized} punct-norm, ${haikuVerif.noMatch} **no-match**`);
  console.log('');

  console.log('## Counter-evidence depth (text length, longer ≈ more nuanced)');
  console.log('');
  console.log('| Dimension | Sonnet ce length | Haiku ce length |');
  console.log('|---|---|---|');
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const s = sonnetPass1.scores[key];
    const h = haikuPass1.scores[key];
    const sLen = isInsufficientPrimary(s) ? 0 : s.counterEvidence.length;
    const hLen = isInsufficientPrimary(h) ? 0 : h.counterEvidence.length;
    console.log(`| ${key} | ${sLen} | ${hLen} |`);
  }
  console.log('');

  let inspectKey: PrimaryDimensionKey = 'capitalAllocation';
  let maxObservedDelta = -1;
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const s = sonnetPass1.scores[key];
    const h = haikuPass1.scores[key];
    if (isInsufficientPrimary(s) || isInsufficientPrimary(h)) continue;
    const d = Math.abs(s.score - h.score);
    if (d > maxObservedDelta) {
      maxObservedDelta = d;
      inspectKey = key;
    }
  }
  console.log(`## Sample inspection: ${inspectKey} (highest delta)`);
  console.log('');
  const ss = sonnetPass1.scores[inspectKey];
  const hh = haikuPass1.scores[inspectKey];
  if (!isInsufficientPrimary(ss)) {
    console.log(`### Sonnet rationale (score ${ss.score.toFixed(1)})`);
    console.log('');
    console.log(ss.rationale.slice(0, 1000));
    console.log('');
    console.log(`### Sonnet counter-evidence`);
    console.log('');
    console.log(ss.counterEvidence.slice(0, 1000));
    console.log('');
  }
  if (!isInsufficientPrimary(hh)) {
    console.log(`### Haiku rationale (score ${hh.score.toFixed(1)})`);
    console.log('');
    console.log(hh.rationale.slice(0, 1000));
    console.log('');
    console.log(`### Haiku counter-evidence`);
    console.log('');
    console.log(hh.counterEvidence.slice(0, 1000));
    console.log('');
  }

  console.log('## Cost');
  console.log('');
  for (const [stage, s] of Object.entries(haikuCost.byStage)) {
    console.log(`- Haiku ${stage}: ${s.calls} calls, $${s.cost.toFixed(3)} (in=${s.inputTokens}t out=${s.outputTokens}t cache_w=${s.cacheWriteTokens}t cache_r=${s.cacheReadTokens}t)`);
  }
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
