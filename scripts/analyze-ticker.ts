#!/usr/bin/env tsx
/**
 * scripts/analyze-ticker.ts
 *
 * Ticker-first entry point. Weekend 1 deliverable: fetch all configured
 * inputs (analyst videos via existing pipeline, latest 10-K/10-Q via SEC
 * fetcher, latest proxy via DEF 14A fetcher) and write them to disk under
 * fixtures/<TICKER>/. Synthesis (primary-source checklist, meta-card) is
 * deferred to Weekends 2-4.
 *
 * Usage:
 *   pnpm tsx scripts/analyze-ticker.ts <TICKER> [--debug]
 *
 * Output layout per ticker:
 *   fixtures/<TICKER>/
 *     videos/
 *       <videoId>.json        decision card per analyst video
 *     sec/
 *       <accession>/
 *         _meta.json          parser metadata, warnings, sections list
 *         business.md
 *         risk-factors.md
 *         ...
 *     proxy/
 *       <accession>.txt       cleaned proxy text (DEF 14A)
 */

import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fetchAndParseFiling, fetchLatestProxy, type FilingMeta } from '../packages/pipeline/src/sec-filings.js';
import { runPipeline } from '../packages/pipeline/src/orchestrate.js';
import { getVideoCard, putVideoCard } from '../packages/pipeline/src/cache.js';
import { runPrimarySourceFull } from '../packages/pipeline/src/primary-source.js';
import { renderPrimaryChecklistMarkdown } from '../packages/pipeline/src/primary-source-render.js';
import { verifyChecklistCitations, verifySkepticCitations } from '../packages/pipeline/src/citation-verifier.js';
import { fetchFinancialSnapshot } from '../packages/pipeline/src/financials.js';
import { buildReverseDcf, renderReverseDcfMarkdown } from '../packages/pipeline/src/reverse-dcf.js';
import { buildMetaCard } from '../packages/pipeline/src/meta-card.js';
import { renderMetaCardMarkdown } from '../packages/pipeline/src/meta-card-render.js';
import { DecisionCard, type FinancialSnapshot, type MetaCard, type PrimarySourceChecklist, type PrimarySourceJudgment, type PrimarySourceSkeptic, type ReverseDcfReport } from '@stock-vetter/schema';

const FIXTURES_ROOT = 'fixtures';

type TickerConfig = {
  videos?: string[];
  notes?: string;
};
type TickerRegistry = Record<string, TickerConfig | string>;

async function loadTickerConfig(ticker: string): Promise<TickerConfig> {
  const body = await readFile('data/tickers.json', 'utf-8');
  const reg = JSON.parse(body) as TickerRegistry;
  const entry = reg[ticker.toUpperCase()];
  if (!entry || typeof entry === 'string') {
    return { videos: [] };
  }
  return entry;
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
}

async function writeText(path: string, content: string): Promise<void> {
  await ensureDir(path);
  await writeFile(path, content, 'utf-8');
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeText(path, JSON.stringify(data, null, 2) + '\n');
}

async function processVideos(ticker: string, urls: string[], debug: boolean): Promise<{ ran: number; cached: number }> {
  let ran = 0;
  let cached = 0;
  for (const url of urls) {
    const m = url.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})/);
    const videoId = m ? (m[1] ?? m[2])! : url;
    const existing = await getVideoCard<unknown>(videoId);
    if (existing) {
      cached++;
      const target = join(FIXTURES_ROOT, ticker.toUpperCase(), 'videos', `${videoId}.json`);
      await writeJson(target, existing);
      console.error(`[ticker] video ${videoId}: cached`);
      continue;
    }
    console.error(`[ticker] video ${videoId}: running pipeline (this is slow)`);
    const card = await runPipeline(url, {
      debug,
      onProgress: (stage, costSoFar) => {
        process.stderr.write(`[pipeline:${videoId}] ${stage} ($${costSoFar.toFixed(3)})\n`);
      },
      onCostWarning: (cost) => process.stderr.write(`[pipeline:${videoId}] WARN cost ${cost.toFixed(3)}\n`),
      onCostAbort: (cost) => process.stderr.write(`[pipeline:${videoId}] ABORT cost ${cost.toFixed(3)}\n`),
    });
    await putVideoCard(videoId, card);
    const target = join(FIXTURES_ROOT, ticker.toUpperCase(), 'videos', `${videoId}.json`);
    await writeJson(target, card);
    ran++;
  }
  return { ran, cached };
}

async function processSec(ticker: string, form: '10-K' | '10-Q'): Promise<FilingMeta | null> {
  console.error(`[ticker] fetching latest ${form}...`);
  try {
    const { meta, getSection } = await fetchAndParseFiling(ticker, form);
    const accDir = join(FIXTURES_ROOT, ticker.toUpperCase(), 'sec', meta.accession);
    await writeJson(join(accDir, '_meta.json'), meta);
    for (const s of meta.sections) {
      const body = await getSection(s.id);
      if (body == null) continue;
      const header = `# ${s.label} (Item ${s.itemNumber})\n\n` +
        `*Filing:* ${meta.form} ${meta.filingDate} (accession ${meta.accession})\n` +
        `*Length:* ${s.charLength.toLocaleString()} chars  *Confidence:* ${s.confidence}\n` +
        (s.warnings.length ? `*Warnings:* ${s.warnings.join('; ')}\n` : '') +
        '\n---\n\n';
      await writeText(join(accDir, `${s.id}.md`), header + body);
    }
    const sectionSummary = meta.sections
      .map((s) => `${s.id}=${s.charLength}/${s.confidence}`)
      .join(' ');
    console.error(`[ticker] ${form} ${meta.accession}: ${meta.sections.length} sections | ${sectionSummary}`);
    if (meta.parserWarnings.length) {
      for (const w of meta.parserWarnings) console.error(`[ticker]   ${w}`);
    }
    return meta;
  } catch (e) {
    console.error(`[ticker] ${form} fetch failed: ${(e as Error).message}`);
    return null;
  }
}

async function processProxy(ticker: string): Promise<void> {
  console.error('[ticker] fetching latest DEF 14A...');
  try {
    const proxy = await fetchLatestProxy(ticker);
    if (!proxy) {
      console.error('[ticker] no DEF 14A found');
      return;
    }
    const target = join(FIXTURES_ROOT, ticker.toUpperCase(), 'proxy', `${proxy.accession}.txt`);
    await writeText(target, proxy.cleanedText);
    console.error(`[ticker] proxy ${proxy.accession}: ${proxy.cleanedText.length.toLocaleString()} chars`);
  } catch (e) {
    console.error(`[ticker] proxy fetch failed: ${(e as Error).message}`);
  }
}

async function processFinancialContext(
  ticker: string,
): Promise<{ snapshot: FinancialSnapshot | null; dcf: ReverseDcfReport | null }> {
  console.error('[ticker] fetching financial snapshot + computing reverse DCF...');
  try {
    const snapshot = await fetchFinancialSnapshot(ticker);
    if (!snapshot) {
      console.error('[ticker] no financial snapshot available');
      return { snapshot: null, dcf: null };
    }
    const target = join(FIXTURES_ROOT, ticker.toUpperCase(), 'financial-snapshot.json');
    await writeJson(target, snapshot);
    const dcf = buildReverseDcf(snapshot);
    if (!dcf) {
      console.error('[ticker] reverse DCF skipped (no FCF or shares data)');
      return { snapshot, dcf: null };
    }
    const dcfTarget = join(FIXTURES_ROOT, ticker.toUpperCase(), 'reverse-dcf.md');
    await writeText(dcfTarget, renderReverseDcfMarkdown(dcf));
    const dcfJsonTarget = join(FIXTURES_ROOT, ticker.toUpperCase(), 'reverse-dcf.json');
    await writeJson(dcfJsonTarget, dcf);
    const central = dcf.grid.find((c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20);
    const centralStr = central?.impliedFcfCagr != null ? `${(central.impliedFcfCagr * 100).toFixed(1)}%` : 'n/a';
    console.error(`[ticker] reverse DCF: central implied FCF CAGR (10% disc, 20× terminal) = ${centralStr}`);
    return { snapshot, dcf };
  } catch (e) {
    console.error(`[ticker] reverse DCF failed: ${(e as Error).message}`);
    return { snapshot: null, dcf: null };
  }
}

// Load all DecisionCards previously written for this ticker from fixtures/.
// These are the per-video analyst pipeline outputs. Returns empty array
// when none configured.
async function loadAnalystCards(ticker: string): Promise<DecisionCard[]> {
  const dir = join(FIXTURES_ROOT, ticker.toUpperCase(), 'videos');
  const cards: DecisionCard[] = [];
  try {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const body = await readFile(join(dir, f), 'utf-8');
        const parsed = DecisionCard.parse(JSON.parse(body));
        cards.push(parsed);
      } catch (err) {
        console.error(`[ticker] skipping malformed card ${f}: ${(err as Error).message}`);
      }
    }
  } catch {
    // No videos directory — no analyst content. Expected for many tickers.
  }
  return cards;
}

async function processMetaCard(
  ticker: string,
  pass1: PrimarySourceChecklist,
  pass3: PrimarySourceJudgment,
  snapshot: FinancialSnapshot | null,
  dcf: ReverseDcfReport | null,
): Promise<MetaCard | null> {
  console.error('[ticker] synthesizing meta-card...');
  try {
    const analystCards = await loadAnalystCards(ticker);
    const card = await buildMetaCard({
      ticker,
      pass1,
      pass3,
      reverseDcf: dcf,
      snapshot,
      analystCards,
      options: {
        onProgress: (stage, cost) =>
          process.stderr.write(`[meta-card:${stage}] cost so far $${cost.toFixed(3)}\n`),
      },
    });
    const mdTarget = join(FIXTURES_ROOT, ticker.toUpperCase(), 'decision-card.md');
    await writeText(mdTarget, renderMetaCardMarkdown(card));
    const jsonTarget = join(FIXTURES_ROOT, ticker.toUpperCase(), 'decision-card.json');
    await writeJson(jsonTarget, card);
    console.error(`[ticker] meta-card: ${card.verdict} (${card.weightedScore.toFixed(1)} / 10)`);
    return card;
  } catch (e) {
    console.error(`[ticker] meta-card failed: ${(e as Error).message}`);
    return null;
  }
}

async function processPrimaryChecklist(
  ticker: string,
  snapshot: FinancialSnapshot | null,
  reverseDcf: ReverseDcfReport | null,
): Promise<{
  pass1: PrimarySourceChecklist;
  pass2: PrimarySourceSkeptic;
  pass3: PrimarySourceJudgment;
} | null> {
  console.error('[ticker] running primary-source value checklist (3 passes)...');
  try {
    const { pass1, pass2, pass3 } = await runPrimarySourceFull(ticker, {
      onProgress: (stage, cost) =>
        process.stderr.write(`[primary-source:${stage}] cost so far $${cost.toFixed(3)}\n`),
      // Reuse the snapshot + DCF we already built so the LLM Pass 1/2/3
      // calls don't re-fetch from Yahoo three times.
      snapshot,
      dcf: reverseDcf,
    });
    // Verify citations from both Pass 1 and Pass 2 against source files.
    const pass1Verification = await verifyChecklistCitations(pass1);
    const pass2Verification = await verifySkepticCitations(pass2);
    console.error(
      `[primary-source] Pass 1 citations: ${pass1Verification.exact}/${pass1Verification.total} exact, ` +
        `${pass1Verification.whitespaceNormalized} ws-norm, ${pass1Verification.caseInsensitive} case-only, ` +
        `${pass1Verification.punctuationNormalized} punct-norm, ${pass1Verification.noMatch} no-match`,
    );
    console.error(
      `[primary-source] Pass 2 citations: ${pass2Verification.exact}/${pass2Verification.total} exact, ` +
        `${pass2Verification.whitespaceNormalized} ws-norm, ${pass2Verification.caseInsensitive} case-only, ` +
        `${pass2Verification.punctuationNormalized} punct-norm, ${pass2Verification.noMatch} no-match`,
    );
    if (pass1Verification.noMatch > 0) {
      console.error(`[primary-source] WARNING: ${pass1Verification.noMatch} Pass 1 citations could not be located`);
    }
    if (pass2Verification.noMatch > 0) {
      console.error(`[primary-source] WARNING: ${pass2Verification.noMatch} Pass 2 citations could not be located`);
    }

    const target = join(FIXTURES_ROOT, ticker.toUpperCase(), 'primary-source-checklist.md');
    await writeText(target, renderPrimaryChecklistMarkdown(pass1, pass1Verification, pass2, pass3));
    const jsonTarget = join(FIXTURES_ROOT, ticker.toUpperCase(), 'primary-source-checklist.json');
    await writeJson(jsonTarget, { pass1, pass2, pass3, pass1Verification, pass2Verification });
    return { pass1, pass2, pass3 };
  } catch (e) {
    console.error(`[ticker] primary-source checklist failed: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const ticker = args.find((a) => !a.startsWith('--'));
  const debug = args.includes('--debug');
  const skipLlm = args.includes('--no-llm');
  if (!ticker) {
    console.error('Usage: pnpm tsx scripts/analyze-ticker.ts <TICKER> [--debug] [--no-llm]');
    process.exit(1);
  }
  const upper = ticker.toUpperCase();
  console.error(`[ticker] ${upper}: starting`);

  const cfg = await loadTickerConfig(upper);
  const videoUrls = cfg.videos ?? [];
  console.error(`[ticker] config: ${videoUrls.length} analyst videos configured`);

  // Run all stages. Each one independently logs progress and tolerates
  // failure of the others — partial output is more useful than no output.
  const results = {
    videos: { ran: 0, cached: 0 },
    tenK: null as FilingMeta | null,
    tenQ: null as FilingMeta | null,
    primaryChecklist: null as Awaited<ReturnType<typeof processPrimaryChecklist>>,
    snapshot: null as FinancialSnapshot | null,
    reverseDcf: null as ReverseDcfReport | null,
    metaCard: null as MetaCard | null,
  };

  if (videoUrls.length && !skipLlm) {
    results.videos = await processVideos(upper, videoUrls, debug);
  }
  results.tenK = await processSec(upper, '10-K');
  results.tenQ = await processSec(upper, '10-Q');
  await processProxy(upper);
  const fc = await processFinancialContext(upper);
  results.snapshot = fc.snapshot;
  results.reverseDcf = fc.dcf;
  if (!skipLlm && results.tenK) {
    results.primaryChecklist = await processPrimaryChecklist(upper, results.snapshot, results.reverseDcf);
  }
  // Meta-card synthesizes everything into one verdict. Requires the
  // primary-source checklist (which requires a 10-K). Reverse DCF and
  // analyst cards are optional inputs.
  if (!skipLlm && results.primaryChecklist) {
    results.metaCard = await processMetaCard(
      upper,
      results.primaryChecklist.pass1,
      results.primaryChecklist.pass3,
      results.snapshot,
      results.reverseDcf,
    );
  }

  console.error('');
  console.error(`[ticker] ${upper}: done`);
  console.error(`  videos: ${results.videos.ran} fresh, ${results.videos.cached} cached`);
  console.error(`  10-K: ${results.tenK ? `${results.tenK.sections.length}/${results.tenK.sections.length + results.tenK.missing.length} sections (${results.tenK.missing.length} missing)` : 'failed'}`);
  console.error(`  10-Q: ${results.tenQ ? `${results.tenQ.sections.length} sections` : 'failed'}`);
  if (results.metaCard) {
    console.error(`  decision: ${results.metaCard.verdict} (${results.metaCard.weightedScore.toFixed(1)} / 10)`);
  }
  console.error(`  artifacts: fixtures/${upper}/decision-card.md`);
}

main().catch((e) => {
  console.error('[ticker] FATAL:', e);
  process.exit(1);
});
