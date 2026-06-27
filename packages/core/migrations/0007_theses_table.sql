-- Migration 0007: thesis reference data (Phase 4). The claim, tickers, and
-- watch-item definitions are mirrored from data/theses.json into Turso on each
-- run so the Vercel web app reads everything from Turso — it can't reach the
-- repo-root data file. Upserted by track.ts (saveThesisDefinition).
--
-- (Same constraints as 0001: statements split on ";"; no ";" inside literals.)

CREATE TABLE theses (
  thesis_id     TEXT PRIMARY KEY,
  claim         TEXT NOT NULL,
  tickers       TEXT NOT NULL,   -- JSON array
  entities      TEXT NOT NULL,   -- JSON array
  watch_items   TEXT NOT NULL,   -- JSON array of WatchItem (id, label, tripwire, …)
  updated_at    TEXT NOT NULL
);
