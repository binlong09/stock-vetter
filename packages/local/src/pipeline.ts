// The orchestrator: one filing, end to end.
//
//   EDGAR → layout render → boilerplate strip → chunk        (deterministic)
//         → index into the local lookback store              (deterministic)
//         → per-chunk extraction on the local GPU            (local model)
//         → cross-filing trends, composites, recurrence      (deterministic)
//         → aggregate into one brief                         (deterministic)
//         → triage                                           (deterministic)
//         → synthesis, only if triage says so                (cloud model)
//
// Three ordering decisions worth stating outright:
//
//  1. The filing is indexed BEFORE extraction, and it is indexed even when
//     triage declines to escalate. The index is what verification reads, so
//     it must be populated before the cloud tier can check anything — and
//     this year's boring 10-K is next year's comparison baseline. Indexing is
//     cheap; re-fetching a filing you threw away is not.
//
//  2. Triage runs after extraction, not before. There is no way to know a
//     filing is boring without reading it, and reading it is the part that is
//     nearly free. What triage saves is cloud spend and human attention.
//
//  3. Cross-filing analysis runs after extraction and after indexing, because
//     the repeated-explanation detector needs this filing's management claims
//     and the recurrence detectors read the corpus. Everything in it is
//     computed as of the FILING's date, never today's — a backfill that scores
//     historical filings against later data looks like a brilliant strategy
//     and is not one.

import {
  fetchAndParseFiling,
  fetchEightK,
  fetchFilingSectionsWithLayout,
  fetchFilingSectionsWithLayoutByRef,
  fetchSeriesSet,
  type CostTracker,
  type LayoutBlock,
  type FilingRef,
  type ToolCallRecord,
} from '@stock-vetter/core';
import type { CrossFilingAnalysis, FilingBrief, ShortAssessment } from '@stock-vetter/schema';
import type { SeriesSet } from '@stock-vetter/core';
import { FORENSIC_CONCEPTS } from './concepts.js';
import { detectTrends } from './trends.js';
import { computeAnnualFundamentals } from './ratios.js';
import { altmanZScore, beneishMScore } from './composite-scores.js';
import { detectRecurringOneTimeCharges, detectRepeatedExplanations } from './recurrence.js';
import { stripBoilerplate, type StripReport } from './boilerplate.js';
import { chunkBlocks, type ChunkOptions, type FilingChunk } from './chunk.js';
import { extractChunks } from './extract.js';
import { buildFilingBrief } from './brief.js';
import { triage, type TriageDecision, type TriageOptions } from './triage.js';
import { synthesizeShortAssessment, type SynthesisOptions } from './synthesize.js';
import type { OllamaClient } from './ollama.js';
import type { LookbackIndex } from './lookback.js';

/** Sections worth reading for short work, in priority order. */
export const DEFAULT_SECTIONS = ['mda', 'financial-statements', 'quant-risk', 'risk-factors'];

export type ScanOptions = {
  sections?: string[];
  chunk?: ChunkOptions;
  triage?: TriageOptions;
  synthesis?: SynthesisOptions;
  /** Skip the local model entirely — fetch, chunk, and index only. */
  indexOnly?: boolean;
  /** Never call the cloud tier, whatever triage says. */
  noSynthesis?: boolean;
  /** Re-process a filing already in the index. */
  force?: boolean;
  /** Skip the XBRL fetch and cross-filing analysis entirely. */
  noCrossFiling?: boolean;
  onProgress?: (message: string) => void;
};

export type ScanResult = {
  ref: { ticker: string; accession: string; form: string; filingDate: string };
  chunks: number;
  indexed: { chunksIndexed: number; embedded: number };
  stripReports: StripReport[];
  brief: FilingBrief | null;
  decision: TriageDecision | null;
  assessment: ShortAssessment | null;
  crossFiling: CrossFilingAnalysis | null;
  toolCalls: ToolCallRecord[];
  /** Cloud-model turns spent. 0 when synthesis didn't run. */
  iterations: number;
  skipped: string | null;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Preparation (Phase 1)
// ---------------------------------------------------------------------------

export type PreparedFiling = {
  chunks: FilingChunk[];
  stripReports: StripReport[];
  warnings: string[];
  eightKItems: Array<{ number: string; label: string; severity: string }>;
};

/** Fetch a 10-K/10-Q (latest of its form) and chunk its financial sections. */
export async function preparePeriodicFiling(
  ticker: string,
  form: '10-K' | '10-Q',
  opts: ScanOptions = {},
): Promise<PreparedFiling & { meta: { cik: string; accession: string; filingDate: string } }> {
  return prepareFromSections(
    await fetchFilingSectionsWithLayout(ticker, form, opts.sections ?? DEFAULT_SECTIONS),
    opts,
  );
}

/** As above, for one specific filing found by an index sweep. */
export async function preparePeriodicFilingByRef(
  ref: FilingRef,
  opts: ScanOptions = {},
): Promise<PreparedFiling & { meta: { cik: string; accession: string; filingDate: string } }> {
  return prepareFromSections(
    await fetchFilingSectionsWithLayoutByRef(ref, opts.sections ?? DEFAULT_SECTIONS),
    opts,
  );
}

async function prepareFromSections(
  parsed: Awaited<ReturnType<typeof fetchFilingSectionsWithLayout>>,
  opts: ScanOptions,
): Promise<PreparedFiling & { meta: { cik: string; accession: string; filingDate: string } }> {
  const { meta, sections: rendered } = parsed;

  const chunks: FilingChunk[] = [];
  const stripReports: StripReport[] = [];
  const warnings: string[] = [...meta.parserWarnings];

  for (const s of rendered) {
    if (s.confidence === 'failed') {
      warnings.push(`section ${s.id} failed extraction — skipped`);
      continue;
    }
    if (s.layoutDegraded) {
      // The section is readable but its tables are run-on lines. Say so: the
      // extraction quality on this section will be materially worse and the
      // brief should not present it as equivalent.
      warnings.push(
        `section ${s.id}: could not map layout blocks onto the parsed section — ` +
          `tables in this section are flattened and figures may be mis-attributed`,
      );
    }
    // Use the layout blocks directly. Re-parsing `s.markdown` would lose the
    // heading/table/prose distinction the chunker depends on — `blocks` is
    // empty precisely when the layout join failed, which is the degraded case
    // handled below.
    const blocks = s.blocks.length ? s.blocks : markdownToBlocks(s.markdown);
    const stripped = stripBoilerplate(blocks);
    stripReports.push(...stripped.reports);
    warnings.push(...stripped.warnings.map((w) => `section ${s.id}: ${w}`));

    chunks.push(
      ...chunkBlocks(
        stripped.blocks,
        {
          ticker: meta.ticker,
          cik: meta.cik,
          accession: meta.accession,
          form: meta.form,
          filingDate: meta.filingDate,
          sectionId: s.id,
          sectionLabel: s.label,
        },
        opts.chunk,
      ),
    );
  }

  return {
    chunks,
    stripReports,
    warnings,
    eightKItems: [],
    meta: { cik: meta.cik, accession: meta.accession, filingDate: meta.filingDate },
  };
}

// Split already-rendered markdown back into blocks. Used for the 8-K path,
// whose item bodies arrive as markdown, and as the fallback when the layout
// join failed. Markdown tables must stay whole — the one thing a naive
// paragraph split gets wrong.
export function markdownToBlocks(markdown: string): LayoutBlock[] {
  const out: LayoutBlock[] = [];
  const lines = markdown.split('\n');
  let buf: string[] = [];
  let inTable = false;

  const flush = (): void => {
    const text = buf.join('\n').trim();
    buf = [];
    if (!text) return;
    if (inTable) {
      out.push({ kind: 'table', text: text.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim(), markdown: text, rows: [] });
    } else {
      const single = text.replace(/\s+/g, ' ').trim();
      const isHeading =
        single.length < 200 && (single === single.toUpperCase() || /^(NOTE|ITEM)\s/i.test(single));
      out.push({ kind: isHeading ? 'heading' : 'para', text: single, markdown: text });
    }
  };

  for (const line of lines) {
    const lineIsTable = line.startsWith('|');
    if (lineIsTable !== inTable) {
      flush();
      inTable = lineIsTable;
    }
    if (!line.trim() && !inTable) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

/** Fetch an 8-K and chunk its items plus exhibits. */
export async function prepareEightK(
  ref: FilingRef,
  opts: ScanOptions = {},
): Promise<PreparedFiling> {
  const filing = await fetchEightK(ref);
  const blocks = markdownToBlocks(filing.fullText);
  const stripped = stripBoilerplate(blocks);

  const chunks = chunkBlocks(
    stripped.blocks,
    {
      ticker: ref.ticker,
      cik: ref.cik,
      accession: ref.accession,
      form: ref.form,
      filingDate: ref.filingDate,
      sectionId: '8k',
      sectionLabel: `8-K items ${filing.parsed.items.map((i) => i.number).join(', ')}`,
    },
    opts.chunk,
  );

  return {
    chunks,
    stripReports: stripped.reports,
    warnings: stripped.warnings,
    eightKItems: filing.parsed.items.map((i) => ({
      number: i.number,
      label: i.label,
      severity: i.severity,
    })),
  };
}

// ---------------------------------------------------------------------------
// Full scan
// ---------------------------------------------------------------------------

export type ScanDeps = {
  ollama: OllamaClient;
  index: LookbackIndex;
  tracker: CostTracker;
};

/**
 * Run one prepared filing through indexing, extraction, aggregation, triage,
 * and (conditionally) synthesis.
 */
export async function scanPrepared(
  prepared: PreparedFiling,
  meta: { ticker: string; cik: string; accession: string; form: string; filingDate: string },
  deps: ScanDeps,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  const log = opts.onProgress ?? ((): void => undefined);
  const base: ScanResult = {
    ref: { ticker: meta.ticker, accession: meta.accession, form: meta.form, filingDate: meta.filingDate },
    chunks: prepared.chunks.length,
    indexed: { chunksIndexed: 0, embedded: 0 },
    stripReports: prepared.stripReports,
    brief: null,
    decision: null,
    assessment: null,
    crossFiling: null,
    toolCalls: [],
    iterations: 0,
    skipped: null,
    warnings: prepared.warnings,
  };

  if (!prepared.chunks.length) {
    return { ...base, skipped: 'no readable content after parsing and boilerplate removal' };
  }

  // Index first: verification reads from here, and today's filing is next
  // year's baseline whether or not it is interesting today.
  log(`indexing ${prepared.chunks.length} chunks`);
  base.indexed = await deps.index.indexFiling(prepared.chunks);

  if (opts.indexOnly) return { ...base, skipped: 'index-only run' };

  log(`extracting ${prepared.chunks.length} chunks on ${deps.ollama.model}`);
  let done = 0;
  const { records, failures } = await extractChunks(deps.ollama, prepared.chunks, {
    onChunk: (id, _rec, err) => {
      done++;
      log(`  chunk ${done}/${prepared.chunks.length}${err ? ` FAILED: ${err.message}` : ''}`);
    },
  });

  // Cross-filing analysis. Runs AFTER extraction because the repeated-
  // explanation detector needs this filing's management claims, and AFTER
  // indexing because the recurrence detectors read the corpus.
  let crossFiling: CrossFilingAnalysis | null = null;
  let series: SeriesSet | null = null;
  if (!opts.noCrossFiling) {
    try {
      log('computing cross-filing trends');
      const cf = await computeCrossFiling(
        { ticker: meta.ticker, cik: meta.cik, accession: meta.accession, filingDate: meta.filingDate },
        deps.index,
        records.flatMap((r) => r.extraction.managementClaims),
      );
      crossFiling = cf?.analysis ?? null;
      series = cf?.series ?? null;
      if (!cf) {
        base.warnings.push(
          'no XBRL history for this filer — cross-filing trends were not computed (this is an ' +
            'absence of analysis, not an absence of findings)',
        );
      }
    } catch (e) {
      // A company with no XBRL history is normal (recent IPO, foreign filer).
      // It must not take down a filing whose text analysis succeeded.
      base.warnings.push(`cross-filing analysis failed: ${(e as Error).message}`);
    }
  }
  base.crossFiling = crossFiling;

  const brief = buildFilingBrief(records, {
    ticker: meta.ticker,
    cik: meta.cik,
    accession: meta.accession,
    form: meta.form,
    filingDate: meta.filingDate,
    eightKItems: prepared.eightKItems,
    crossFiling,
    chunksAttempted: prepared.chunks.length,
    chunksFailed: failures.length,
    warnings: prepared.warnings,
  });
  base.brief = brief;

  const decision = triage(brief, opts.triage);
  base.decision = decision;
  log(`triage: score ${decision.score}/${decision.threshold} → ${decision.escalate ? 'ESCALATE' : 'hold'}`);

  if (!decision.escalate || opts.noSynthesis) {
    return {
      ...base,
      skipped: opts.noSynthesis ? 'synthesis disabled' : 'below triage threshold',
    };
  }

  log('synthesizing with the cloud model');
  const result = await synthesizeShortAssessment(brief, deps.index, deps.tracker, {
    ...opts.synthesis,
    series,
    // Cap the metric history at the filing's own date. Without this, analyzing
    // a 2024 filing hands the model 2026 numbers and every conclusion it draws
    // is contaminated by hindsight.
    asOf: meta.filingDate,
  });
  return {
    ...base,
    assessment: result.assessment,
    toolCalls: result.toolCalls,
    iterations: result.iterations,
  };
}

/**
 * Build the cross-filing analysis for one filing.
 *
 * `asOf` is the filing's own date throughout. XBRL payloads and the lookback
 * index both contain material filed later; using it would mean a backfill
 * silently scores every historical filing with hindsight, which looks like a
 * brilliant strategy and is not one.
 */
export async function computeCrossFiling(
  meta: { ticker: string; cik: string; accession: string; filingDate: string },
  index: LookbackIndex,
  managementClaims: Array<{ claim: string; quote: string }>,
): Promise<{ analysis: CrossFilingAnalysis; series: SeriesSet } | null> {
  const series = await fetchSeriesSet(meta.cik, FORENSIC_CONCEPTS);
  if (!series) return null;

  const trendResult = detectTrends(series, { asOf: meta.filingDate });
  const annual = computeAnnualFundamentals(series, { asOf: meta.filingDate });

  const [repeated, recurringCharges] = await Promise.all([
    detectRepeatedExplanations(
      index,
      { ticker: meta.ticker, accession: meta.accession, claims: managementClaims },
      { until: meta.filingDate },
    ),
    detectRecurringOneTimeCharges(
      index,
      { ticker: meta.ticker, accession: meta.accession },
      { until: meta.filingDate },
    ),
  ]);

  return {
    analysis: {
      trends: trendResult.findings,
      recurrence: [...repeated, ...recurringCharges],
      beneish: beneishMScore(annual),
      altman: altmanZScore(annual),
      periodsAvailable: trendResult.periodsAvailable,
      latestPeriod: trendResult.latestPeriod,
      warnings: trendResult.warnings,
    },
    // Returned alongside so the caller doesn't refetch a multi-megabyte
    // companyfacts payload to hand the same series to the synthesis tool.
    series,
  };
}

/** Convenience: scan a ticker's latest 10-K or 10-Q. */
export async function scanLatestPeriodic(
  ticker: string,
  form: '10-K' | '10-Q',
  deps: ScanDeps,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  const { meta } = await fetchAndParseFiling(ticker, form);
  if (!opts.force && (await deps.index.isIndexed(meta.accession))) {
    return {
      ref: { ticker: meta.ticker, accession: meta.accession, form, filingDate: meta.filingDate },
      chunks: 0,
      indexed: { chunksIndexed: 0, embedded: 0 },
      stripReports: [],
      brief: null,
      decision: null,
      assessment: null,
      crossFiling: null,
      toolCalls: [],
      iterations: 0,
      skipped: 'already indexed (pass force to re-run)',
      warnings: [],
    };
  }
  const prepared = await preparePeriodicFiling(ticker, form, opts);
  return scanPrepared(
    prepared,
    {
      ticker: meta.ticker,
      cik: prepared.meta.cik,
      accession: prepared.meta.accession,
      form,
      filingDate: prepared.meta.filingDate,
    },
    deps,
    opts,
  );
}

/** Scan a specific periodic filing found by an index sweep. */
export async function scanPeriodicByRef(
  ref: FilingRef,
  deps: ScanDeps,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  if (!opts.force && (await deps.index.isIndexed(ref.accession))) {
    return {
      ref: { ticker: ref.ticker, accession: ref.accession, form: ref.form, filingDate: ref.filingDate },
      chunks: 0,
      indexed: { chunksIndexed: 0, embedded: 0 },
      stripReports: [],
      brief: null,
      decision: null,
      assessment: null,
      crossFiling: null,
      toolCalls: [],
      iterations: 0,
      skipped: 'already indexed (pass force to re-run)',
      warnings: [],
    };
  }
  const prepared = await preparePeriodicFilingByRef(ref, opts);
  return scanPrepared(
    prepared,
    {
      ticker: ref.ticker,
      cik: prepared.meta.cik,
      accession: prepared.meta.accession,
      form: ref.form,
      filingDate: prepared.meta.filingDate,
    },
    deps,
    opts,
  );
}

/** Convenience: scan one 8-K by reference. */
export async function scanEightK(
  ref: FilingRef,
  deps: ScanDeps,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  const prepared = await prepareEightK(ref, opts);
  return scanPrepared(
    prepared,
    { ticker: ref.ticker, cik: ref.cik, accession: ref.accession, form: ref.form, filingDate: ref.filingDate },
    deps,
    opts,
  );
}
