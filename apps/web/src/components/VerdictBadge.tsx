import { verdictMeta } from '@/lib/verdict';

export function VerdictBadge({ verdict, size = 'sm' }: { verdict: string; size?: 'sm' | 'lg' }) {
  const m = verdictMeta(verdict);
  const cls =
    size === 'lg'
      ? 'text-sm px-2.5 py-1 font-medium'
      : 'text-[11px] px-2 py-0.5 font-medium';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${m.pill} ${cls}`}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}
