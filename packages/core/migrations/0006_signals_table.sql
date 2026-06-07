-- Migration 0006: persist individual evaluated signals (Phase 4). Phase 3
-- persisted aggregate thesis_status + cursors, but the per-signal detail
-- (direction, magnitude, rationale, citation, dataQuality) lived ONLY in the
-- local fixtures/theses/*.md files — which the Vercel web app cannot read and
-- which don't update when the cron runs. This table is the web view's source
-- for signal detail; track.ts writes a row per emitted signal each run.
--
-- Identity is (thesis_id, watch_item_id, event_dedup_key): the same
-- classification (one event × watch-item for a thesis) upserts rather than
-- duplicating when the cron re-evaluates. created_at is the run timestamp.
--
-- (Same constraints as 0001: statements split on ";"; no ";" inside literals.)

CREATE TABLE signals (
  thesis_id        TEXT NOT NULL,
  watch_item_id    TEXT NOT NULL,
  event_dedup_key  TEXT NOT NULL,
  direction        TEXT NOT NULL,   -- 'strengthens' | 'weakens' | 'neutral'
  magnitude        REAL NOT NULL,   -- 0.0 - 1.0
  confidence       TEXT NOT NULL,   -- 'low' | 'medium' | 'high'
  rationale        TEXT NOT NULL,
  citation         TEXT NOT NULL,
  data_quality     TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (thesis_id, watch_item_id, event_dedup_key)
);

CREATE INDEX idx_signals_thesis ON signals(thesis_id);
