#!/usr/bin/env tsx
/**
 * scripts/scan.ts
 *
 * The short-side scanner CLI. Runs the local-GPU pipeline over one ticker or
 * over a universe swept from EDGAR's daily index.
 *
 * Usage:
 *   pnpm scan NVDA                          # latest 10-K
 *   pnpm scan NVDA --form=10-Q
 *   pnpm scan NVDA --8k --since=2026-06-01  # every 8-K since a date
 *   pnpm scan --universe=data/universe.json --since=2026-07-01
 *
 * Flags:
 *   --form=10-K|10-Q      periodic form to scan (default 10-K)
 *   --8k                  scan 8-Ks rather than periodic reports
 *   --since=YYYY-MM-DD    lower bound on filing date (universe/8-K modes)
 *   --limit=N             cap the number of filings processed
 *   --index-only          fetch, chunk, and index; no model calls at all
 *   --no-synthesis        run the local tier only; never call the cloud model
 *   --keyword-only        index without embeddings (BM25 only); no embed server needed
 *   --force-synthesis     escalate every filing, ignoring triage
 *   --always=10-K         forms to escalate regardless of score (repeatable)
 *   --threshold=N         triage threshold (default 12)
 *   --max-tokens=N        chunk ceiling (default 8000)
 *   --force               re-process filings already in the index
 *   --out=DIR             write briefs and assessments here (default fixtures/short)
 *   --quiet
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listFilings,
  newCostTracker,
  summarizeCost,
  sweepFilings,
  type FilingRef,
} from '@stock-vetter/core';
import {
  LookbackIndex,
  OllamaClient,
  Embedder,
  renderAssessmentMarkdown,
  renderBriefMarkdown,
  scanEightK,
  scanLatestPeriodic,
  scanPeriodicByRef,
  summarizeLocalStats,
  type ScanOptions,
  type ScanResult,
} from '@stock-vetter/local';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
};
const flags = (name: string): string[] =>
  argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(a.indexOf('=') + 1));
const positional = argv.filter((a) => !a.startsWith('--'));

const quiet = flag('quiet') != null;
const log = (m: string): void => {
  if (!quiet) process.stdout.write(`${m}\n`);
};

type UniverseFile = { tickers?: Array<{ ticker: string; cik: string }>; _doc?: string };

async function loadUniverse(path: string): Promise<Map<string, string>> {
  const raw = JSON.parse(await readFile(path, 'utf-8')) as UniverseFile;
  if (!raw.tickers?.length) {
    throw new Error(`${path} has no "tickers" array. Build one with: pnpm build-universe`);
  }
  return new Map(raw.tickers.map((t) => [t.cik, t.ticker]));
}

function summarize(r: ScanResult): string {
  const bits = [`${r.ref.ticker} ${r.ref.form} ${r.ref.filingDate}`];
  if (r.skipped) bits.push(`skipped: ${r.skipped}`);
  if (r.decision) bits.push(`triage ${r.decision.score}/${r.decision.threshold}`);
  if (r.assessment) bits.push(`${r.assessment.verdict} (${r.assessment.conviction}/10)`);
  return bits.join(' · ');
}

async function writeOutputs(outDir: string, r: ScanResult): Promise<void> {
  if (!r.brief) return;
  const dir = join(outDir, r.ref.ticker, r.ref.accession);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'brief.md'), renderBriefMarkdown(r.brief), 'utf-8');
  await writeFile(join(dir, 'brief.json'), JSON.stringify(r.brief, null, 2), 'utf-8');
  if (r.decision) {
    await writeFile(join(dir, 'triage.json'), JSON.stringify(r.decision, null, 2), 'utf-8');
  }
  if (r.assessment) {
    await writeFile(
      join(dir, 'assessment.md'),
      renderAssessmentMarkdown(r.brief, {
        assessment: r.assessment,
        toolCalls: r.toolCalls,
        iterations: r.iterations,
      }),
      'utf-8',
    );
    await writeFile(join(dir, 'assessment.json'), JSON.stringify(r.assessment, null, 2), 'utf-8');
  }
}

async function main(): Promise<void> {
  const outDir = flag('out') ?? 'fixtures/short';
  const indexOnly = flag('index-only') != null;
  const noSynthesis = flag('no-synthesis') != null;
  const universePathArg = flag('universe');

  // Validate arguments before touching Ollama, so a typo'd invocation reports
  // the typo rather than "cannot reach Ollama".
  if (!universePathArg && !positional[0]) {
    process.stderr.write('Usage: pnpm scan <TICKER> [flags]  |  --universe=<path> --since=<date>\n');
    process.exit(1);
  }
  if (universePathArg && !flag('since')) {
    process.stderr.write('--since=YYYY-MM-DD is required in universe mode\n');
    process.exit(1);
  }

  const ollama = new OllamaClient({
    numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 16384),
  });

  // Fail fast and specifically. "Connection refused" three minutes into a
  // universe sweep is a much worse way to learn the model isn't pulled.
  if (!indexOnly) {
    const health = await ollama.health();
    if (!health.ok) {
      process.stderr.write(`Ollama not ready: ${health.detail}\n`);
      if (health.models.length) process.stderr.write(`Models present: ${health.models.join(', ')}\n`);
      process.exit(1);
    }
    log(`local model: ${ollama.model} (num_ctx ${ollama.numCtx})`);
  }

  // Keyword-only skips the embedder entirely — the vector arm of retrieval is
  // dropped, but the run needs no embedding server. Useful when the local model
  // is served by something without an embeddings endpoint (e.g. a single-model
  // llama.cpp), or just to avoid GPU time when testing the local tier.
  const keywordOnly = flag('keyword-only') != null;
  const index = await LookbackIndex.open({ embedder: keywordOnly ? null : new Embedder() });
  const tracker = newCostTracker();

  const opts: ScanOptions = {
    indexOnly,
    noSynthesis,
    force: flag('force') != null,
    chunk: { maxTokens: Number(flag('max-tokens') ?? 8000) },
    triage: {
      threshold: flag('threshold') ? Number(flag('threshold')) : undefined,
      force: flag('force-synthesis') != null,
      alwaysEscalateForms: flags('always'),
    },
    onProgress: (m) => log(`    ${m}`),
  };

  const results: ScanResult[] = [];
  const limit = flag('limit') ? Number(flag('limit')) : Infinity;
  const universePath = flag('universe');

  try {
    if (universePath) {
      // Universe mode: one EDGAR request per calendar day covers every
      // company, rather than one request per company per day.
      const cikToTicker = await loadUniverse(universePath);
      const since = flag('since')!;
      log(`sweeping ${cikToTicker.size} companies since ${since}`);

      const entries = await sweepFilings({
        ciks: new Set(cikToTicker.keys()),
        forms: ['10-K', '10-Q', '8-K'],
        since: new Date(`${since}T00:00:00Z`),
      });
      log(`${entries.length} matching filings in the window`);

      for (const e of entries.slice(0, limit)) {
        const ticker = cikToTicker.get(e.cik)!;
        log(`\n${ticker} ${e.form} ${e.filingDate} (${e.accession})`);
        try {
          // The daily index gives no primary-document name, so resolve the
          // exact filing from the company's own list — touched only for
          // companies that actually filed. Every filing is then scanned BY
          // ACCESSION: a window spanning several quarters contains several
          // 10-Qs, and routing them through "the latest 10-Q" would process
          // the newest one repeatedly and silently drop the rest.
          const refs = await listFilings(ticker, { forms: [e.form], since: e.filingDate });
          const ref = refs.find((r) => r.accession === e.accession);
          if (!ref) {
            log('  could not resolve the primary document — skipped');
            continue;
          }
          results.push(
            e.form.startsWith('8-K')
              ? await scanEightK(ref, { ollama, index, tracker }, opts)
              : await scanPeriodicByRef(ref, { ollama, index, tracker }, opts),
          );
        } catch (err) {
          // One company's bad filing must not end a universe sweep.
          process.stderr.write(`  ERROR ${ticker} ${e.accession}: ${(err as Error).message}\n`);
        }
      }
    } else {
      const ticker = positional[0]!;
      if (flag('8k') != null) {
        const refs: FilingRef[] = await listFilings(ticker, {
          forms: ['8-K'],
          since: flag('since'),
          limit: Number.isFinite(limit) ? limit : 10,
        });
        log(`${refs.length} 8-K filings for ${ticker}`);
        for (const ref of refs) {
          log(`\n${ref.form} ${ref.filingDate} (${ref.accession})`);
          results.push(await scanEightK(ref, { ollama, index, tracker }, opts));
        }
      } else {
        const form = (flag('form') ?? '10-K') as '10-K' | '10-Q';
        log(`\n${ticker} ${form}`);
        results.push(await scanLatestPeriodic(ticker, form, { ollama, index, tracker }, opts));
      }
    }

    for (const r of results) await writeOutputs(outDir, r);

    log('\n─────────────────────────────────────────────');
    for (const r of results) log(summarize(r));

    const escalated = results.filter((r) => r.assessment).length;
    const held = results.filter((r) => r.decision?.dataQualityHold).length;
    log(
      `\n${results.length} filings · ${escalated} escalated to the cloud model` +
        (held ? ` · ${held} held on data quality` : ''),
    );
    log(summarizeLocalStats(ollama.stats));
    const cost = summarizeCost(tracker);
    const stages = Object.values(cost.byStage);
    const fresh = stages.reduce((n, s) => n + s.inputTokens, 0);
    const out = stages.reduce((n, s) => n + s.outputTokens, 0);
    log(
      `cloud cost: $${cost.total.toFixed(4)} · ` +
        `${fresh.toLocaleString()} input · ${out.toLocaleString()} output · ` +
        `${cost.totalCacheReadTokens.toLocaleString()} cache-read · ${cost.totalCacheWriteTokens.toLocaleString()} cache-write`,
    );
    if (results.some((r) => r.brief)) log(`written to ${outDir}/`);
  } finally {
    await index.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
