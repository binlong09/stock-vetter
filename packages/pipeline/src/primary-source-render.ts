// Render PrimarySourceChecklist as a teaching-grade markdown document.
// The point is not just to display scores but to make the citations
// inspectable: what passage of which section, and why does it matter?

import {
  isInsufficientPrimary,
  PRIMARY_DIMENSION_KEYS,
  type PrimaryDimensionKey,
  type PrimarySourceChecklist,
  type PrimarySourceJudgment,
  type PrimarySourceSkeptic,
} from '@stock-vetter/schema';
import type { VerificationResult } from './citation-verifier.js';

const DIMENSION_LABELS: Record<PrimaryDimensionKey, string> = {
  moatDurability: 'Moat durability',
  ownerEarningsQuality: 'Owner earnings quality',
  capitalAllocation: 'Capital allocation',
  debtSustainability: 'Debt sustainability',
  insiderAlignment: 'Insider alignment',
  cyclicalityAwareness: 'Cyclicality awareness',
};

export function renderPrimaryChecklistMarkdown(
  c: PrimarySourceChecklist,
  verification?: VerificationResult,
  skeptic?: PrimarySourceSkeptic,
  judgment?: PrimarySourceJudgment,
): string {
  // Build a quick lookup: dimension+index → match tier, so each citation can
  // surface its verification status inline.
  const tierFor = new Map<string, string>();
  if (verification) {
    for (const v of verification.details) {
      tierFor.set(`${v.dimension}|${v.citationIndex}`, v.matchTier);
    }
  }
  const lines: string[] = [];
  lines.push(`# ${c.ticker} — Primary-Source Value Checklist`);
  lines.push('');
  lines.push(`*Source:* 10-K accession \`${c.filingAccession}\` + DEF 14A (where used)`);
  if (verification) {
    lines.push(
      `*Citation verification:* ${verification.exact}/${verification.total} exact, ` +
        `${verification.whitespaceNormalized} whitespace-normalized, ` +
        `${verification.caseInsensitive} case-only, ` +
        `${verification.punctuationNormalized} punctuation-normalized, ` +
        `${verification.noMatch} **no-match**`,
    );
    if (verification.noMatch > 0) {
      lines.push('');
      lines.push(`> ⚠️ ${verification.noMatch} citation(s) could not be located in the cited source. See annotations below.`);
    }
  }
  lines.push('');
  lines.push('Each dimension is scored 1–10 from primary sources only (no analyst opinions). Citations point to specific 10-K or proxy passages so you can verify the reasoning yourself — and learn what to look for in primary documents.');
  lines.push('');

  // Quick summary table — show Pass 1, Pass 2 adjustment (if available), and Final.
  lines.push('## Scores at a glance');
  lines.push('');
  if (judgment) {
    lines.push('| Dimension | Pass 1 | Skeptic Δ | Final | Decision |');
    lines.push('|---|---|---|---|---|');
    for (const key of PRIMARY_DIMENSION_KEYS) {
      const d = c.scores[key];
      const pass1Score = isInsufficientPrimary(d) ? 'insufficient' : d.score.toFixed(1);
      const adj = skeptic?.rebuttals[key].recommendedAdjustment ?? 0;
      const adjStr = adj === 0 ? '0' : (adj > 0 ? `+${adj.toFixed(1)}` : adj.toFixed(1));
      const j = judgment.finalScores[key];
      lines.push(`| ${DIMENSION_LABELS[key]} | ${pass1Score} | ${adjStr} | ${j.finalScore.toFixed(1)} | ${j.decision} |`);
    }
  } else {
    lines.push('| Dimension | Score |');
    lines.push('|---|---|');
    for (const key of PRIMARY_DIMENSION_KEYS) {
      const d = c.scores[key];
      const score = isInsufficientPrimary(d) ? 'insufficient' : d.score.toFixed(1);
      lines.push(`| ${DIMENSION_LABELS[key]} | ${score} |`);
    }
  }
  lines.push('');

  // Per-dimension detail.
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const d = c.scores[key];
    lines.push(`## ${DIMENSION_LABELS[key]}`);
    lines.push('');
    if (isInsufficientPrimary(d)) {
      lines.push(`**Score:** insufficient`);
      lines.push('');
      lines.push(`*Reason:* ${d.reason}`);
      lines.push('');
      continue;
    }
    // Surface triple-sampling variance when present. Range >1.5 = high
    // uncertainty per the meta-card weighting policy; <=0.5 = tight.
    let varianceTag = '';
    if (d.samples && d.samples.length > 1 && d.range != null) {
      const rng = d.range;
      const samplesStr = d.samples.map((s) => s.toFixed(1)).join(', ');
      const tag =
        rng <= 0.5 ? '*(tight: low uncertainty)*' :
        rng <= 1.5 ? '*(moderate variance)*' :
        '**(high uncertainty — see annotation below)**';
      varianceTag = `   _samples: [${samplesStr}], range ${rng.toFixed(1)}_ ${tag}`;
    }
    lines.push(`**Score:** ${d.score.toFixed(1)} / 10${varianceTag}`);
    lines.push('');
    lines.push(d.rationale);
    if (d.samples && d.range != null && d.range > 1.5) {
      lines.push('');
      lines.push(`> ⚠️ **High uncertainty:** the three independent samples returned ${d.samples.map((s) => s.toFixed(1)).join(', ')}. The median (${d.score.toFixed(1)}) is shown but the rubric is ambiguous for this case. Treat the score as a range, not a point estimate, and weigh the rationale carefully.`);
    }
    lines.push('');
    lines.push('### Citations');
    lines.push('');
    for (let i = 0; i < d.citations.length; i++) {
      const cit = d.citations[i]!;
      const tier = tierFor.get(`${key}|${i}`);
      const tierBadge =
        tier === 'exact' ? '' :
        tier === 'whitespace-normalized' ? ' *(whitespace-normalized match)*' :
        tier === 'case-insensitive' ? ' *(case-only match)*' :
        tier === 'punctuation-normalized' ? ' *(punctuation-normalized match)*' :
        tier === 'no-match' ? ' **⚠️ NO-MATCH**' : '';
      lines.push(`- **\`${cit.section}\`**${tierBadge} — "${cit.quote}"`);
      lines.push(`  *Why it matters:* ${cit.whyItMatters}`);
    }
    lines.push('');
    if (d.counterEvidence && d.counterEvidence.toLowerCase() !== 'no significant counter-evidence') {
      lines.push('### Pass 1 counter-evidence considered');
      lines.push('');
      lines.push(d.counterEvidence);
      lines.push('');
    }
    // Pass 2: skeptic rebuttal for this dimension.
    const sk = skeptic?.rebuttals[key];
    if (sk) {
      lines.push('### Pass 2 — Skeptic');
      lines.push('');
      const adjStr = sk.recommendedAdjustment === 0
        ? 'no change recommended'
        : sk.recommendedAdjustment > 0
          ? `recommends +${sk.recommendedAdjustment.toFixed(1)} (upgrade)`
          : `recommends ${sk.recommendedAdjustment.toFixed(1)} (downgrade)`;
      lines.push(`*Adjustment: ${adjStr}*`);
      lines.push('');
      lines.push(sk.rebuttal);
      if (sk.citations.length) {
        lines.push('');
        for (const cit of sk.citations) {
          lines.push(`- **\`${cit.section}\`** — "${cit.quote}"`);
          lines.push(`  *Why it matters:* ${cit.whyItMatters}`);
        }
      }
      lines.push('');
    }
    // Pass 3: judge decision and final score.
    const j = judgment?.finalScores[key];
    if (j) {
      lines.push('### Pass 3 — Judge');
      lines.push('');
      lines.push(`**Final score: ${j.finalScore.toFixed(1)} / 10** *(decision: ${j.decision})*`);
      lines.push('');
      lines.push(j.justification);
      lines.push('');
    }
  }
  return lines.join('\n');
}
