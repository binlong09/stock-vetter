// render.ts — thesis-status card → markdown (Phase 2). One card per thesis,
// written to fixtures/theses/<thesis-id>.md. This is a SNAPSHOT of a single
// run's signals plus a provisional status derived from them — NOT persisted
// tripwire state (that's Phase 3). Adapted from the pipeline's render.ts.

import { type Signal, type Thesis, type ThesisHealth } from '@stock-vetter/schema';

// Provisional status from this run's signals only. Conservative:
//   - red   if any surviving signal WEAKENS the thesis with magnitude ≥ 0.5
//            (a tripwire-grade adverse move).
//   - amber if there's any non-neutral signal with magnitude ≥ 0.2.
//   - green otherwise (nothing material moved against it this run).
// "green" here means "no material adverse movement in THIS snapshot", not a
// durable all-clear — the wording in the card makes that explicit.
export function provisionalStatus(signals: Signal[]): ThesisHealth {
  let amber = false;
  for (const s of signals) {
    if (s.direction === 'weakens' && s.magnitude >= 0.5) return 'red';
    if (s.direction !== 'neutral' && s.magnitude >= 0.2) amber = true;
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
  const status = provisionalStatus(signals);
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
