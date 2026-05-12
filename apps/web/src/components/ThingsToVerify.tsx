/** Numbered checklist of things the reader should confirm themselves. */
export function ThingsToVerify({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ol className="space-y-2 rounded-lg border border-slate-200 bg-white p-3.5 text-[13px] leading-snug text-slate-700">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
            {i + 1}.
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}
