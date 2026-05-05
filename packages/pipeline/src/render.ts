import {
  isInsufficient,
  type DecisionCard,
  type ScoredDimension,
} from '@stock-vetter/schema';
import { formatTime } from './transcript-format.js';

function fmtScore(d: ScoredDimension): string {
  return isInsufficient(d) ? '— (insufficient)' : `${d.value.toFixed(1)} / 10`;
}

function fmtRationale(d: ScoredDimension): string {
  return isInsufficient(d) ? d.reason : d.rationale;
}

function fmtCitations(d: ScoredDimension): string[] {
  return isInsufficient(d) ? [] : d.citations;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtMoneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

function citation(c: { startSec: number; endSec: number }): string {
  return `[${formatTime(c.startSec)}–${formatTime(c.endSec)}]`;
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderMarkdown(card: DecisionCard): string {
  const lines: string[] = [];
  const e = card.extraction;
  const s = card.scored;

  lines.push(`# ${e.companyName} (${card.ticker}) — Decision Card`);
  lines.push('');
  lines.push(`**Verdict:** ${s.verdict}  •  **Weighted score:** ${s.weightedScore.toFixed(1)} / 10`);
  lines.push('');
  lines.push(`*Analyst:* ${e.analyst}   *Video date:* ${e.videoDate}   *Generated:* ${card.generatedAt.slice(0, 10)}   *Video:* ${card.videoId}`);
  lines.push('');
  lines.push(`> ${e.thesisOneLiner}`);
  lines.push('');

  // Scores
  lines.push('## Scores');
  lines.push('');
  lines.push('| Dimension | Score | Rationale |');
  lines.push('|---|---|---|');
  const dims: Array<[string, ScoredDimension]> = [
    ['Margin of Safety', s.scores.marginOfSafety],
    ['Valuation Attractiveness', s.scores.valuationAttractiveness],
    ['Business Quality', s.scores.businessQuality],
    ['Financial Health', s.scores.financialHealth],
    ['Analyst Rigor', s.scores.analystRigor],
  ];
  for (const [name, d] of dims) {
    lines.push(`| ${name} | ${fmtScore(d)} | ${escapePipe(fmtRationale(d))} |`);
  }
  lines.push('');

  // Citations under each score
  lines.push('### Score citations');
  lines.push('');
  for (const [name, d] of dims) {
    const cites = fmtCitations(d);
    if (!cites.length) continue;
    lines.push(`- **${name}**`);
    for (const c of cites) lines.push(`  - ${c}`);
  }
  lines.push('');

  // Pros/cons table
  lines.push('## Pros / Cons (analyst vs. critic)');
  lines.push('');
  lines.push('| Topic | Analyst view | LLM pushback | Agreement |');
  lines.push('|---|---|---|---|');
  for (const row of s.prosConsTable) {
    lines.push(
      `| ${escapePipe(row.topic)} | ${escapePipe(row.analystView)} | ${escapePipe(row.llmPushback)} | ${row.agreement} |`,
    );
  }
  lines.push('');

  // Things to verify
  if (s.thingsToVerify.length) {
    lines.push('## Things to verify');
    lines.push('');
    for (const t of s.thingsToVerify) lines.push(`- ${t}`);
    lines.push('');
  }

  // Snapshot summary
  if (card.financialSnapshot) {
    const f = card.financialSnapshot;
    lines.push('## Financial snapshot');
    lines.push('');
    lines.push(`*As of:* ${f.asOf}`);
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    lines.push(`| Price | ${fmtMoneyShort(f.price)} |`);
    lines.push(`| Market cap | ${fmtMoneyShort(f.marketCap)} |`);
    lines.push(`| Enterprise value | ${fmtMoneyShort(f.enterpriseValue)} |`);
    lines.push(`| Net cash | ${fmtMoneyShort(f.netCash)} |`);
    lines.push(`| P/E (TTM) | ${fmtNum(f.peRatio, 1)} |`);
    lines.push(`| EV / EBIT | ${fmtNum(f.evEbit, 1)} |`);
    lines.push(`| EV / Sales | ${fmtNum(f.evSales, 2)} |`);
    lines.push(`| FCF yield | ${f.fcfYield !== null ? `${(f.fcfYield * 100).toFixed(1)}%` : '—'} |`);
    lines.push(`| Profitable (last FY) | ${f.isProfitable ? 'yes' : 'no'} |`);
    lines.push(`| Positive FCF (last FY) | ${f.hasPositiveFcf ? 'yes' : 'no'} |`);
    lines.push(`| Share count trend (3y) | ${f.shareCountTrend} |`);
    lines.push('');
  } else {
    lines.push('## Financial snapshot');
    lines.push('');
    lines.push('_Unavailable for this ticker._');
    lines.push('');
  }

  // Thesis details
  if (e.valuation.keyAssumptions.length) {
    lines.push('## Valuation assumptions (analyst)');
    lines.push('');
    lines.push(`*Method:* ${e.valuation.method}  •  *Horizon:* ${e.valuation.timeHorizonYears} yr`);
    if (e.valuation.impliedReturn) {
      lines.push(
        `*Implied return:* ${(e.valuation.impliedReturn.low * 100).toFixed(1)}% – ${(
          e.valuation.impliedReturn.high * 100
        ).toFixed(1)}%`,
      );
    }
    lines.push('');
    lines.push('| Assumption | Value | Confidence | Citation |');
    lines.push('|---|---|---|---|');
    for (const a of e.valuation.keyAssumptions) {
      lines.push(
        `| ${escapePipe(a.assumption)} | ${escapePipe(a.value)} | ${a.analystConfidence} | ${citation(
          a.citation,
        )} |`,
      );
    }
    lines.push('');
  }

  // Critique appendix
  const c = card.critiques;
  const findingsBlock = (title: string, items: typeof c.consistency) => {
    if (!items.length) return;
    lines.push(`### ${title}`);
    lines.push('');
    for (const f of items) {
      lines.push(`- **[${f.severity}] ${f.topic}** (${f.type})`);
      lines.push(`  - Analyst: ${f.analystClaim}`);
      lines.push(`  - Pushback: ${f.llmPushback}`);
      lines.push(`  - Evidence: ${f.evidence}`);
    }
    lines.push('');
  };

  lines.push('## Critique findings');
  lines.push('');
  findingsBlock('Internal consistency', c.consistency);
  findingsBlock('Comps', c.comps);
  findingsBlock('Missing risks', c.missingRisks);

  if (c.stressTest.length) {
    lines.push('### Assumption stress tests');
    lines.push('');
    lines.push('| Assumption | Base | Bear (Δret) | Bull (Δret) | Sensitivity |');
    lines.push('|---|---|---|---|---|');
    for (const st of c.stressTest) {
      const bear = `${st.bearCase.value} (${(st.bearCase.impliedReturnDelta * 100).toFixed(0)}%)`;
      const bull = `${st.bullCase.value} (+${(st.bullCase.impliedReturnDelta * 100).toFixed(0)}%)`;
      lines.push(
        `| ${escapePipe(st.assumption)} | ${escapePipe(st.baseValue)} | ${escapePipe(bear)} | ${escapePipe(
          bull,
        )} | ${st.sensitivity} |`,
      );
    }
    lines.push('');
  }

  // Value checklist
  const vc = c.valueChecklist;
  lines.push('### Value-investing checklist');
  lines.push('');
  lines.push('| Criterion | Score (1–5) | Rationale |');
  lines.push('|---|---|---|');
  const vcRows: Array<[string, { score: number; rationale: string }]> = [
    ['Moat durability', vc.moatDurability],
    ['Owner earnings quality', vc.ownerEarningsQuality],
    ['Capital allocation', vc.capitalAllocation],
    ['Insider alignment', vc.insiderAlignment],
    ['Debt sustainability', vc.debtSustainability],
    ['Cyclicality awareness', vc.cyclicalityAwareness],
  ];
  for (const [name, item] of vcRows) {
    lines.push(`| ${name} | ${item.score} | ${escapePipe(item.rationale)} |`);
  }
  lines.push('');

  if (s.realityCheck) {
    lines.push('## Reality check');
    lines.push('');
    lines.push(s.realityCheck);
    lines.push('');
  }

  return lines.join('\n');
}
