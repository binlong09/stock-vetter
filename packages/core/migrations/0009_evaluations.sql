-- Migration 0009: the eval log. One row per (event × watch-item) pair that the
-- engine ACTUALLY evaluated (reached extract→critique→judge), recording what was
-- looked at and what the engine concluded — including the no_candidate and
-- neutral outcomes that never become signals and are otherwise invisible.
--
-- This is NOT a fetch log: pairs filtered out by watch-item mapping before any
-- LLM call are never written here (logging them would recreate the firehose).
-- It records what reached the engine, so "which filings did this run look at?"
-- (e.g. the May-20 NVDA Q1 gross-margin case) is answerable.
--
-- Identity is (thesis_id, watch_item_id, event_dedup_key) — the same key the
-- signals table uses — so a re-evaluation upserts, and a `signal` outcome links
-- 1:1 to its signals row by that shared key.
--
-- (Same constraints as 0001: statements split on ";"; no ";" inside literals.)

CREATE TABLE evaluations (
  thesis_id        TEXT NOT NULL,
  watch_item_id    TEXT NOT NULL,
  event_dedup_key  TEXT NOT NULL,   -- stable event identity (accession / av:TICK:Q / estimates hash)
  ticker           TEXT NOT NULL,
  source           TEXT NOT NULL,   -- EventSource: sec-8k | sec-10q | sec-10k | fmp-* | av-transcript | manual
  event_date       TEXT NOT NULL,   -- YYYY-MM-DD
  outcome          TEXT NOT NULL,   -- 'no_candidate' | 'neutral' | 'signal'
  -- True when outcome='signal' — the matching signals row shares this PK, so the
  -- two link 1:1 without a separate foreign key.
  has_signal       INTEGER NOT NULL DEFAULT 0,
  evaluated_at     TEXT NOT NULL,
  PRIMARY KEY (thesis_id, watch_item_id, event_dedup_key)
);

CREATE INDEX idx_evaluations_thesis ON evaluations(thesis_id);
