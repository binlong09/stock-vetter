// Renders a CrossFilingAnalysis (the short-scanner's XBRL forensic tier) into
// markdown. Kept here, in the pipeline package, so both the meta-card renderer
// and scripts/analyze-ticker.ts can use it — it depends only on the schema
// type, never on @stock-vetter/local where the detectors that produce the data
// live. That keeps the local package (Ollama, libsql) out of the pipeline's
// dependency graph.

import type { CrossFilingAnalysis } from '@stock-vetter/schema';

/**
 * A self-contained "Forensic cross-filing signals" section. Every figure is
 * arithmetic on values the filer tagged in XBRL — no model produced any of it,
 * so it is the computed counterweight to the model-read primary-source
 * checklist. Additive: it reports, it does not score.
 */
export function renderCrossFilingMarkdown(cf: CrossFilingAnalysis): string {
  const L: string[] = [];
  L.push('## Forensic cross-filing signals (computed from XBRL)');
  L.push(
    `_${cf.periodsAvailable} quarters of comparable data through ${cf.latestPeriod ?? 'n/a'}. ` +
      `Every figure below is arithmetic on values the company tagged itself — not a model's reading. ` +
      `An empty section means stable numbers or no XBRL history, never "nothing to see"._`,
  );
  for (const w of cf.warnings) L.push(`- ⚠ ${w}`);

  if (cf.trends.length) {
    L.push('', '### Multi-period trends');
    for (const t of cf.trends) {
      L.push(`- **[${t.severity}] ${t.id}** — ${t.claim}`);
      L.push(`  - series: ${t.series.map((s) => `${s.period}=${Number(s.value.toFixed(2))}`).join(' → ')}`);
      if (t.usesRestatedData) L.push('  - ⚠ uses a period that was later restated');
    }
  } else {
    L.push('', '### Multi-period trends', '_no multi-period deterioration detected_');
  }

  if (cf.recurrence.length) {
    L.push('', '### Repetition across filings');
    for (const r of cf.recurrence) {
      L.push(`- **[${r.severity}] ${r.id}** — ${r.claim}`);
    }
  }

  const composite: string[] = [];
  if (cf.beneish?.mScore != null) {
    composite.push(
      `Beneish M-score ${cf.beneish.mScore} vs threshold ${cf.beneish.threshold} — ` +
        `${cf.beneish.flagged ? 'FLAGGED' : 'not flagged'}` +
        (cf.beneish.dominantIndex ? `, driven mainly by ${cf.beneish.dominantIndex}` : ''),
    );
  }
  if (cf.altman?.zScore != null) {
    composite.push(
      `Altman Z''-score ${cf.altman.zScore} — ${cf.altman.zone} zone (distress below ${cf.altman.distressThreshold})`,
    );
  }
  if (composite.length) {
    L.push('', '### Composite screens (not verdicts)');
    for (const c of composite) L.push(`- ${c}`);
  }

  return L.join('\n');
}
