#!/usr/bin/env tsx
/**
 * scripts/trends.ts
 *
 * Cross-filing trend analysis for one company, straight from its XBRL.
 *
 * This needs no GPU and no Ollama — it reads the company's own tagged
 * financial data from EDGAR and does arithmetic. That makes it the fastest way
 * to sanity-check a name, and the right place to calibrate detector thresholds
 * before running a universe sweep that depends on them.
 *
 * Usage:
 *   pnpm trends NVDA
 *   pnpm trends NVDA --as-of=2024-01-31   # what a filing that date would have seen
 *   pnpm trends NVDA --metric=dso         # print one metric's full series
 *   pnpm trends NVDA --json
 *   pnpm trends --detectors                # list the detectors and exit
 */
import 'dotenv/config';
import { fetchSeriesSet, resolveCik } from '@stock-vetter/core';
import {
  FORENSIC_CONCEPTS,
  TREND_DETECTOR_IDS,
  altmanZScore,
  beneishMScore,
  computeAnnualFundamentals,
  computeRatios,
  detectTrends,
  renderCompositeScores,
  type PeriodRatios,
} from '@stock-vetter/local';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return hit ? (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true') : undefined;
};
const ticker = argv.find((a) => !a.startsWith('--'));

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(v) ? '   n/a' : v.toFixed(digits).padStart(6);
}

async function main(): Promise<void> {
  if (flag('detectors') != null) {
    process.stdout.write(`${TREND_DETECTOR_IDS.join('\n')}\n`);
    return;
  }
  if (!ticker) {
    process.stderr.write('Usage: pnpm trends <TICKER> [--as-of=YYYY-MM-DD] [--metric=dso] [--json]\n');
    process.exit(1);
  }

  const asOf = flag('as-of');
  const cik = await resolveCik(ticker);
  const series = await fetchSeriesSet(cik, FORENSIC_CONCEPTS);
  if (!series) {
    process.stderr.write(`No XBRL facts for ${ticker} (CIK ${cik}). Recent IPO or a foreign filer?\n`);
    process.exit(1);
  }

  const rows = computeRatios(series, { asOf });
  const result = detectTrends(series, { asOf });
  const annual = computeAnnualFundamentals(series, { asOf });
  const m = beneishMScore(annual);
  const z = altmanZScore(annual);

  if (flag('json') != null) {
    process.stdout.write(
      JSON.stringify({ ticker, cik, asOf: asOf ?? null, trends: result, beneish: m, altman: z }, null, 2) + '\n',
    );
    return;
  }

  const single = flag('metric') as keyof PeriodRatios | undefined;
  if (single) {
    process.stdout.write(`${ticker} — ${single}${asOf ? ` (as of ${asOf})` : ''}\n\n`);
    for (const r of rows) {
      const v = r[single];
      process.stdout.write(`  ${r.period}  ${typeof v === 'number' ? fmt(v) : '   n/a'}\n`);
    }
    return;
  }

  process.stdout.write(
    `${ticker} (${series.entityName ?? 'unknown'}) — ${result.periodsAvailable} quarters ` +
      `through ${result.latestPeriod ?? 'n/a'}${asOf ? `, as of ${asOf}` : ''}\n\n`,
  );

  // A compact ratio table. Reading the series is usually more informative than
  // reading the detector output, because it shows the trend the detectors
  // declined to report as well as the ones they did.
  process.stdout.write('  period    DSO    DIO    DPO    CCC   GM%   CFO/NI  accr%\n');
  for (const r of rows.slice(-9)) {
    process.stdout.write(
      `  ${r.period.padEnd(8)}${fmt(r.dso, 1)} ${fmt(r.dio, 1)} ${fmt(r.dpo, 1)} ${fmt(r.ccc, 1)} ` +
        `${fmt(r.grossMargin != null ? r.grossMargin * 100 : null, 1)} ${fmt(r.cfoToNetIncome)} ` +
        `${fmt(r.accrualRatio != null ? r.accrualRatio * 100 : null, 1)}\n`,
    );
  }

  process.stdout.write('\nDetected trends\n');
  if (!result.findings.length) {
    process.stdout.write('  none\n');
  }
  for (const f of result.findings) {
    process.stdout.write(`  [${f.severity}] ${f.id}\n    ${f.claim}\n`);
    process.stdout.write(
      `    series: ${f.series.map((s) => `${s.period}=${Number(s.value.toFixed(2))}`).join(' → ')}\n`,
    );
    if (f.usesRestatedData) process.stdout.write('    ⚠ uses a period later restated\n');
  }

  const composites = renderCompositeScores(m, z);
  if (composites.length) {
    process.stdout.write('\nComposite screens (not verdicts)\n');
    for (const c of composites) process.stdout.write(`  ${c}\n`);
    if (m?.indices.length) {
      process.stdout.write('  Beneish components:\n');
      for (const i of m.indices) {
        process.stdout.write(`    ${i.name.padEnd(6)} ${fmt(i.value, 3)}  ${i.note}\n`);
      }
    }
  }

  if (result.warnings.length || result.unavailable.length) {
    process.stdout.write('\nCoverage\n');
    for (const w of result.warnings) process.stdout.write(`  ⚠ ${w}\n`);
    if (result.unavailable.length) {
      process.stdout.write(`  detectors that could not run: ${result.unavailable.join(', ')}\n`);
    }
  }
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
