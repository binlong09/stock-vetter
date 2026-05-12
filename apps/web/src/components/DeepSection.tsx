/**
 * One collapsible block in the deep view. Native <details> — zero JS, works on
 * iOS Safari, survives RSC streaming. `count` shows a number in the summary.
 */
export function DeepSection({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-lg border border-slate-200 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-medium text-slate-800">
        <span className="text-slate-300 transition-transform group-open:rotate-90">›</span>
        <span>{title}</span>
        {count != null && <span className="text-slate-400">({count})</span>}
      </summary>
      <div className="border-t border-slate-100 px-3.5 py-3">{children}</div>
    </details>
  );
}
