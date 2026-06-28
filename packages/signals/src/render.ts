// render.ts — thesis-status card → markdown (Phase 2). One card per thesis,
// written to fixtures/theses/<thesis-id>.md. This is a SNAPSHOT of a single
// run's signals plus a provisional status derived from them — NOT persisted
// tripwire state (that's Phase 3). Adapted from the pipeline's render.ts.

import { type Signal, type Thesis, type ThesisHealth } from '@stock-vetter/schema';
import { isAdverse } from './theses.js';

// Provisional status from this run's signals only. Mirrors computeThesisStatus
// (theses.ts) so the snapshot card and the persisted state agree. Conservative,
// and ADVERSE-only (per the watch-item's tripwireDirection):
//   - red   if any ADVERSE signal has magnitude ≥ 0.5 (a tripwire-grade move);
//   - amber if any ADVERSE signal has magnitude ≥ 0.2 but below the trip line;
//   - green otherwise — including supportive (confirming) movement, which does
//     NOT raise exit risk.
// "green" here means "no material adverse movement in THIS snapshot", not a
// durable all-clear — the wording in the card makes that explicit.
export function provisionalStatus(thesis: Thesis, signals: Signal[]): ThesisHealth {
  const watchById = new Map(thesis.watchItems.map((w) => [w.id, w]));
  let amber = false;
  for (const s of signals) {
    if (s.direction === 'neutral' || s.magnitude < 0.2) continue;
    const w = watchById.get(s.watchItemId);
    if (!w || !isAdverse(s, w)) continue; // unknown or supportive ⇒ no exit risk
    if (s.magnitude >= 0.5) return 'red';
    amber = true;
  }
  return amber ? 'amber' : 'green';
}

function dirGlyph(d: Signal['direction']): string {
  return d === 'strengthens' ? '▲ strengthens' : d === 'weakens' ? '▼ weakens' : '◦ neutral';
}

export function renderThesisCard(opts: {
  thesis: Thesis;
  signals: Signal[];
  noCandidateCount: number;
  evaluatedPairs: number;
  generatedAt: string;
}): string {
  const { thesis, signals } = opts;
  const status = provisionalStatus(thesis, signals);
  const lines: string[] = [];

  lines.push(`# ${thesis.id} — Thesis Status Card`);
  lines.push('');
  lines.push(`**Provisional status (this run only):** ${status.toUpperCase()}`);
  lines.push('');
  lines.push(`> ${thesis.claim}`);
  lines.push('');
  lines.push(
    `*Tickers:* ${thesis.tickers.join(', ')}   ` +
      `*Generated:* ${opts.generatedAt.slice(0, 10)}   ` +
      `*Pairs evaluated:* ${opts.evaluatedPairs} (${signals.length} signal(s), ${opts.noCandidateCount} no-candidate)`,
  );
  lines.push('');
  lines.push(
    `_Snapshot of one run's signals + a provisional status derived from them. ` +
      `Not persisted tripwire state — that's Phase 3. "GREEN" means nothing material ` +
      `moved against the thesis in THIS run, not a durable all-clear._`,
  );
  lines.push('');

  if (!signals.length) {
    lines.push('## Signals');
    lines.push('');
    lines.push('_No signals surfaced this run — every candidate was filtered as noise, already-priced-in, or no candidate was present. This is the common, correct outcome for a noise filter._');
    lines.push('');
    return lines.join('\n');
  }

  // Sort: most material first (magnitude desc), then non-neutral before neutral.
  const sorted = [...signals].sort((a, b) => b.magnitude - a.magnitude);

  lines.push('## Signals');
  lines.push('');
  lines.push('| Watch-item | Direction | Magnitude | Confidence |');
  lines.push('|---|---|---|---|');
  for (const s of sorted) {
    lines.push(
      `| ${s.watchItemId} | ${dirGlyph(s.direction)} | ${s.magnitude.toFixed(2)} | ${s.confidence} |`,
    );
  }
  lines.push('');

  lines.push('### Detail');
  lines.push('');
  for (const s of sorted) {
    lines.push(`#### ${s.watchItemId} — ${dirGlyph(s.direction)} (mag ${s.magnitude.toFixed(2)}, ${s.confidence})`);
    lines.push('');
    lines.push(`- **Rationale:** ${s.rationale}`);
    lines.push(`- **Citation:** ${s.citation}`);
    lines.push(`- **Triggering event:** \`${s.eventDedupKey}\``);
    lines.push(`- **Data quality:** ${s.dataQuality}`);
    lines.push('');
  }

  return lines.join('\n');
}
