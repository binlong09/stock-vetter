-- Migration 0001: initial schema for the read-only web viewer.
--
-- Design notes:
--  * Large structured artifacts are stored as JSON in TEXT columns. libSQL has
--    no native JSON type; shape is guaranteed on read by the @stock-vetter/schema
--    Zod schemas. Relational columns exist only for things the dashboard filters
--    or sorts on (ticker, verdict, score, videoId, channelId, timestamps).
--  * Forward-compat with SPEC.md "Future direction": decision cards keyed by
--    (ticker, videoId); a `videos` table; a `tickers` table with a meta_card
--    JSON column; channelId stored separately from channel name.
--
-- The migration runner splits this file on ";" at statement boundaries, so keep
-- each statement terminated by a semicolon on its own and avoid semicolons inside
-- string literals here.

CREATE TABLE tickers (
  ticker                TEXT PRIMARY KEY,
  verdict               TEXT NOT NULL,
  weighted_score        REAL NOT NULL,
  summary               TEXT NOT NULL,
  primary_source_filing TEXT,
  proxy_filing          TEXT,
  analyst_video_count   INTEGER NOT NULL DEFAULT 0,
  total_llm_cost        REAL,
  generated_at          TEXT NOT NULL,
  meta_card_json        TEXT NOT NULL,
  pushed_at             TEXT NOT NULL
);

CREATE INDEX idx_tickers_score   ON tickers(weighted_score DESC);
CREATE INDEX idx_tickers_verdict ON tickers(verdict);

CREATE TABLE primary_source_runs (
  ticker            TEXT PRIMARY KEY REFERENCES tickers(ticker) ON DELETE CASCADE,
  filing_accession  TEXT NOT NULL,
  generated_at      TEXT NOT NULL,
  checklist_json    TEXT NOT NULL
);

CREATE TABLE financials (
  ticker            TEXT PRIMARY KEY REFERENCES tickers(ticker) ON DELETE CASCADE,
  as_of             TEXT NOT NULL,
  snapshot_json     TEXT NOT NULL,
  reverse_dcf_json  TEXT
);

CREATE TABLE videos (
  video_id      TEXT PRIMARY KEY,
  channel_id    TEXT,
  channel       TEXT,
  title         TEXT,
  published_at  TEXT,
  first_seen_at TEXT NOT NULL
);

CREATE TABLE analyst_cards (
  ticker         TEXT NOT NULL REFERENCES tickers(ticker) ON DELETE CASCADE,
  video_id       TEXT NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
  channel_id     TEXT,
  generated_at   TEXT NOT NULL,
  weighted_score REAL,
  verdict        TEXT,
  card_json      TEXT NOT NULL,
  PRIMARY KEY (ticker, video_id)
);

CREATE INDEX idx_analyst_cards_ticker  ON analyst_cards(ticker);
CREATE INDEX idx_analyst_cards_video   ON analyst_cards(video_id);
CREATE INDEX idx_analyst_cards_channel ON analyst_cards(channel_id);
