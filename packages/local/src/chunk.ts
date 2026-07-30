// Phase 1: split a cleaned filing section into logical, model-sized chunks.
//
// The constraints, in priority order:
//
//  1. NEVER split a table. A financial table cut in half produces numbers with
//     no row labels, or row labels with no numbers, and the extraction stage
//     will confidently report whatever survived. When a single table is bigger
//     than the chunk budget we split it BY ROWS and repeat the caption and
//     header row in every piece, so each piece is independently readable.
//
//  2. Prefer to start a chunk at a heading. A chunk that starts mid-argument
//     ("...which management attributes to the timing of shipments") gives the
//     model no idea what it is reading. Starting at "NOTE 7 — INVENTORIES"
//     does.
//
//  3. Hit the token budget. Last, not first — a chunk 15% under target that
//     starts at a note boundary beats a full one that starts mid-sentence.
//
// Overlap exists so a fact stated at a chunk boundary isn't lost by both
// neighbours. It is prose-only: overlapping table rows would double-count
// figures during aggregation, which is worse than the boundary loss it fixes.

import type { LayoutBlock } from '@stock-vetter/core';
import { estimateTokens, tailToTokens } from './tokens.js';

export type ChunkOptions = {
  /** Hard ceiling. A chunk is never emitted above this. Default 8000. */
  maxTokens?: number;
  /** Preferred floor — below this we keep accumulating unless forced. Default 4000. */
  minTokens?: number;
  /** Prose carried from the previous chunk. Default 200. */
  overlapTokens?: number;
};

export type FilingChunk = {
  /** Stable, content-addressable within a filing: `<accession>:<section>:<n>`. */
  id: string;
  ticker: string;
  cik: string;
  accession: string;
  form: string;
  filingDate: string;
  sectionId: string;
  sectionLabel: string;
  index: number;
  total: number;
  /** Headings spanned by this chunk — provenance for citations. */
  headings: string[];
  /** What the model reads: overlap preamble (if any) then the blocks. */
  text: string;
  estimatedTokens: number;
  hasTables: boolean;
  /** True when this chunk is one slice of a table too large to fit whole. */
  isTableContinuation: boolean;
};

export type ChunkSource = {
  ticker: string;
  cik: string;
  accession: string;
  form: string;
  filingDate: string;
  sectionId: string;
  sectionLabel: string;
};

// The overlap window is delimited at BOTH ends. Without a terminator the
// model cannot tell where carried-over context stops and new material starts,
// and will happily report a fact from the overlap as a finding of this chunk —
// which double-counts it during aggregation, the exact problem overlap was
// supposed to avoid creating.
const OVERLAP_MARKER = '[context: end of previous chunk, for continuity only]';
const OVERLAP_END_MARKER = '[end of context — new material begins here]';
const TABLE_SPLIT_MARKER = '[table continues from previous chunk]';

// Split one oversized table into row groups, repeating caption + header so
// every piece stands alone.
function splitTable(block: LayoutBlock, maxTokens: number): LayoutBlock[] {
  const lines = block.markdown.split('\n');
  const gridStart = lines.findIndex((l) => l.startsWith('|'));
  if (gridStart === -1) return [block];

  const captions = lines.slice(0, gridStart);
  const header = lines[gridStart]!;
  const separator = lines[gridStart + 1] ?? '';
  const dataLines = lines.slice(gridStart + 2);
  const preamble = [...captions, header, separator];
  const preambleTokens = estimateTokens(preamble.join('\n'));

  // A header so large it leaves no room for data means the chunk budget is
  // misconfigured; emit the table whole rather than producing header-only
  // fragments, and let the oversize be visible downstream.
  if (preambleTokens >= maxTokens * 0.8) return [block];

  const out: LayoutBlock[] = [];
  let current: string[] = [];
  let currentTokens = preambleTokens;

  const flush = (): void => {
    if (!current.length) return;
    const md = [...preamble, ...current].join('\n');
    out.push({
      kind: 'table',
      text: md.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim(),
      markdown: out.length ? `${TABLE_SPLIT_MARKER}\n${md}` : md,
      rows: block.rows,
    });
    current = [];
    currentTokens = preambleTokens;
  };

  for (const line of dataLines) {
    const t = estimateTokens(line) + 1;
    if (current.length && currentTokens + t > maxTokens) flush();
    current.push(line);
    currentTokens += t;
  }
  flush();
  return out.length ? out : [block];
}

/**
 * Chunk a section's blocks. Blocks should already have been through
 * `stripBoilerplate`.
 */
export function chunkBlocks(
  blocks: LayoutBlock[],
  source: ChunkSource,
  opts: ChunkOptions = {},
): FilingChunk[] {
  const maxTokens = opts.maxTokens ?? 8000;
  const minTokens = opts.minTokens ?? 4000;
  const overlapTokens = opts.overlapTokens ?? 200;

  // Pre-split any table that can't fit in a chunk on its own. `fromSplitTable`
  // travels with the piece rather than being sniffed from the marker text —
  // the first piece carries no marker but is just as much a fragment as the
  // rest, and a consumer needs to know that before trusting a total.
  const units: Array<{ block: LayoutBlock; fromSplitTable: boolean }> = [];
  for (const b of blocks) {
    if (b.kind === 'table' && estimateTokens(b.markdown) > maxTokens) {
      const pieces = splitTable(b, maxTokens);
      const split = pieces.length > 1;
      for (const p of pieces) units.push({ block: p, fromSplitTable: split });
    } else {
      units.push({ block: b, fromSplitTable: false });
    }
  }

  type Pending = { blocks: LayoutBlock[]; tokens: number; hasSplitTable: boolean };
  const groups: Pending[] = [];
  let cur: Pending = { blocks: [], tokens: 0, hasSplitTable: false };

  const closeGroup = (): void => {
    if (cur.blocks.length) groups.push(cur);
    cur = { blocks: [], tokens: 0, hasSplitTable: false };
  };

  for (let i = 0; i < units.length; i++) {
    const { block: b, fromSplitTable } = units[i]!;
    const t = estimateTokens(b.markdown);

    // Would overflow: close first. A single unit larger than max (a prose
    // block that is somehow enormous, or a table we chose not to split)
    // becomes its own oversized chunk rather than being cut.
    if (cur.blocks.length && cur.tokens + t > maxTokens) closeGroup();

    // At target size and the next block opens a new topic — break here so the
    // chunk starts at the heading rather than trailing one sentence into it.
    if (cur.tokens >= minTokens && b.kind === 'heading') closeGroup();

    cur.blocks.push(b);
    cur.tokens += t;
    if (fromSplitTable) cur.hasSplitTable = true;
  }
  closeGroup();

  // Materialize, adding overlap.
  const chunks: FilingChunk[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const body = g.blocks.map((b) => b.markdown).join('\n\n');

    let preamble = '';
    if (i > 0 && overlapTokens > 0) {
      // Prose only. Overlapping table rows would make the same figure appear
      // in two chunks and be counted twice when the briefs are aggregated.
      const prevProse = groups[i - 1]!.blocks.filter((b) => b.kind !== 'table');
      if (prevProse.length) {
        const tail = tailToTokens(prevProse.map((b) => b.markdown).join('\n\n'), overlapTokens);
        if (tail.trim()) preamble = `${OVERLAP_MARKER}\n${tail}\n${OVERLAP_END_MARKER}\n\n`;
      }
    }

    const text = preamble + body;
    chunks.push({
      id: `${source.accession}:${source.sectionId}:${i}`,
      ...source,
      index: i,
      total: groups.length,
      headings: g.blocks.filter((b) => b.kind === 'heading').map((b) => b.text),
      text,
      estimatedTokens: estimateTokens(text),
      hasTables: g.blocks.some((b) => b.kind === 'table'),
      isTableContinuation: g.hasSplitTable,
    });
  }

  // `total` is only known after grouping.
  for (const c of chunks) c.total = chunks.length;
  return chunks;
}

/** Strip the overlap preamble, leaving only material original to this chunk. */
export function chunkBodyOnly(chunk: FilingChunk): string {
  const i = chunk.text.indexOf(OVERLAP_END_MARKER);
  return i === -1 ? chunk.text : chunk.text.slice(i + OVERLAP_END_MARKER.length).trimStart();
}

export { OVERLAP_MARKER, OVERLAP_END_MARKER, TABLE_SPLIT_MARKER };
