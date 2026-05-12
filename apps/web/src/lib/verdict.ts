/**
 * Verdict + uncertainty presentation helpers. Kept out of components so the
 * dashboard and the ticker page agree on colors/labels/ordering.
 */

export type Verdict = 'Strong Candidate' | 'Watchlist' | 'Pass' | 'Insufficient Data';
export type Uncertainty = 'tight' | 'moderate' | 'high';

/** Dashboard sort/group order: best first. */
export const VERDICT_ORDER: Verdict[] = ['Strong Candidate', 'Watchlist', 'Pass', 'Insufficient Data'];

export function verdictMeta(v: string): {
  label: string;
  emoji: string;
  /** Tailwind classes for a pill: bg + text + border. */
  pill: string;
  /** A bare dot color, for compact contexts. */
  dot: string;
} {
  switch (v) {
    case 'Strong Candidate':
      return {
        label: 'Strong Candidate',
        emoji: '🟢',
        pill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dot: 'bg-emerald-500',
      };
    case 'Watchlist':
      return {
        label: 'Watchlist',
        emoji: '🟡',
        pill: 'bg-amber-50 text-amber-900 border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'Pass':
      return {
        label: 'Pass',
        emoji: '⚪',
        pill: 'bg-slate-100 text-slate-700 border-slate-300',
        dot: 'bg-slate-400',
      };
    case 'Insufficient Data':
    default:
      return {
        label: 'Insufficient Data',
        emoji: '⚫',
        pill: 'bg-slate-100 text-slate-500 border-slate-300',
        dot: 'bg-slate-400',
      };
  }
}

export function uncertaintyMeta(u: Uncertainty): {
  label: string;
  dot: string; // tailwind bg
  text: string; // tailwind text color for the label
} {
  switch (u) {
    case 'tight':
      return { label: 'tight', dot: 'bg-emerald-500', text: 'text-emerald-700' };
    case 'moderate':
      return { label: 'moderate', dot: 'bg-amber-500', text: 'text-amber-700' };
    case 'high':
      return { label: 'high uncertainty', dot: 'bg-rose-500', text: 'text-rose-700' };
  }
}

export function agreementMeta(a: 'agree' | 'partial' | 'disagree'): {
  label: string;
  pill: string;
} {
  switch (a) {
    case 'agree':
      return { label: 'agree', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'partial':
      return { label: 'partial', pill: 'bg-amber-50 text-amber-900 border-amber-200' };
    case 'disagree':
      return { label: 'disagree', pill: 'bg-rose-50 text-rose-800 border-rose-200' };
  }
}
