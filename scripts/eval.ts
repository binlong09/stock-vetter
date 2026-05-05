#!/usr/bin/env tsx
/**
 * scripts/eval.ts — see header comment in original skeleton for behavior.
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { runPipeline } from '../packages/pipeline/src/orchestrate.js';
import type { DecisionCard } from '@stock-vetter/schema';

type Case = {
  ticker: string;
  yourView: 'buy' | 'avoid' | 'unsure';
  videoUrl: string;
  notes: string;
};

type Result = {
  ticker: string;
  yourView: Case['yourView'];
  llmVerdict: string;
  agreement: '✓' | 'partial' | '✗' | 'n/a' | '?';
  mainPushback: string;
};

function computeAgreement(view: Case['yourView'], verdict: string): Result['agreement'] {
  if (verdict === 'Insufficient Data' || verdict === 'ERROR') return '?';
  if (view === 'unsure') return 'n/a';
  if (view === 'buy') {
    if (verdict === 'Strong Candidate') return '✓';
    if (verdict === 'Watchlist') return 'partial';
    if (verdict === 'Pass') return '✗';
  }
  if (view === 'avoid') {
    if (verdict === 'Pass') return '✓';
    if (verdict === 'Watchlist') return 'partial';
    if (verdict === 'Strong Candidate') return '✗';
  }
  return '?';
}

function pickMainPushback(card: DecisionCard): string {
  const sevRank = (s: string) => (s === 'blocker' ? 3 : s === 'concern' ? 2 : 1);

  // First: highest-severity disagreement in the pros/cons table
  const disagreements = card.scored.prosConsTable.filter(
    (r) => r.agreement === 'disagree' || r.agreement === 'partial',
  );
  if (disagreements.length) {
    const text = disagreements[0]!.llmPushback;
    return truncate(text, 30);
  }

  // Fall back: first concern/blocker across the critiques
  const all = [
    ...card.critiques.consistency,
    ...card.critiques.comps,
    ...card.critiques.missingRisks,
  ].sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
  const top = all.find((f) => f.severity === 'blocker' || f.severity === 'concern');
  if (top) return truncate(top.llmPushback, 30);

  return '—';
}

function truncate(s: string, n: number): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  return cleaned.length <= n ? cleaned : cleaned.slice(0, n - 1) + '…';
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function renderTable(results: Result[]): string {
  const lines: string[] = [];
  lines.push('| Ticker | Your view | LLM verdict | Agreement | Main pushback |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    lines.push(
      `| ${escapePipe(r.ticker)} | ${r.yourView} | ${escapePipe(r.llmVerdict)} | ${r.agreement} | ${escapePipe(r.mainPushback)} |`,
    );
  }
  return lines.join('\n');
}

async function main() {
  const casesPath = process.argv.includes('--cases')
    ? process.argv[process.argv.indexOf('--cases') + 1]!
    : 'scripts/eval-cases.json';

  const cases: Case[] = JSON.parse(await readFile(casesPath, 'utf-8'));

  const results: Result[] = [];
  for (const c of cases) {
    process.stderr.write(`[eval] running ${c.ticker}...\n`);
    try {
      const card = await runPipeline(c.videoUrl, { onProgress: () => {} });
      results.push({
        ticker: c.ticker,
        yourView: c.yourView,
        llmVerdict: card.scored.verdict,
        agreement: computeAgreement(c.yourView, card.scored.verdict),
        mainPushback: pickMainPushback(card),
      });
    } catch (err) {
      results.push({
        ticker: c.ticker,
        yourView: c.yourView,
        llmVerdict: 'ERROR',
        agreement: '?',
        mainPushback: truncate((err as Error).message, 30),
      });
    }
  }

  process.stdout.write(renderTable(results) + '\n');

  const scorable = results.filter((r) => r.agreement !== 'n/a' && r.agreement !== '?');
  const agreed = scorable.filter((r) => r.agreement === '✓').length;
  const rate = scorable.length > 0 ? (agreed / scorable.length) * 100 : 0;
  process.stderr.write(`\n[eval] agreement rate: ${rate.toFixed(0)}% (${agreed}/${scorable.length})\n`);
  if (rate < 50 && scorable.length >= 3) {
    process.stderr.write(`[eval] WARNING: agreement below 50% — prompts may need tuning\n`);
  }
}

main();
