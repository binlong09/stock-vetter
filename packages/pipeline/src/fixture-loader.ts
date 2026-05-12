/**
 * Load a ticker's analysis artifacts from `fixtures/<TICKER>/` and validate them
 * against the shared Zod schemas. Used by both `push-fixtures` (backfill) and
 * `analyze-ticker` (so the Turso push reads exactly what was just written to disk
 * — one source of truth, no drift between the two paths).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DecisionCard,
  FinancialSnapshot,
  MetaCard,
  ReverseDcfReport,
} from '@stock-vetter/schema';

export interface LoadedTickerFixtures {
  ticker: string;
  metaCard: ReturnType<typeof MetaCard.parse>;
  /** Full primary-source-checklist.json (pass1 + pass2 + pass3 + verifications). */
  primaryChecklist: unknown;
  financialSnapshot: ReturnType<typeof FinancialSnapshot.parse>;
  reverseDcf: ReturnType<typeof ReverseDcfReport.parse> | null;
  analystCards: ReturnType<typeof DecisionCard.parse>[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8'));
}

/** True iff `fixtures/<TICKER>/decision-card.json` exists (the gating artifact). */
export async function hasDecisionCard(fixturesRoot: string, ticker: string): Promise<boolean> {
  return fileExists(join(fixturesRoot, ticker.toUpperCase(), 'decision-card.json'));
}

/**
 * Read and validate all of a ticker's fixture files. Throws if a required file
 * is missing or fails schema validation. `reverse-dcf.json` and `videos/` are
 * optional (some tickers have no DCF; some have no analyst videos).
 */
export async function loadTickerFixtures(
  fixturesRoot: string,
  ticker: string,
): Promise<LoadedTickerFixtures> {
  const upper = ticker.toUpperCase();
  const base = join(fixturesRoot, upper);

  const metaCard = MetaCard.parse(await readJson(join(base, 'decision-card.json')));
  const primaryChecklist = await readJson(join(base, 'primary-source-checklist.json'));
  const financialSnapshot = FinancialSnapshot.parse(
    await readJson(join(base, 'financial-snapshot.json')),
  );

  let reverseDcf: LoadedTickerFixtures['reverseDcf'] = null;
  const rdcfPath = join(base, 'reverse-dcf.json');
  if (await fileExists(rdcfPath)) {
    reverseDcf = ReverseDcfReport.parse(await readJson(rdcfPath));
  }

  const analystCards: LoadedTickerFixtures['analystCards'] = [];
  try {
    const files = (await readdir(join(base, 'videos'))).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      analystCards.push(DecisionCard.parse(await readJson(join(base, 'videos', f))));
    }
  } catch {
    // no videos/ directory — fine
  }

  return { ticker: upper, metaCard, primaryChecklist, financialSnapshot, reverseDcf, analystCards };
}
