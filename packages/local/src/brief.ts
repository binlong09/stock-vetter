// Aggregate per-chunk extractions into one filing brief.
//
// Deterministic — no model. A second LLM pass to "summarize the summaries"
// would add a fresh opportunity to hallucinate on top of output that has
// already been quote-verified, and would cost GPU time proportional to the
// universe. Everything here is dedup, counting, and ranking, all of which
// plain code does exactly right.
//
// The output is sized for the cloud tier: roughly 5,000 tokens, holding the
// evidence and the citations needed to reason about it, with the rest of the
// filing reachable on demand through the local lookback index rather than
// being carried in the prompt.

import type {
  BriefFlag,
  ChunkExtractionRecord,
  CrossFilingAnalysis,
  ExtractedMetric,
  FilingBrief,
  FlagSeverity,
} from '@stock-vetter/schema';
import { estimateTokens } from './tokens.js';

const SEVERITY_RANK: Record<FlagSeverity, number> = { low: 0, medium: 1, high: 2 };

export type BriefSource = {
  ticker: string;
  cik: string;
  accession: string;
  form: string;
  filingDate: string;
  eightKItems?: Array<{ number: string; label: string; severity: string }>;
  /**
   * Trends, composites, and recurrence computed across the company's filing
   * history. Null means "not computed" (no usable XBRL history), never
   * "nothing found" — the brief renders the distinction, because a reader
   * seeing no trends section should know which of the two happened.
   */
  crossFiling?: CrossFilingAnalysis | null;
  chunksAttempted: number;
  chunksFailed: number;
  warnings?: string[];
};

export type BriefOptions = {
  /** Soft ceiling on the brief. Lowest-value material is trimmed first. Default 5000. */
  targetTokens?: number;
  maxMetrics?: number;
  maxFlags?: number;
  maxClaims?: number;
  maxSummaryBullets?: number;
};

// Two flags are the same finding when they share a category and their claims
// agree on the numbers. Comparing normalized claim text alone merges distinct
// findings that happen to be phrased alike ("receivables grew faster than
// sales" in the segment note and in the MD&A are the same point; "DSO rose to
// 78 days" and "DSO rose to 61 days" are not).
function flagKey(f: { category: string; claim: string }): string {
  const numbers = (f.claim.match(/\d[\d,.]*/g) ?? []).join(',');
  const words = f.claim
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8)
    .join(' ');
  return `${f.category}|${numbers}|${words}`;
}

function metricKey(m: ExtractedMetric): string {
  return `${m.label.toLowerCase().replace(/[^a-z0-9]/g, '')}|${m.period}|${m.value ?? 'null'}`;
}

/**
 * Build the brief. Ranking, in order: severity, then how many distinct chunks
 * raised the flag, then category priority. A flag supported by four chunks of
 * a filing is better evidenced than one mentioned once.
 */
export function buildFilingBrief(
  records: ChunkExtractionRecord[],
  source: BriefSource,
  opts: BriefOptions = {},
): FilingBrief {
  const targetTokens = opts.targetTokens ?? 5000;
  const maxMetrics = opts.maxMetrics ?? 60;
  const maxFlags = opts.maxFlags ?? 30;
  const maxClaims = opts.maxClaims ?? 20;
  const maxSummary = opts.maxSummaryBullets ?? 40;

  // --- flags: dedup, count occurrences, rank -----------------------------
  const flagMap = new Map<string, BriefFlag>();
  for (const rec of records) {
    for (const f of rec.extraction.flags) {
      const key = flagKey(f);
      const existing = flagMap.get(key);
      if (existing) {
        existing.occurrences++;
        if (!existing.sourceChunkIds.includes(rec.chunkId)) existing.sourceChunkIds.push(rec.chunkId);
        // Keep the most severe reading of a repeated finding.
        if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) existing.severity = f.severity;
      } else {
        flagMap.set(key, { ...f, sourceChunkIds: [rec.chunkId], occurrences: 1 });
      }
    }
  }
  const flags = [...flagMap.values()].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.occurrences - a.occurrences ||
      a.category.localeCompare(b.category),
  );

  const flagCounts: Record<string, number> = {};
  for (const f of flags) flagCounts[f.category] = (flagCounts[f.category] ?? 0) + 1;

  // --- metrics: dedup identical figures ----------------------------------
  const metricMap = new Map<string, ExtractedMetric & { sourceChunkId: string }>();
  for (const rec of records) {
    for (const m of rec.extraction.metrics) {
      const key = metricKey(m);
      if (!metricMap.has(key)) metricMap.set(key, { ...m, sourceChunkId: rec.chunkId });
    }
  }
  // Metrics carrying a prior-period comparative come first: a figure with its
  // own YoY baseline is directly usable, one without needs a lookup.
  const metrics = [...metricMap.values()].sort((a, b) => {
    const aCmp = a.priorValue != null ? 1 : 0;
    const bCmp = b.priorValue != null ? 1 : 0;
    return bCmp - aCmp;
  });

  // --- management claims -------------------------------------------------
  const claimSeen = new Set<string>();
  const managementClaims: Array<FilingBrief['managementClaims'][number]> = [];
  for (const rec of records) {
    for (const c of rec.extraction.managementClaims) {
      const key = c.quote.toLowerCase().replace(/\s+/g, ' ').trim();
      if (claimSeen.has(key)) continue;
      claimSeen.add(key);
      managementClaims.push({ ...c, sourceChunkId: rec.chunkId });
    }
  }
  // Checkable claims first — they are what the cloud tier can actually verify.
  managementClaims.sort((a, b) => Number(b.checkable) - Number(a.checkable));

  // --- summary -----------------------------------------------------------
  const summarySeen = new Set<string>();
  const summary: string[] = [];
  for (const rec of records) {
    for (const s of rec.extraction.summary) {
      const key = s.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || summarySeen.has(key)) continue;
      summarySeen.add(key);
      summary.push(s);
    }
  }

  const warnings = [...(source.warnings ?? [])];
  const quotesDropped = records.reduce((n, r) => n + r.droppedForBadQuote, 0);
  const totalFindings =
    records.reduce(
      (n, r) =>
        n + r.extraction.metrics.length + r.extraction.flags.length + r.extraction.managementClaims.length,
      0,
    ) + quotesDropped;
  if (quotesDropped > 0 && totalFindings > 0) {
    const rate = quotesDropped / totalFindings;
    // A few dropped quotes is normal transcription drift. A quarter of them is
    // a model that is inventing, and the brief should say so rather than
    // presenting the survivors as if nothing happened.
    if (rate > 0.25) {
      warnings.push(
        `${quotesDropped} of ${totalFindings} findings (${(rate * 100).toFixed(0)}%) were dropped because ` +
          `their quotes were not in the source text — treat this brief's completeness as suspect`,
      );
    }
  }
  if (source.chunksFailed > 0) {
    warnings.push(
      `${source.chunksFailed} of ${source.chunksAttempted} chunks failed extraction — the brief is incomplete`,
    );
  }

  let brief: FilingBrief = {
    ticker: source.ticker,
    cik: source.cik,
    accession: source.accession,
    form: source.form,
    filingDate: source.filingDate,
    eightKItems: source.eightKItems ?? [],
    crossFiling: source.crossFiling ?? null,
    summary: summary.slice(0, maxSummary),
    metrics: metrics.slice(0, maxMetrics),
    flags: flags.slice(0, maxFlags),
    managementClaims: managementClaims.slice(0, maxClaims),
    flagCounts,
    chunksProcessed: records.length,
    chunksFailed: source.chunksFailed,
    quotesDropped,
    estimatedTokens: 0,
    warnings,
  };

  // Trim to the token target, cheapest material first. Flags are never
  // trimmed below the high-severity set — they are the reason the brief
  // exists.
  brief.estimatedTokens = estimateTokens(renderBriefMarkdown(brief));
  const trimOrder: Array<() => boolean> = [
    () => trimArray(brief, 'summary', 12),
    () => trimArray(brief, 'metrics', 20),
    () => trimArray(brief, 'managementClaims', 8),
    () => trimArray(brief, 'flags', Math.max(8, brief.flags.filter((f) => f.severity === 'high').length)),
  ];
  for (const trim of trimOrder) {
    if (brief.estimatedTokens <= targetTokens) break;
    while (brief.estimatedTokens > targetTokens && trim()) {
      brief.estimatedTokens = estimateTokens(renderBriefMarkdown(brief));
    }
  }
  brief = { ...brief, estimatedTokens: estimateTokens(renderBriefMarkdown(brief)) };
  return brief;
}

function trimArray<K extends 'summary' | 'metrics' | 'flags' | 'managementClaims'>(
  brief: FilingBrief,
  key: K,
  floor: number,
): boolean {
  const arr = brief[key] as unknown[];
  if (arr.length <= floor) return false;
  arr.length = arr.length - 1;
  return true;
}

/** The brief as the cloud model sees it. */
export function renderBriefMarkdown(brief: FilingBrief): string {
  const L: string[] = [];
  L.push(`# ${brief.ticker} — ${brief.form} filed ${brief.filingDate}`);
  L.push(`accession ${brief.accession} · CIK ${brief.cik}`);

  if (brief.warnings.length) {
    L.push('', '## Data quality warnings');
    for (const w of brief.warnings) L.push(`- ${w}`);
  }

  if (brief.eightKItems.length) {
    L.push('', '## 8-K items (deterministic, not model-derived)');
    for (const i of brief.eightKItems) L.push(`- **Item ${i.number}** ${i.label} — severity ${i.severity}`);
  }

  const cf = brief.crossFiling;
  if (cf) {
    L.push('', '## Cross-filing analysis (computed from XBRL, not model-extracted)');
    L.push(
      `_${cf.periodsAvailable} quarters of comparable data through ${cf.latestPeriod ?? 'n/a'}. ` +
        `Every figure below is arithmetic on values the filer tagged itself._`,
    );
    for (const w of cf.warnings) L.push(`- ⚠ ${w}`);

    if (cf.trends.length) {
      L.push('', '### Trends');
      for (const t of cf.trends) {
        L.push(`- **[${t.severity}] ${t.id}** — ${t.claim}`);
        L.push(
          `  - series: ${t.series.map((s) => `${s.period}=${Number(s.value.toFixed(2))}`).join(' → ')}`,
        );
        L.push(`  - source tags: ${t.sourceTags.join(', ') || 'n/a'}`);
        if (t.usesRestatedData) L.push('  - ⚠ uses a period that was later restated');
      }
    } else {
      L.push('', '### Trends', '_no multi-period deterioration detected_');
    }

    if (cf.recurrence.length) {
      L.push('', '### Repetition across filings');
      for (const r of cf.recurrence) {
        L.push(`- **[${r.severity}] ${r.id}** — ${r.claim}`);
        L.push(`  - this filing: "${r.quote.slice(0, 200)}"`);
        L.push(`  - prior: ${r.priorOccurrences.map((p) => `${p.form} ${p.filingDate}`).join(', ')}`);
      }
    }

    const composite: string[] = [];
    if (cf.beneish?.mScore != null) {
      composite.push(
        `Beneish M-score ${cf.beneish.mScore} vs threshold ${cf.beneish.threshold} — ` +
          `${cf.beneish.flagged ? 'FLAGGED' : 'not flagged'}` +
          (cf.beneish.dominantIndex ? `, driven mainly by ${cf.beneish.dominantIndex}` : '') +
          (cf.beneish.missing.length ? ` (unavailable: ${cf.beneish.missing.join(', ')})` : ''),
      );
    }
    if (cf.altman?.zScore != null) {
      composite.push(
        `Altman Z''-score ${cf.altman.zScore} — ${cf.altman.zone} zone (distress below ${cf.altman.distressThreshold})`,
      );
    }
    if (composite.length) {
      L.push('', '### Composite scores');
      for (const c of composite) L.push(`- ${c}`);
      L.push(
        '  - _These are screens, not verdicts. Beneish reports ~76% detection at a ~17.5% ' +
          'false-positive rate; read the dominant index before treating a flag as meaningful._',
      );
    }
  } else {
    L.push(
      '',
      '## Cross-filing analysis',
      '_Not computed — no usable XBRL history for this filer. This is an absence of analysis, ' +
        'not an absence of findings._',
    );
  }

  if (brief.flags.length) {
    L.push('', '## Flags (extracted by the local model from filing text)');
    for (const f of brief.flags) {
      L.push(
        `- **[${f.severity}] ${f.category}** — ${f.claim}` +
          (f.occurrences > 1 ? ` _(raised in ${f.occurrences} chunks)_` : ''),
      );
      L.push(`  - why: ${f.whyItMatters}`);
      L.push(`  - quote: "${f.quote}"`);
      L.push(`  - source: ${f.sourceChunkIds.join(', ')}`);
    }
  } else {
    L.push('', '## Flags (extracted by the local model from filing text)', '_none raised_');
  }

  if (brief.metrics.length) {
    L.push('', '## Metrics');
    for (const m of brief.metrics) {
      const prior = m.priorValue != null ? ` (prior ${m.priorPeriod ?? '?'}: ${m.priorValue})` : '';
      L.push(`- ${m.label}: ${m.value ?? 'n/a'} ${m.unit} — ${m.period}${prior}`);
      L.push(`  - quote: "${m.quote}"`);
    }
  }

  if (brief.managementClaims.length) {
    L.push('', '## Management claims');
    for (const c of brief.managementClaims) {
      L.push(`- ${c.claim}${c.checkable ? ' _(checkable)_' : ''}`);
      L.push(`  - quote: "${c.quote}"`);
    }
  }

  if (brief.summary.length) {
    L.push('', '## Filing summary');
    for (const s of brief.summary) L.push(`- ${s}`);
  }

  L.push(
    '',
    `_${brief.chunksProcessed} chunks processed, ${brief.chunksFailed} failed, ` +
      `${brief.quotesDropped} findings dropped for unverifiable quotes._`,
  );
  return L.join('\n');
}
