// digest.ts — tripwire-flip detection and email-digest rendering (Phase 4).
//
// THE LOAD-BEARING RULE: a flip is a STATE TRANSITION between the prior
// persisted status and the new status — never the current state. A thesis that
// was red yesterday and is still red today has NOT flipped and must not
// re-email. Computing flips from the (prior → new) delta is what keeps the daily
// cron from spamming a digest every day a thesis sits in a flipped state. This
// is the Phase 4 equivalent of cursor-gating.
//
// The digest fires only when there is at least one flip; no flips ⇒ no email.

import { type Signal, type Thesis, type ThesisStatus, type ThesisHealth } from '@stock-vetter/schema';

export type WatchItemFlip = {
  thesisId: string;
  watchItemId: string;
  watchItemLabel: string;
  from: ThesisHealth;
  to: ThesisHealth;
  // The signals (this run) on the flipped watch-item, for the digest body.
  signals: Signal[];
};

// Compare prior vs new status for ONE thesis and return the watch-items whose
// health changed. priorStatus null = first ever evaluation; a first-time
// transition INTO a non-green state counts as a flip (green is the implicit
// baseline), but first-time green does not (nothing changed against baseline).
export function detectFlips(opts: {
  thesis: Thesis;
  priorStatus: ThesisStatus | null;
  newStatus: ThesisStatus;
  signals: Signal[];
}): WatchItemFlip[] {
  const priorByItem = new Map(
    (opts.priorStatus?.watchItems ?? []).map((w) => [w.watchItemId, w.health]),
  );
  const labelById = new Map(opts.thesis.watchItems.map((w) => [w.id, w.label]));
  const flips: WatchItemFlip[] = [];

  for (const w of opts.newStatus.watchItems) {
    const from: ThesisHealth = priorByItem.get(w.watchItemId) ?? 'green';
    const to = w.health;
    if (from === to) continue; // no transition → no flip → no email
    flips.push({
      thesisId: opts.thesis.id,
      watchItemId: w.watchItemId,
      watchItemLabel: labelById.get(w.watchItemId) ?? w.watchItemId,
      from,
      to,
      signals: opts.signals.filter((s) => s.watchItemId === w.watchItemId),
    });
  }
  return flips;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Keep these in sync with the web UI's healthMeta() labels (apps/web).
const HEALTH_LABEL: Record<ThesisHealth, string> = {
  green: '🟢 Hold',
  amber: '🟡 Watch',
  red: '🔴 Exit',
};

// Render the digest HTML for a set of flips (already filtered to real
// transitions). `baseUrl` links each flip to its per-thesis detail page.
export function renderDigest(flips: WatchItemFlip[], baseUrl: string): { subject: string; html: string; text: string } {
  const base = baseUrl.replace(/\/$/, '');
  const n = flips.length;
  const subject = `Signal Tracker: ${n} thesis state change${n === 1 ? '' : 's'}`;

  const blocks = flips.map((f) => {
    const link = `${base}/theses/${encodeURIComponent(f.thesisId)}`;
    const sigHtml = f.signals.length
      ? f.signals
          .map(
            (s) =>
              `<li><b>${esc(s.direction)}</b> (magnitude ${s.magnitude.toFixed(2)}, ${esc(s.confidence)}): ${esc(s.rationale)}<br>` +
              `<i>“${esc(s.citation)}”</i><br>` +
              `<span style="color:#888;font-size:12px">data quality: ${esc(s.dataQuality)}</span></li>`,
          )
          .join('')
      : '<li><i>(state changed with no new signal this run)</i></li>';
    return (
      `<div style="margin:0 0 20px">` +
      `<div style="font-weight:600">${esc(f.thesisId)} / ${esc(f.watchItemLabel)}</div>` +
      `<div style="margin:2px 0">${HEALTH_LABEL[f.from]} → <b>${HEALTH_LABEL[f.to]}</b></div>` +
      `<ul style="margin:6px 0 6px 18px;padding:0">${sigHtml}</ul>` +
      `<a href="${link}">View thesis →</a>` +
      `</div>`
    );
  });

  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:560px">` +
    `<h2 style="font-size:16px">Thesis state changes</h2>` +
    `<p style="color:#666;font-size:13px">Only state transitions are sent — never per-event noise.</p>` +
    blocks.join('') +
    `</div>`;

  const text = flips
    .map(
      (f) =>
        `${f.thesisId} / ${f.watchItemLabel}: ${f.from} -> ${f.to}\n` +
        f.signals.map((s) => `  - ${s.direction} (${s.magnitude.toFixed(2)}): ${s.rationale}\n    "${s.citation}"`).join('\n') +
        `\n  ${base}/theses/${encodeURIComponent(f.thesisId)}`,
    )
    .join('\n\n');

  return { subject, html, text };
}
