/** A titled block on the ticker page. Optional `hint` shows muted text under the title. */
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}
