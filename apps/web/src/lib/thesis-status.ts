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
  /** Tailwind classes for a pill: bg + text + border. */
  pill: string;
  dot: string;
} {
  switch (h) {
    case 'red':
      return {
        label: 'Tripped',
        emoji: '🔴',
        pill: 'bg-rose-50 text-rose-800 border-rose-200',
        dot: 'bg-rose-500',
      };
    case 'amber':
      return {
        label: 'Watch',
        emoji: '🟡',
        pill: 'bg-amber-50 text-amber-900 border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'green':
    default:
      return {
        label: 'On track',
        emoji: '🟢',
        pill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dot: 'bg-emerald-500',
      };
  }
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
