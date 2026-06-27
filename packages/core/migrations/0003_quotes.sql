-- Migration 0003: end-of-day prices for the web viewer.
--
-- The pipeline records the at-analysis-time price inside financials.snapshot_json.
-- This table holds the latest *current* price, refreshed by a Vercel cron after
-- market close. One row per ticker (no history kept here; a separate
-- quotes_history table can be added later if needed). The dashboard joins on it
-- to show "$X today · was $Y on <date>" — when the row is missing (a freshly
-- analyzed ticker the cron hasn't picked up yet) the UI falls back gracefully.

CREATE TABLE quotes (
  ticker     TEXT PRIMARY KEY REFERENCES tickers(ticker) ON DELETE CASCADE,
  price      REAL NOT NULL,
  as_of      TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
