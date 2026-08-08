'use client';

import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { RadarRow } from '@/radar-queries';
import { isoDate } from '@/lib/format';
import { suggest, filterByTicker } from './suggest';

// The searchable feed.
//
// Filtering happens in the browser over rows the page already fetched, not
// through a server round trip. At a few hundred signals that is the right
// trade: suggestions appear on the keystroke with no debounce, no loading
// state, and no API route to keep in sync with the query layer. If the feed
// ever outgrows the page's row limit this has to become a server search —
// the tell will be a `q` that matches a ticker the reader can see in the
// digest email but not on the page.

// The deep-dive job status → a compact chip. `done` shows the verdict.
function analysisChip(jobStatus: string | null, verdict: string | null, conviction: number | null): {
  label: string;
  cls: string;
} {
  if (jobStatus === 'done') {
    const v = verdict ?? 'analyzed';
    const cls =
      v === 'mispriced-short'
        ? 'border-rose-300 bg-rose-50 text-rose-700'
        : v === 'mispriced-long'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : v === 'watchlist'
            ? 'border-amber-300 bg-amber-50 text-amber-700'
            : 'border-slate-300 bg-slate-100 text-slate-600';
    return { label: conviction != null && verdict ? `${v} ${conviction}/10` : v, cls };
  }
  if (jobStatus === 'running') return { label: 'analyzing…', cls: 'border-sky-300 bg-sky-50 text-sky-700' };
  if (jobStatus === 'pending') return { label: 'queued', cls: 'border-amber-300 bg-amber-50 text-amber-700' };
  if (jobStatus === 'failed') return { label: 'analysis failed', cls: 'border-rose-300 bg-rose-50 text-rose-700' };
  return { label: 'not queued', cls: 'border-slate-200 bg-slate-50 text-slate-400' };
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const SEV_PILL: Record<string, string> = {
  critical: 'border-rose-300 bg-rose-50 text-rose-700',
  high: 'border-orange-300 bg-orange-50 text-orange-700',
  medium: 'border-amber-300 bg-amber-50 text-amber-700',
  low: 'border-slate-300 bg-slate-50 text-slate-600',
};
const KIND_LABEL: Record<string, string> = {
  '8k-item': '8-K item',
  trend: 'trend',
  restatement: 'restatement',
  composite: 'composite',
  dilution: 'dilution',
  runway: 'cash runway',
  offering: 'offering',
  'late-filing': 'late filing',
  ownership: 'ownership',
  'insider-buy': 'insider buying',
  buyback: 'buyback',
  inflection: 'inflection',
  uplisting: 'uplisting',
};

// Which way the signal cuts. Small-cap catalysts genuinely go both ways — a
// tender offer and a shelf takedown are both loud — so direction gets its own
// mark rather than being implied by the feed's name.
const DIRECTION: Record<string, { mark: string; cls: string; title: string }> = {
  bearish: { mark: '▼', cls: 'text-rose-500', title: 'bearish' },
  bullish: { mark: '▲', cls: 'text-emerald-500', title: 'bullish' },
  ambiguous: { mark: '◆', cls: 'text-slate-400', title: 'direction depends on terms' },
};

function capLabel(marketCap: number | null): string | null {
  if (marketCap == null || marketCap <= 0) return null;
  return marketCap >= 1e9 ? `$${(marketCap / 1e9).toFixed(1)}B` : `$${(marketCap / 1e6).toFixed(0)}M`;
}

// Group signals by filing date, newest date first; loudest first within a day.
function groupByFilingDate(rows: RadarRow[]): Array<{ date: string; signals: RadarRow[] }> {
  const byDate = new Map<string, RadarRow[]>();
  for (const r of rows) {
    const date = isoDate(r.filingDate);
    const list = byDate.get(date);
    if (list) list.push(r);
    else byDate.set(date, [r]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, signals]) => ({
      date,
      signals: signals.sort(
        (a, b) =>
          SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) ||
          b.firstSeenAt.localeCompare(a.firstSeenAt),
      ),
    }));
}

function severityCounts(signals: RadarRow[]): Array<{ severity: string; count: number }> {
  return SEV_ORDER.map((severity) => ({
    severity,
    count: signals.filter((s) => s.severity === severity).length,
  })).filter((c) => c.count > 0);
}

function SignalCard({ s }: { s: RadarRow }) {
  const chip = analysisChip(s.jobStatus, s.verdict, s.conviction);
  const dir = DIRECTION[s.direction] ?? DIRECTION.bearish!;
  const cap = capLabel(s.marketCap);
  // The side-by-side eval's headline output: when the comparison model reached
  // a different verdict, say so on the card — those are the filings worth
  // opening, and the whole reason the second synthesis runs.
  const disagree = s.altVerdict != null && s.verdict != null && s.altVerdict !== s.verdict;
  return (
    <Link
      href={`/radar/${encodeURIComponent(s.accession)}`}
      className="block rounded-lg border border-slate-200 bg-white px-3.5 py-3 hover:border-slate-300"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className={`text-[11px] ${dir.cls}`} title={dir.title}>
            {dir.mark}
          </span>
          <span className="font-mono text-sm font-medium text-slate-900">{s.ticker}</span>
          {s.focus ? (
            <span className="text-[11px] text-amber-500" title="on the focus list">
              ★
            </span>
          ) : null}
          {cap ? <span className="text-[11px] text-slate-400">{cap}</span> : null}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEV_PILL[s.severity] ?? SEV_PILL.low}`}
        >
          {s.severity}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{s.headline}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>{s.form}</span>
        <span>{KIND_LABEL[s.kind] ?? s.kind}</span>
        <span>filed {isoDate(s.filingDate)}</span>
        <span>seen {isoDate(s.firstSeenAt)}</span>
        <span className={`rounded-full border px-1.5 py-0.5 font-medium ${chip.cls}`}>{chip.label}</span>
        {disagree ? (
          <span
            className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700"
            title={`comparison model said ${s.altVerdict}`}
          >
            ⚖ models split
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function RadarFeed({ rows, totalCount }: { rows: RadarRow[]; totalCount: number }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // -1 means "nothing highlighted" — Enter then just closes the list and keeps
  // the typed query, rather than silently snapping to a ticker the reader
  // never selected.
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const suggestions = useMemo(() => suggest(rows, query), [rows, query]);

  const q = query.trim().toUpperCase();
  const filtered = useMemo(() => filterByTicker(rows, query), [rows, query]);
  const groups = useMemo(() => groupByFilingDate(filtered), [filtered]);

  function choose(ticker: string) {
    setQuery(ticker);
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  function clear() {
    setQuery('');
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // Escape closes the list first and only clears on a second press — so a
      // reader dismissing the dropdown doesn't lose the query they just typed.
      if (open) {
        setOpen(false);
        setActive(-1);
      } else {
        clear();
      }
      return;
    }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0) {
        e.preventDefault();
        choose(suggestions[active]!.ticker);
      } else {
        setOpen(false);
      }
    }
  }

  const showSuggestions = open && suggestions.length > 0;

  return (
    <div>
      <div className="relative mt-3">
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search ticker…"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Search signals by ticker"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 font-mono text-sm uppercase text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        ) : null}

        {showSuggestions ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching tickers"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li key={s.ticker} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // Keep focus on the input so the blur handler doesn't close
                  // the list out from under the click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(s.ticker)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm ${
                    i === active ? 'bg-slate-100' : 'bg-white'
                  }`}
                >
                  <span className="font-mono font-medium text-slate-900">{s.ticker}</span>
                  {s.focus ? <span className="text-[11px] text-amber-500">★</span> : null}
                  {capLabel(s.marketCap) ? (
                    <span className="text-[11px] text-slate-400">{capLabel(s.marketCap)}</span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-slate-400">
                    {s.count} signal{s.count === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {q ? (
        <p className="mt-1.5 text-[11px] text-slate-400">
          {filtered.length} signal{filtered.length === 1 ? '' : 's'} matching{' '}
          <span className="font-mono text-slate-600">{q}</span>
          {' · '}
          <button type="button" onClick={clear} className="underline hover:text-slate-700">
            clear
          </button>
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {groups.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3.5 py-6 text-sm text-slate-500">
            {q ? (
              <>
                No signals for <span className="font-mono">{q}</span> in this view.{' '}
                <button type="button" onClick={clear} className="underline">
                  Clear the search
                </button>
                {rows.length !== totalCount ? (
                  <>
                    {' '}
                    or{' '}
                    <Link href="/radar" className="underline">
                      show all {totalCount}
                    </Link>
                  </>
                ) : null}
                .
              </>
            ) : totalCount === 0 ? (
              <>
                No signals yet. The sweep writes them on its first run (
                <code className="font-mono">pnpm radar</code>).
              </>
            ) : (
              <>
                Nothing matches this view.{' '}
                <Link href="/radar" className="underline">
                  Show all {totalCount}
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          groups.map((g, i) => (
            <details
              // Re-key on the query so a new search re-evaluates `open` from
              // scratch: searching a ticker expands every day it appears in
              // instead of leaving the reader to click through collapsed days.
              key={`${q}:${g.date}`}
              open={Boolean(q) || i === 0}
              className="group rounded-lg border border-slate-200 bg-slate-50 open:bg-transparent"
            >
              <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3.5 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                <span className="text-[10px] text-slate-400 transition-transform group-open:rotate-90">▶</span>
                <span className="font-medium text-slate-900">filed {g.date}</span>
                <span className="text-xs text-slate-400">
                  {g.signals.length} signal{g.signals.length === 1 ? '' : 's'}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {severityCounts(g.signals).map(({ severity, count }) => (
                    <span
                      key={severity}
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${SEV_PILL[severity] ?? SEV_PILL.low}`}
                    >
                      {count} {severity}
                    </span>
                  ))}
                </span>
              </summary>
              <div className="space-y-2 px-3.5 pb-3.5 pt-1">
                {g.signals.map((s) => (
                  <SignalCard key={s.key} s={s} />
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
