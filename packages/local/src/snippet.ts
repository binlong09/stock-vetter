// Pull the relevant ~500-token window out of a matched chunk.
//
// Retrieval returns an 8,000-token chunk; the cloud model wants the paragraph
// or table row where the figure actually lives. Naively slicing a window
// around the best-matching line produces the single worst possible artifact
// for financial verification:
//
//   | Accounts receivable, net | 1,204.5 | 987.1 |
//
// Two numbers, no periods, no units, no scale. That is not a verification —
// it is an invitation to assert whichever reading confirms the thesis. So
// when a window lands inside a markdown table, the table's caption, header
// row, and separator are prepended, always.

import { estimateTokens, truncateToTokens } from './tokens.js';

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9.,%$-]+/)
    .map((t) => t.replace(/^[.,%$-]+|[.,%$-]+$/g, ''))
    .filter((t) => t.length > 2);
}

function scoreLine(line: string, terms: string[]): number {
  const l = line.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!l.includes(t)) continue;
    // A digit-bearing term matching is stronger evidence than a common word:
    // the query "days sales outstanding 78" is really asking about the 78.
    score += /\d/.test(t) ? 3 : 1;
  }
  return score;
}

type TableContext = { header: string[]; startLine: number } | null;

// Walk backwards from `line` to find the header of the markdown table it sits
// in, if any. A table is header row, separator row (| --- |), then data rows.
function tableContextFor(lines: string[], line: number): TableContext {
  if (!lines[line]?.startsWith('|')) return null;
  let i = line;
  while (i >= 0 && lines[i]!.startsWith('|')) i--;
  const gridStart = i + 1;
  const sepIdx = lines.findIndex((l, idx) => idx >= gridStart && /^\|[\s|-]*---[\s|-]*\|?$/.test(l));
  if (sepIdx === -1 || sepIdx > line) return null;
  const header: string[] = [];
  // Caption lines sit immediately above the grid ("Year Ended December 31,",
  // "(in millions)"). They carry the units and the period.
  for (let c = gridStart - 1; c >= 0 && c >= gridStart - 3; c--) {
    const l = lines[c]!.trim();
    if (!l || l.startsWith('|')) break;
    header.unshift(l);
  }
  for (let h = gridStart; h <= sepIdx; h++) header.push(lines[h]!);
  return { header, startLine: gridStart };
}

export type Snippet = {
  text: string;
  /** True when a table header/caption was prepended for context. */
  tableContextAdded: boolean;
  estimatedTokens: number;
};

/**
 * Extract the passage of `chunkText` most relevant to `query`, at most
 * `maxTokens` long.
 */
export function extractSnippet(chunkText: string, query: string, maxTokens = 500): Snippet {
  const lines = chunkText.split('\n');
  const terms = queryTerms(query);

  // Score a sliding 3-line window so a figure and its surrounding sentence
  // score together.
  let bestLine = 0;
  let bestScore = -1;
  for (let i = 0; i < lines.length; i++) {
    let s = 0;
    for (let j = i; j < Math.min(lines.length, i + 3); j++) s += scoreLine(lines[j]!, terms);
    if (s > bestScore) {
      bestScore = s;
      bestLine = i;
    }
  }

  // No term matched anywhere: return the head of the chunk rather than an
  // arbitrary middle, so the caller at least sees the section heading.
  if (bestScore <= 0) {
    const text = truncateToTokens(chunkText, maxTokens);
    return { text, tableContextAdded: false, estimatedTokens: estimateTokens(text) };
  }

  const table = tableContextFor(lines, bestLine);
  const headerLines = table?.header ?? [];
  const headerTokens = estimateTokens(headerLines.join('\n'));
  const budget = Math.max(50, maxTokens - headerTokens);

  // Grow outward from the best line until the budget is spent, preferring to
  // extend forward (the sentence after a figure usually explains it).
  let start = bestLine;
  let end = bestLine;
  let used = estimateTokens(lines[bestLine] ?? '');
  while (used < budget) {
    const canForward = end + 1 < lines.length;
    const canBack = start - 1 >= 0 && !(table && start - 1 < table.startLine);
    if (!canForward && !canBack) break;
    if (canForward) {
      const t = estimateTokens(lines[end + 1]!);
      if (used + t > budget) break;
      end++;
      used += t;
    }
    if (canBack) {
      const t = estimateTokens(lines[start - 1]!);
      if (used + t > budget) break;
      start--;
      used += t;
    }
  }

  const body = lines.slice(start, end + 1).join('\n');
  // Don't repeat the header if the window already reaches it.
  const needsHeader = headerLines.length > 0 && start > (table?.startLine ?? 0);
  const text = needsHeader ? `${headerLines.join('\n')}\n${body}` : body;

  return {
    text: truncateToTokens(text, maxTokens),
    tableContextAdded: needsHeader,
    estimatedTokens: estimateTokens(text),
  };
}
