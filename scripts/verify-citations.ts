#!/usr/bin/env tsx
/**
 * Verify all citations in fixtures/<TICKER>/primary-source-checklist.json
 * by grep-checking each quote against the cited source file. Reports per-
 * citation pass/fail, and exits non-zero if any quote can't be located.
 *
 * Usage: pnpm tsx scripts/verify-citations.ts <TICKER>
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrimarySourceChecklist, PrimarySourceSkeptic } from '@stock-vetter/schema';
import { verifyChecklistCitations, verifySkepticCitations } from '../packages/pipeline/src/citation-verifier.js';

async function main() {
  const ticker = process.argv[2];
  if (!ticker) {
    console.error('Usage: pnpm tsx scripts/verify-citations.ts <TICKER>');
    process.exit(2);
  }
  const path = join('fixtures', ticker.toUpperCase(), 'primary-source-checklist.json');
  const body = await readFile(path, 'utf-8');
  const raw = JSON.parse(body) as { pass1?: unknown; pass2?: unknown };
  // The on-disk format wraps three passes; we accept both old and new layouts.
  const pass1Raw = raw.pass1 ?? raw;
  const pass1 = PrimarySourceChecklist.parse(pass1Raw);
  const pass2 = raw.pass2 ? PrimarySourceSkeptic.parse(raw.pass2) : null;

  const r1 = await verifyChecklistCitations(pass1);
  console.log(
    `Pass 1: ${r1.total} citations — ${r1.exact} exact, ${r1.whitespaceNormalized} ws-norm, ${r1.caseInsensitive} case-only, ${r1.punctuationNormalized} punct-norm, ${r1.noMatch} NO-MATCH`,
  );
  for (const d of r1.details) {
    if (d.matchTier === 'no-match') {
      console.log(`  P1 NO-MATCH [${d.dimension}/${d.citationIndex}] section=${d.section} (${d.lookedIn})`);
      console.log(`    quote: "${d.quotePreview}..."`);
    }
  }
  let r2NoMatch = 0;
  if (pass2) {
    const r2 = await verifySkepticCitations(pass2);
    console.log(
      `Pass 2: ${r2.total} citations — ${r2.exact} exact, ${r2.whitespaceNormalized} ws-norm, ${r2.caseInsensitive} case-only, ${r2.punctuationNormalized} punct-norm, ${r2.noMatch} NO-MATCH`,
    );
    for (const d of r2.details) {
      if (d.matchTier === 'no-match') {
        console.log(`  P2 NO-MATCH [${d.dimension}/${d.citationIndex}] section=${d.section} (${d.lookedIn})`);
        console.log(`    quote: "${d.quotePreview}..."`);
      }
    }
    r2NoMatch = r2.noMatch;
  }
  if (r1.noMatch + r2NoMatch > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
