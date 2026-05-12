#!/usr/bin/env tsx
/**
 * Backfill: push every analyzed ticker in `fixtures/` into Turso.
 *
 * A ticker counts as "analyzed" iff `fixtures/<TICKER>/decision-card.json`
 * exists — same gating artifact the `analyze-ticker` CLI uses. For each, this
 * reads decision-card.json, primary-source-checklist.json, financial-snapshot.json,
 * reverse-dcf.json (optional), and every videos/*.json, validates each through the
 * shared Zod schemas, then calls the same `pushTicker(...)` the CLI uses (single
 * code path — no drift). Idempotent: re-running overwrites.
 *
 * Runs migrations first, so on a fresh Turso DB this is the one-shot bootstrap.
 *
 * Usage:
 *   pnpm tsx scripts/push-fixtures.ts            # all tickers
 *   pnpm tsx scripts/push-fixtures.ts META MSFT  # just these
 *
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment (.env).
 */

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DecisionCard,
  FinancialSnapshot,
  MetaCard,
  ReverseDcfReport,
} from '@stock-vetter/schema';
import { isTursoConfigured, migrate, pushTicker } from '@stock-vetter/pipeline';

const FIXTURES_DIR = 'fixtures';

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T;
}

interface LoadedTicker {
  ticker: string;
  metaCard: ReturnType<typeof MetaCard.parse>;
  primaryChecklist: unknown;
  financialSnapshot: ReturnType<typeof FinancialSnapshot.parse>;
  reverseDcf: ReturnType<typeof ReverseDcfReport.parse> | null;
  analystCards: ReturnType<typeof DecisionCard.parse>[];
}

async function loadTicker(ticker: string): Promise<LoadedTicker> {
  const base = join(FIXTURES_DIR, ticker);
  const metaCard = MetaCard.parse(await readJson(join(base, 'decision-card.json')));
  const primaryChecklist = await readJson(join(base, 'primary-source-checklist.json'));
  const financialSnapshot = FinancialSnapshot.parse(
    await readJson(join(base, 'financial-snapshot.json')),
  );
  let reverseDcf: LoadedTicker['reverseDcf'] = null;
  const rdcfPath = join(base, 'reverse-dcf.json');
  if (await fileExists(rdcfPath)) {
    reverseDcf = ReverseDcfReport.parse(await readJson(rdcfPath));
  }
  const analystCards: LoadedTicker['analystCards'] = [];
  try {
    const videoFiles = (await readdir(join(base, 'videos'))).filter((f) => f.endsWith('.json'));
    for (const f of videoFiles.sort()) {
      analystCards.push(DecisionCard.parse(await readJson(join(base, 'videos', f))));
    }
  } catch {
    // no videos/ dir — fine
  }
  return { ticker, metaCard, primaryChecklist, financialSnapshot, reverseDcf, analystCards };
}

async function main(): Promise<void> {
  if (!isTursoConfigured()) {
    console.error(
      'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set. Add them to .env to push fixtures.',
    );
    process.exit(1);
  }

  const requested = process.argv.slice(2).map((t) => t.toUpperCase());
  const allDirs = (await readdir(FIXTURES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const analyzed: string[] = [];
  const skipped: string[] = [];
  for (const t of allDirs.sort()) {
    if (requested.length > 0 && !requested.includes(t)) continue;
    if (await fileExists(join(FIXTURES_DIR, t, 'decision-card.json'))) analyzed.push(t);
    else skipped.push(t);
  }

  if (analyzed.length === 0) {
    console.error('No analyzed tickers found (no fixtures/<TICKER>/decision-card.json).');
    process.exit(1);
  }

  console.error(`[push-fixtures] running migrations...`);
  const applied = await migrate();
  console.error(
    applied.length > 0 ? `[push-fixtures] applied migrations: ${applied.join(', ')}` : `[push-fixtures] schema up to date`,
  );

  let ok = 0;
  let failed = 0;
  for (const t of analyzed) {
    try {
      const loaded = await loadTicker(t);
      await pushTicker({
        metaCard: loaded.metaCard,
        primaryChecklist: loaded.primaryChecklist,
        financialSnapshot: loaded.financialSnapshot,
        reverseDcf: loaded.reverseDcf,
        analystCards: loaded.analystCards,
      });
      ok += 1;
      console.log(
        `${t} ✓ (${loaded.metaCard.verdict} ${loaded.metaCard.weightedScore.toFixed(1)}, ${loaded.analystCards.length} video${loaded.analystCards.length === 1 ? '' : 's'})`,
      );
    } catch (e) {
      failed += 1;
      console.error(`${t} ✗ — ${(e as Error).message}`);
    }
  }

  if (skipped.length > 0) {
    console.log(
      `\nskipped (no decision-card.json yet): ${skipped.join(', ')}`,
    );
  }
  console.log(`\n${ok} pushed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
