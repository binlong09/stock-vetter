// The gate between the local tier and the cloud tier.
//
// A 2,000-company universe files roughly 20,000 documents a year — four
// periodic reports plus six-ish 8-Ks each. The local pass is close to free
// once the GPU is bought; the cloud pass is not, and more importantly a human
// then has to read whatever it produces. Escalating everything would cost real
// money and, worse, bury two genuine findings in four hundred "the company
// discussed its margins" writeups.
//
// So this scores a brief deterministically and decides. It is plain arithmetic
// on purpose: the gate must be auditable, stable between runs, and impossible
// to talk out of its answer. `reasons` records exactly what earned each point
// so a threshold can be tuned against outcomes instead of vibes.

import type { FilingBrief, ShortFlagCategory } from '@stock-vetter/schema';

// How predictive is a category, before severity? These are judgments about
// which disclosures actually precede repricings, not about which sound
// alarming. Weight 5 means "this alone is usually worth a human's attention";
// weight 1 means "only interesting alongside something else".
const CATEGORY_WEIGHT: Record<ShortFlagCategory, number> = {
  'going-concern': 5,
  auditor: 5,
  'internal-control': 5,
  'revenue-recognition': 4,
  'reserve-release': 4,
  'cash-conversion': 4,
  'related-party': 4,
  'cost-capitalization': 3,
  'receivables-quality': 3,
  'leverage-covenant': 3,
  liquidity: 3,
  'accounting-estimate-change': 3,
  'segment-reclassification': 3,
  'management-turnover': 3,
  'non-gaap-aggression': 2,
  'one-time-recurring': 2,
  'inventory-buildup': 2,
  dilution: 2,
  'goodwill-impairment': 2,
  guidance: 2,
  'litigation-regulatory': 2,
  'customer-concentration': 1,
  'supplier-concentration': 1,
  'margin-compression': 1,
  other: 1,
};

const SEVERITY_MULTIPLIER = { low: 1, medium: 2, high: 4 } as const;

export type TriageDecision = {
  escalate: boolean;
  score: number;
  threshold: number;
  reasons: string[];
  /** Set when the filing didn't parse well enough to judge either way. */
  dataQualityHold: boolean;
};

export type TriageOptions = {
  /** Score at or above which the filing goes to the cloud tier. Default 12. */
  threshold?: number;
  /** Escalate everything. For backfills and for calibrating the threshold. */
  force?: boolean;
  /** Periodic reports worth escalating regardless of score, e.g. ['10-K']. */
  alwaysEscalateForms?: string[];
};

export function triage(brief: FilingBrief, opts: TriageOptions = {}): TriageDecision {
  const threshold = opts.threshold ?? 12;
  const reasons: string[] = [];
  let score = 0;

  // --- deterministic 8-K items -------------------------------------------
  // These bypass scoring entirely. Item 4.02 is a company withdrawing its own
  // financial statements; no aggregate of soft flags should be able to
  // outvote it, and no reassuring narrative should be able to suppress it.
  let unconditional = false;
  for (const item of brief.eightKItems) {
    if (item.severity === 'critical') {
      reasons.push(`8-K Item ${item.number} (${item.label}) — critical, escalated unconditionally`);
      score += 100;
      unconditional = true;
    } else if (item.severity === 'high') {
      reasons.push(`8-K Item ${item.number} (${item.label}) — high severity`);
      score += 8;
    }
  }

  // --- flags --------------------------------------------------------------
  for (const f of brief.flags) {
    const weight = CATEGORY_WEIGHT[f.category] ?? 1;
    const base = weight * SEVERITY_MULTIPLIER[f.severity];
    // Corroboration across chunks counts, but weakly. Repetition inside a
    // filing usually means the same disclosure appears in both the MD&A and
    // the notes — that is one fact stated twice, not two pieces of evidence.
    // Eight mentions are worth 2.5×, not 8×.
    const corroboration = 1 + Math.log2(Math.max(1, f.occurrences)) / 2;
    const points = base * corroboration;
    score += points;
    if (points >= 4) {
      reasons.push(
        `${f.category} (${f.severity}${f.occurrences > 1 ? `, ×${f.occurrences}` : ''}): ` +
          `${f.claim.slice(0, 100)} [+${points.toFixed(1)}]`,
      );
    }
  }

  // --- cross-filing evidence ----------------------------------------------
  // Weighted 2x the equivalent single-filing flag, for two reasons. It is
  // exact — arithmetic on numbers the filer tagged, with no transcription step
  // that can go wrong — and it is multi-period, so it has already survived the
  // "was that just one odd quarter?" test that single-filing flags have not.
  const cf = brief.crossFiling;
  if (cf) {
    for (const t of cf.trends) {
      const weight = CATEGORY_WEIGHT[t.category] ?? 1;
      const points = weight * SEVERITY_MULTIPLIER[t.severity] * 2;
      score += points;
      reasons.push(
        `TREND ${t.id} (${t.severity}, ${t.consecutivePeriods} consecutive quarters): ` +
          `${t.claim.slice(0, 110)} [+${points.toFixed(1)}]`,
      );
    }

    for (const r of cf.recurrence) {
      const points = (CATEGORY_WEIGHT[r.category] ?? 1) * SEVERITY_MULTIPLIER[r.severity] * 1.5;
      score += points;
      reasons.push(
        `RECURRENCE ${r.id} across ${r.distinctPriorFilings} prior filings [+${points.toFixed(1)}]`,
      );
    }

    // Composites are screens, not verdicts. Beneish alone runs a ~17.5%
    // false-positive rate, which across 2,000 companies is hundreds of false
    // alarms a year — so a flag contributes, but never enough to escalate on
    // its own.
    if (cf.beneish?.flagged) {
      score += 5;
      reasons.push(
        `Beneish M-score ${cf.beneish.mScore} above ${cf.beneish.threshold}` +
          (cf.beneish.dominantIndex ? ` (driven by ${cf.beneish.dominantIndex})` : '') +
          ' [+5]',
      );
    }
    if (cf.altman?.zone === 'distress') {
      score += 6;
      reasons.push(`Altman Z''-score ${cf.altman.zScore} in the distress zone [+6]`);
    }
  }

  // --- combination bonus --------------------------------------------------
  // Several independent problem areas at once is qualitatively different from
  // one area shouting. Receivables AND inventory AND cash conversion is the
  // classic pattern; any one of them alone is usually just a quarter.
  const distinctHighish = new Set([
    ...brief.flags.filter((f) => f.severity !== 'low').map((f) => f.category),
    ...(cf?.trends ?? []).filter((t) => t.severity !== 'low').map((t) => t.category),
  ]).size;
  if (distinctHighish >= 3) {
    const bonus = distinctHighish * 2;
    score += bonus;
    reasons.push(`${distinctHighish} distinct non-trivial flag categories [+${bonus}]`);
  }

  // --- data quality -------------------------------------------------------
  // A filing we failed to read is not a filing with nothing in it. Escalating
  // it wastes cloud spend on a brief that is mostly holes; silently scoring it
  // zero pretends we checked. Neither — hold it and say so.
  const failedFraction =
    brief.chunksProcessed + brief.chunksFailed > 0
      ? brief.chunksFailed / (brief.chunksProcessed + brief.chunksFailed)
      : 0;
  // Cross-filing findings do not come from the chunks, so a bad text parse
  // says nothing about them. Holding a filing whose XBRL trends are damning
  // because its HTML failed to chunk would suppress the strongest evidence in
  // the brief for a reason unrelated to it.
  const strongCrossFiling = (cf?.trends ?? []).some((t) => t.severity === 'high');
  const dataQualityHold =
    !strongCrossFiling &&
    (failedFraction > 0.3 || brief.warnings.some((w) => /completeness as suspect/.test(w)));
  if (dataQualityHold) {
    reasons.push(
      `data quality hold: ${brief.chunksFailed}/${brief.chunksProcessed + brief.chunksFailed} chunks failed, ` +
        `${brief.quotesDropped} findings dropped for unverifiable quotes`,
    );
  }

  const alwaysForms = opts.alwaysEscalateForms ?? [];
  const formForced = alwaysForms.some((f) => brief.form.toUpperCase().startsWith(f.toUpperCase()));
  if (formForced) reasons.push(`form ${brief.form} is on the always-escalate list`);

  // `unconditional` outranks the data-quality hold. A filing whose chunks
  // mostly failed to parse but which carries an Item 4.02 still means the
  // company withdrew its financial statements — that fact came from the item
  // number, not from anything the local model read, so a bad parse is no
  // reason to suppress it.
  const escalate =
    opts.force === true || unconditional || formForced || (score >= threshold && !dataQualityHold);

  if (!escalate && !dataQualityHold && score < threshold) {
    reasons.push(`score ${score.toFixed(1)} below threshold ${threshold} — not escalated`);
  }

  return { escalate, score: Number(score.toFixed(1)), threshold, reasons, dataQualityHold };
}

/** Category weights, exposed so the CLI can print the scoring model. */
export { CATEGORY_WEIGHT, SEVERITY_MULTIPLIER };
