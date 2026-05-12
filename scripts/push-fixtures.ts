#!/usr/bin/env tsx
/**
 * Backfill: push every analyzed ticker in `fixtures/` into Turso.
 *
 * A ticker counts as "analyzed" iff `fixtures/<TICKER>/decision-card.json`
 * exists — same gating artifact the `analyze-ticker` CLI uses. For each, this
 * loads decision-card.json, primary-source-checklist.json, financial-snapshot.json,
 * reverse-dcf.json (optional), and every videos/*.json via the shared fixture
 * loader (validates against the Zod schemas), then calls the same `pushTicker(...)`
 * the CLI uses — single code path, no drift. Idempotent: re-running overwrites.
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
import { readdir } from 'node:fs/promises';
import {
  hasDecisionCard,
  isTursoConfigured,
  migrate,
  pushTickerFromFixtures,
  loadTickerFixtures,
} from '@stock-vetter/pipeline';

const FIXTURES_DIR = 'fixtures';

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
    .map((d) => d.name)
    .sort();

  const analyzed: string[] = [];
  const skipped: string[] = [];
  for (const t of allDirs) {
    if (requested.length > 0 && !requested.includes(t)) continue;
    if (await hasDecisionCard(FIXTURES_DIR, t)) analyzed.push(t);
    else skipped.push(t);
  }

  if (analyzed.length === 0) {
    console.error('No analyzed tickers found (no fixtures/<TICKER>/decision-card.json).');
    process.exit(1);
  }

  console.error('[push-fixtures] running migrations...');
  const applied = await migrate();
  console.error(
    applied.length > 0
      ? `[push-fixtures] applied migrations: ${applied.join(', ')}`
      : '[push-fixtures] schema up to date',
  );

  let ok = 0;
  let failed = 0;
  for (const t of analyzed) {
    try {
      // Load once for the summary line, then push (push re-loads — cheap, and
      // keeps push-fixtures and analyze-ticker on the identical push path).
      const f = await loadTickerFixtures(FIXTURES_DIR, t);
      await pushTickerFromFixtures(FIXTURES_DIR, t);
      ok += 1;
      const n = f.analystCards.length;
      console.log(
        `${t} ✓ (${f.metaCard.verdict} ${f.metaCard.weightedScore.toFixed(1)}, ${n} video${n === 1 ? '' : 's'})`,
      );
    } catch (e) {
      failed += 1;
      console.error(`${t} ✗ — ${(e as Error).message}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\nskipped (no decision-card.json yet): ${skipped.join(', ')}`);
  }
  console.log(`\n${ok} pushed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
