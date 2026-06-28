/**
 * Thesis-status (green/amber/red) presentation helpers — the Signal Tracker
 * analogue of verdict.ts. Kept out of components so the theses dashboard and
 * the detail page agree on colors/labels/ordering.
 */

export type ThesisHealth = 'green' | 'amber' | 'red';
export type SignalDirection = 'strengthens' | 'weakens' | 'neutral';

/** Dashboard sort order: most-actionable (tripped) first. */
export const HEALTH_ORDER: ThesisHealth[] = ['red', 'amber', 'green'];

export function healthMeta(h: string): {
  label: string;
  emoji: string;
  /** One-line meaning + action, for the legend and tooltips. */
  blurb: string;
  /** Tailwind classes for a pill: bg + text + border. */
  pill: string;
  dot: string;
} {
  switch (h) {
    case 'red':
      return {
        label: 'Exit',
        emoji: '🔴',
        blurb: 'A tripwire crossed — review/exit the position.',
        pill: 'bg-rose-50 text-rose-800 border-rose-200',
        dot: 'bg-rose-500',
      };
    case 'amber':
      return {
        label: 'Watch',
        emoji: '🟡',
        blurb: 'Early warning — a signal is moving toward your exit line.',
        pill: 'bg-amber-50 text-amber-900 border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'green':
    default:
      return {
        label: 'Hold',
        emoji: '🟢',
        blurb: 'Thesis intact — stay invested.',
        pill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dot: 'bg-emerald-500',
      };
  }
}

/** Legend rows in dashboard order (Exit → Watch → Hold). */
export function healthLegend(): { label: string; emoji: string; blurb: string; pill: string }[] {
  return HEALTH_ORDER.map((h) => {
    const m = healthMeta(h);
    return { label: m.label, emoji: m.emoji, blurb: m.blurb, pill: m.pill };
  });
}

export function directionMeta(d: string): { label: string; glyph: string; text: string } {
  switch (d) {
    case 'strengthens':
      return { label: 'strengthens', glyph: '▲', text: 'text-emerald-700' };
    case 'weakens':
      return { label: 'weakens', glyph: '▼', text: 'text-rose-700' };
    case 'neutral':
    default:
      return { label: 'neutral', glyph: '◦', text: 'text-slate-500' };
  }
}
