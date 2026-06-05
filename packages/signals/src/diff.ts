// diff.ts — "what changed since last check".
//
// Given the Events freshly fetched for a thesis and the cursor (last-seen state
// from the previous run), return only the Events we haven't seen before, and
// produce the advanced cursor to persist for next time.
//
// The cursor is a per-thesis set of seen dedupKeys plus a couple of high-water
// marks. dedupKeys are content-stable (see feeds.ts), so "new" = "dedupKey not
// in the cursor's seen set". That single rule covers all sources:
//   - SEC:        new accession ⇒ new key ⇒ surfaced once, then remembered.
//   - estimates:  key is a hash of the figures ⇒ only a real consensus move
//                 yields a new key; an unchanged re-run yields the same key.
//   - revisions:  key is ticker+month ⇒ each month surfaces once.
//   - manual:     key is the caller id ⇒ surfaces once.
//
// Cursor state is persisted to the filesystem under .cache/signals/ (gitignored,
// the project's home for local run state). No DB until Phase 3.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { type Event } from '@stock-vetter/schema';

const CACHE_ROOT = process.env.STOCK_VETTER_CACHE_DIR ?? '.cache';
const SIGNALS_DIR = join(CACHE_ROOT, 'signals');

export const Cursor = z.object({
  thesisId: z.string(),
  // Every dedupKey we've ever surfaced for this thesis. The diff is a pure
  // set-difference against this.
  seenKeys: z.array(z.string()),
  // High-water mark: the most recent event date surfaced. Informational (shown
  // in track.ts) and a cheap sanity check that the cursor is advancing.
  lastEventDate: z.string().nullable(),
  updatedAt: z.string(),
});
export type Cursor = z.infer<typeof Cursor>;

export function emptyCursor(thesisId: string): Cursor {
  return { thesisId, seenKeys: [], lastEventDate: null, updatedAt: '1970-01-01T00:00:00.000Z' };
}

function cursorPath(thesisId: string): string {
  const safe = thesisId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(SIGNALS_DIR, `cursor-${safe}.json`);
}

// Load a thesis's cursor, or an empty one if none exists / it's corrupt
// (treat a bad cursor as "never run" — safe: it just re-surfaces the backlog).
export async function loadCursor(thesisId: string): Promise<Cursor> {
  try {
    const body = await readFile(cursorPath(thesisId), 'utf-8');
    return Cursor.parse(JSON.parse(body));
  } catch {
    return emptyCursor(thesisId);
  }
}

// Atomic write (temp + rename), matching the pipeline cache's durability.
export async function saveCursor(cursor: Cursor): Promise<void> {
  const p = cursorPath(cursor.thesisId);
  await mkdir(dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(cursor, null, 2), 'utf-8');
  await rename(tmp, p);
}

export type DiffResult = {
  newEvents: Event[];
  // The cursor to persist if you accept this diff (seenKeys unioned with the
  // new events' keys, high-water mark advanced). Caller decides when to save.
  nextCursor: Cursor;
};

// Pure function: given a cursor and the freshly-fetched events, return the
// subset not yet seen plus the advanced cursor. Does no I/O.
export function diffEvents(cursor: Cursor, fetched: Event[]): DiffResult {
  const seen = new Set(cursor.seenKeys);
  // Dedup within this batch too (a key could appear twice across sources/tickers).
  const newEvents: Event[] = [];
  const batchKeys = new Set<string>();
  for (const ev of fetched) {
    if (seen.has(ev.dedupKey) || batchKeys.has(ev.dedupKey)) continue;
    batchKeys.add(ev.dedupKey);
    newEvents.push(ev);
  }
  newEvents.sort((a, b) => b.date.localeCompare(a.date));

  const allDates = [cursor.lastEventDate, ...newEvents.map((e) => e.date)].filter(
    (d): d is string => d != null,
  );
  const lastEventDate = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null;

  const nextCursor: Cursor = {
    thesisId: cursor.thesisId,
    seenKeys: [...seen, ...batchKeys],
    lastEventDate,
    updatedAt: new Date().toISOString(),
  };
  return { newEvents, nextCursor };
}
