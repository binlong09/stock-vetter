import Link from 'next/link';

// Two things live under /radar and they are different objects, not two filters
// of one list: the SIGNALS feed is what the sweep found, the PAPER book is what
// acting on it would have made. A tab row rather than another view chip keeps
// that distinction visible — the chips under Signals filter a feed, these
// switch what you're looking at.
const TABS = [
  { href: '/radar', label: 'Signals', key: 'signals' },
  { href: '/radar/paper', label: 'Paper trades', key: 'paper' },
] as const;

export function RadarTabs({ active }: { active: 'signals' | 'paper' }) {
  return (
    <nav className="mt-2 flex gap-4 border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 pb-1.5 text-xs font-medium ${
            active === t.key
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
