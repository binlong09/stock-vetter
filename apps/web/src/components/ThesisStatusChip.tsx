import { healthMeta } from '@/lib/thesis-status';

export function ThesisStatusChip({ health, size = 'sm' }: { health: string; size?: 'sm' | 'lg' }) {
  const m = healthMeta(health);
  const cls =
    size === 'lg' ? 'text-sm px-2.5 py-1 font-medium' : 'text-[11px] px-2 py-0.5 font-medium';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${m.pill} ${cls}`}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}
