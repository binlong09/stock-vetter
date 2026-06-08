// Render MetaCard as markdown — the user's primary artifact for ticker-first
// analysis.

import {
  PRIMARY_DIMENSION_KEYS,
  type MetaCard,
  type PrimaryDimensionKey,
} from '@stock-vetter/schema';

const DIMENSION_LABELS: Record<PrimaryDimensionKey, string> = {
  moatDurability: 'Moat durability',
  ownerEarningsQuality: 'Owner earnings quality',
  capitalAllocation: 'Capital allocation',
  debtSustainability: 'Debt sustainability',
  insiderAlignment: 'Insider alignment',
  cyclicalityAwareness: 'Cyclicality awareness',
};

export function renderMetaCardMarkdown(c: MetaCard): string {
  const lines: string[] = [];
  lines.push(`# ${c.ticker} — Decision Card`);
  lines.push('');
  // Headline.
  const stars =
    c.verdict === 'Strong Candidate' ? '🟢' :
    c.verdict === 'Watchlist' ? '🟡' :
    c.verdict === 'Pass' ? '🔴' :
    '⚪';
  lines.push(`**Verdict:** ${stars} ${c.verdict}  •  **Weighted score:** ${c.weightedScore.toFixed(1)} / 10`);
  lines.push('');
  lines.push(`*Generated:* ${c.generatedAt.slice(0, 10)}  •  *10-K:* \`${c.inputs.primarySourceFiling}\`  •  *Analyst videos:* ${c.inputs.analystVideoCount}`);
  if (c.inputs.analystVideoCount === 0) {
    lines.push('');
    lines.push('> *No analyst content configured for this ticker — verdict based on primary sources only.*');
  }
  lines.push('');
  // Summary prose.
  lines.push('## Summary');
  lines.push('');
  lines.push(c.summary);
  lines.push('');
  // Total cost footer in the summary section so the user always sees what
  // the analysis cost. Renders "n/a" for cards generated before this field
  // existed (backward compatibility).
  const costStr = c.totalLlmCost != null ? `$${c.totalLlmCost.toFixed(2)}` : 'n/a';
  lines.push(`*Total LLM cost for this analysis:* ${costStr} *(re-runs hit cache and cost $0).*`);
  lines.push('');
  // Dimension table.
  lines.push('## Dimension scores');
  lines.push('');
  lines.push('| Dimension | Score | Range | Uncertainty | Effective weight |');
  lines.push('|---|---|---|---|---|');
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const d = c.dimensions[key];
    const uncertaintyBadge =
      d.uncertainty === 'tight' ? 'tight' :
      d.uncertainty === 'moderate' ? 'moderate' :
      '⚠️ **high**';
    const rangeStr = d.range != null ? d.range.toFixed(1) : '—';
    lines.push(`| ${DIMENSION_LABELS[key]} | **${d.finalScore.toFixed(1)}** | ${rangeStr} | ${uncertaintyBadge} | ${d.effectiveWeight.toFixed(2)} |`);
  }
  lines.push('');
  // Per-dimension rationale (Pass 3 justifications).
  lines.push('### Dimension reasoning');
  lines.push('');
  for (const key of PRIMARY_DIMENSION_KEYS) {
    const d = c.dimensions[key];
    const tag = d.uncertainty === 'high' ? ' *(high uncertainty)*' : '';
    lines.push(`**${DIMENSION_LABELS[key]} (${d.finalScore.toFixed(1)})${tag}:** ${d.rationale}`);
    lines.push('');
  }
  // Valuation context.
  lines.push('## Valuation context');
  lines.push('');
  if (c.inputs.reverseDcfCentralImpliedCagr != null) {
    lines.push(`- Reverse DCF (10% discount, 20× terminal): market is pricing in **${(c.inputs.reverseDcfCentralImpliedCagr * 100).toFixed(1)}%** annual FCF growth for 10 years.`);
  }
  if (c.inputs.actualFcf5yCagr != null) {
    lines.push(`- Actual delivered 5-year FCF CAGR: **${(c.inputs.actualFcf5yCagr * 100).toFixed(1)}%**`);
  }
  if (c.inputs.reverseDcfCentralImpliedCagr != null && c.inputs.actualFcf5yCagr != null) {
    const gap = c.inputs.reverseDcfCentralImpliedCagr - c.inputs.actualFcf5yCagr;
    if (Math.abs(gap) > 0.05) {
      lines.push(
        `- Gap: ${gap > 0 ? '+' : ''}${(gap * 100).toFixed(1)}pp ` +
          (gap > 0
            ? '*(price embeds growth above the historical track record)*'
            : '*(price embeds growth below the historical track record)*'),
      );
    } else {
      lines.push(`- Gap: roughly aligned — price implies similar growth to delivered.`);
    }
  }
  lines.push('');
  lines.push('See `reverse-dcf.md` for full sensitivity grid.');
  lines.push('');
  // Cross-source findings (only when analyst content present).
  if (c.crossSourceFindings.length > 0) {
    lines.push('## Cross-source findings (analyst vs. primary-source)');
    lines.push('');
    lines.push('| Topic | Analyst view | Primary-source view | Agreement |');
    lines.push('|---|---|---|---|');
    for (const f of c.crossSourceFindings) {
      const ag =
        f.agreement === 'agree' ? '✓ agree' :
        f.agreement === 'partial' ? '~ partial' :
        '✗ disagree';
      lines.push(`| ${f.topic} | ${escapePipe(f.analystView)} | ${escapePipe(f.primarySourceView)} | ${ag} |`);
    }
    lines.push('');
    if (c.divergenceCommentary && c.divergenceCommentary.trim().length > 0) {
      lines.push('### What the disagreements mean');
      lines.push('');
      lines.push(c.divergenceCommentary);
      lines.push('');
    }
  }
  // Changes since the annual baseline (10-Q delta). ADDITIVE — does not affect
  // the verdict or any dimension score; provenance (which 10-Q vs which 10-K) is
  // shown so the comparison's basis is visible.
  if (c.tenqDelta) {
    const d = c.tenqDelta;
    lines.push('## Changes since annual baseline (10-Q)');
    lines.push('');
    lines.push(
      `*Comparing* 10-Q \`${d.tenqAccession}\` (filed ${d.tenqFilingDate}) ` +
        `*against* 10-K \`${d.tenkAccession}\` (filed ${d.tenkFilingDate}). ` +
        `*This is change detection only — it does not affect the verdict or dimension scores.*`,
    );
    lines.push('');
    if (d.summary.trim().length > 0) {
      lines.push(d.summary);
      lines.push('');
    }
    if (d.changes.length === 0) {
      lines.push('> No material qualitative change detected versus the annual baseline.');
      lines.push('');
    } else {
      for (const ch of d.changes) {
        const arrow =
          ch.direction === 'improving' ? '▲ improving' :
          ch.direction === 'deteriorating' ? '▼ deteriorating' :
          '◆ neutral-but-notable';
        lines.push(`### ${ch.area} — ${arrow}`);
        lines.push('');
        lines.push(ch.change);
        lines.push('');
        lines.push(`- **10-Q** (\`${ch.tenqCitation.section}\`): "${ch.tenqCitation.quote}"`);
        lines.push(`- **10-K** (\`${ch.tenkCitation.section}\`): "${ch.tenkCitation.quote}"`);
        lines.push('');
      }
    }
  }
  // Things to verify.
  lines.push('## Things to verify before acting');
  lines.push('');
  for (const t of c.thingsToVerify) {
    lines.push(`- ${t}`);
  }
  lines.push('');
  // Footnote.
  lines.push('---');
  lines.push('');
  lines.push(
    `*This card is a synthesis of the primary-source value-investing checklist (3 LLM passes per dimension, triple-sampled), reverse DCF, historical valuation context, and ${c.inputs.analystVideoCount > 0 ? 'analyst-video DecisionCards' : 'no analyst content'}. Citations and full reasoning live in \`primary-source-checklist.md\` and \`reverse-dcf.md\`. The tool produces this card to inform your judgment, not to substitute for it.*`,
  );
  return lines.join('\n');
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 250);
}
