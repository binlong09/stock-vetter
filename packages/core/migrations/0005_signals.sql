-- Migration 0005: Signal Tracker persistence (Phase 3). Moves the authoritative
-- per-thesis cursor and thesis-status state out of the .cache/signals/ filesystem
-- store and into Turso, because the GitHub Actions cron runs on ephemeral runners
-- with no .cache — a filesystem cursor would re-process the entire backlog (and
-- trip the cost abort) on every run. The filesystem store remains a local-dev
-- convenience; Turso is authoritative.
--
-- (Same constraints as 0001: statements split on ";"; no ";" inside literals.)

-- Per-(thesis, ticker, source) cursor. seen_keys is a JSON array of the
-- content-stable Event dedupKeys already surfaced for that slice. Splitting by
-- ticker+source (vs one blob per thesis) lets a newly-added ticker cold-start
-- in isolation without re-surfacing the rest of the thesis.
CREATE TABLE signal_cursors (
  thesis_id       TEXT NOT NULL,
  ticker          TEXT NOT NULL,
  source          TEXT NOT NULL,
  seen_keys       TEXT NOT NULL,   -- JSON array of dedupKeys
  last_event_date TEXT,            -- YYYY-MM-DD high-water mark, or NULL
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (thesis_id, ticker, source)
);

-- One row per thesis: the current green/amber/red health, the per-watch-item
-- state, and which watch-items tripped on the most recent update. watch_items
-- and tripped are JSON (validated against the schema's WatchItemState /
-- ThesisStatus on read).
CREATE TABLE thesis_status (
  thesis_id    TEXT PRIMARY KEY,
  health       TEXT NOT NULL,      -- 'green' | 'amber' | 'red'
  watch_items  TEXT NOT NULL,      -- JSON array of WatchItemState
  tripped      TEXT NOT NULL,      -- JSON array of watch-item ids tripped this run
  updated_at   TEXT NOT NULL
);

-- Minimal run-lock so a manual run and the cron don't clobber each other's
-- cursor writes. The cron is the authoritative writer; a manual run that finds
-- a fresh lock should back off. One row, id='track'. expires_at guards against
-- a crashed run holding the lock forever.
CREATE TABLE signal_run_lock (
  id          TEXT PRIMARY KEY,    -- always 'track'
  holder      TEXT NOT NULL,       -- 'cron' | 'manual:<host>' for diagnostics
  acquired_at TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
