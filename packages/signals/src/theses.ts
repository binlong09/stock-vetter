// theses.ts — thesis state model + tripwire flip logic (Phase 3).
//
// Given a thesis and the signals produced for it in a run, compute the updated
// ThesisStatus: each watch-item's health (green/amber/red) and which tripwires
// crossed. A tripwire flips when this run's accumulated signals for a watch-item
// move in the watch-item's adverse direction with enough magnitude.
//
// Health semantics (from the schema):
//   green = nothing material moved against the thesis on this watch-item;
//   amber = something moved (non-trivial signal) but didn't cross the tripwire;
//   red   = a tripwire crossed (the watch-item's adverse condition is met).
//
// Conservative by construction, matching the rest of the tracker: we only flip
// red on a clear adverse, surviving signal.

import {
  type Signal,
  type Thesis,
  type WatchItem,
  type ThesisHealth,
  type ThesisStatus,
  type WatchItemState,
} from '@stock-vetter/schema';

// Magnitude at/above which an adverse signal trips the wire (red). Mirrors the
// render.ts provisional-status threshold so the persisted state and the card
// agree. A tripwire-grade move is 0.5+ (see signal-judge.md).
const TRIP_MAGNITUDE = 0.5;
// Magnitude at/above which a non-tripping signal still warrants amber.
const WATCH_MAGNITUDE = 0.2;

// Does this signal move in the direction that is ADVERSE for the watch-item
// (i.e. the direction whose crossing trips the wire)?
//   - tripwireDirection 'weakens'    ⇒ adverse = a 'weakens' signal.
//   - tripwireDirection 'strengthens'⇒ adverse = a 'strengthens' signal
//     (e.g. GOOGL "consensus prices in the TPU edge" — strengthening consensus
//     is what trips that watch-item, because the edge is then gone).
//   - tripwireDirection 'either'     ⇒ any non-neutral signal is adverse.
function isAdverse(signal: Signal, watchItem: WatchItem): boolean {
  switch (watchItem.tripwireDirection) {
    case 'weakens':
      return signal.direction === 'weakens';
    case 'strengthens':
      return signal.direction === 'strengthens';
    case 'either':
      return signal.direction !== 'neutral';
  }
}

function worstHealth(a: ThesisHealth, b: ThesisHealth): ThesisHealth {
  const rank: Record<ThesisHealth, number> = { green: 0, amber: 1, red: 2 };
  return rank[a] >= rank[b] ? a : b;
}

// Compute one watch-item's state from the signals targeting it this run.
function evaluateWatchItem(
  watchItem: WatchItem,
  signals: Signal[],
): { state: WatchItemState; tripped: boolean } {
  const mine = signals.filter((s) => s.watchItemId === watchItem.id);
  let health: ThesisHealth = 'green';
  let tripped = false;
  const movingKeys: string[] = [];
  const notes: string[] = [];

  for (const s of mine) {
    if (s.direction === 'neutral' || s.magnitude < WATCH_MAGNITUDE) continue;
    movingKeys.push(s.eventDedupKey);
    const adverse = isAdverse(s, watchItem);
    if (adverse && s.magnitude >= TRIP_MAGNITUDE) {
      tripped = true;
      health = 'red';
      notes.push(`TRIPPED: ${s.direction} mag ${s.magnitude.toFixed(2)} — ${s.rationale}`);
    } else {
      health = worstHealth(health, 'amber');
      notes.push(
        `${adverse ? 'adverse' : 'supportive'} ${s.direction} mag ${s.magnitude.toFixed(2)}`,
      );
    }
  }

  return {
    state: {
      watchItemId: watchItem.id,
      health,
      lastEventKeys: movingKeys,
      note: notes.length ? notes.join('; ') : 'no material movement this run',
    },
    tripped,
  };
}

// Compute the updated ThesisStatus for a thesis from this run's signals.
// `priorStatus` lets a watch-item that didn't get a signal THIS run retain its
// prior health (state is sticky — a green run on an untouched watch-item
// shouldn't silently downgrade a previously-amber/red one).
export function computeThesisStatus(opts: {
  thesis: Thesis;
  signals: Signal[];
  priorStatus: ThesisStatus | null;
  now: string;
}): ThesisStatus {
  const priorByItem = new Map<string, WatchItemState>();
  for (const w of opts.priorStatus?.watchItems ?? []) priorByItem.set(w.watchItemId, w);

  const watchItems: WatchItemState[] = [];
  const trippedWatchItemIds: string[] = [];
  let overall: ThesisHealth = 'green';

  for (const wi of opts.thesis.watchItems) {
    const mine = opts.signals.filter((s) => s.watchItemId === wi.id);
    let state: WatchItemState;
    if (!mine.length && priorByItem.has(wi.id)) {
      // No signal this run — keep the prior state (sticky), but clear its
      // "tripped this run" implication by leaving it as-is.
      state = priorByItem.get(wi.id)!;
    } else {
      const r = evaluateWatchItem(wi, opts.signals);
      state = r.state;
      if (r.tripped) trippedWatchItemIds.push(wi.id);
    }
    watchItems.push(state);
    overall = worstHealth(overall, state.health);
  }

  return {
    thesisId: opts.thesis.id,
    health: overall,
    updatedAt: opts.now,
    watchItems,
    trippedWatchItemIds,
  };
}
