// Per-(ticker, dimension) variance history. Persists the most recent
// triple-sampled range so subsequent re-runs can decide whether to single-
// sample (tight) or re-triple-sample (uncertain).
//
// Tagged with the Pass 1 prompt hash so prompt edits force re-triple-sampling
// (variance history collected under an old rubric isn't reliable).
//
// Stored as one file per ticker at .cache/variance-history/<TICKER>.json:
//   {
//     "promptHash": "abcdef123456",
//     "byDimension": {
//       "moatDurability": { "range": 0.0, "samples": [7, 7, 7], "asOf": "2026-05-09T..." },
//       ...
//     }
//   }

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeCacheEntry } from './cache.js';

const NAMESPACE = 'variance-history';

export type DimensionVariance = {
  range: number;
  samples: number[];
  asOf: string;
};

export type VarianceHistory = {
  promptHash: string;
  byDimension: Record<string, DimensionVariance>;
};

function pathFor(ticker: string): string {
  return join('.cache', NAMESPACE, `${ticker.toUpperCase()}.json`);
}

export async function loadVarianceHistory(ticker: string): Promise<VarianceHistory | null> {
  try {
    const body = await readFile(pathFor(ticker), 'utf-8');
    const env = JSON.parse(body) as { payload: VarianceHistory };
    return env.payload;
  } catch {
    return null;
  }
}

// Decide how many samples to run for this (ticker, dimension) given the
// previous variance and the current prompt hash.
//
// Rules:
//   - If `forceTriple` is true (--always-triple), always 3.
//   - If no history exists, or prompt hash changed, 3 (uncalibrated).
//   - If previous range ≤ 0.5 (tight), 1 (the rubric was unambiguous).
//   - Otherwise 3 (uncertain or unknown).
export function decideSampleCount(
  history: VarianceHistory | null,
  dimension: string,
  promptHash: string,
  forceTriple: boolean,
): number {
  if (forceTriple) return 3;
  if (!history || history.promptHash !== promptHash) return 3;
  const dim = history.byDimension[dimension];
  if (!dim) return 3;
  return dim.range <= 0.5 ? 1 : 3;
}

// Update the history with this run's results. Overwrites the prior entry
// for each dimension. The promptHash is set from the caller.
export async function recordVariance(
  ticker: string,
  promptHash: string,
  results: Record<string, DimensionVariance>,
): Promise<void> {
  // Merge with prior history for dimensions not in this run (defensive).
  const prior = await loadVarianceHistory(ticker);
  let byDimension = prior?.byDimension ?? {};
  if (prior && prior.promptHash !== promptHash) {
    // Prompt changed — discard prior entries; they were calibrated against
    // the old rubric.
    byDimension = {};
  }
  byDimension = { ...byDimension, ...results };
  const payload: VarianceHistory = { promptHash, byDimension };
  await writeCacheEntry(NAMESPACE, ticker.toUpperCase(), payload);
}
