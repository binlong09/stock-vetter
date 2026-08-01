-- Short-side "radar" signals: deterministic tells surfaced by the always-on
-- watchlist sweep (material 8-K items, XBRL trends/restatement/distress
-- composites). One row per distinct signal; `key` dedups it to a single
-- surfacing across daily runs, and `first_seen_at` is when the radar first
-- caught it. The web viewer reads this table; the CLI sweep writes it.
CREATE TABLE IF NOT EXISTS short_radar (
  key TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  accession TEXT NOT NULL,
  form TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  headline TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_short_radar_first_seen ON short_radar(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_short_radar_ticker ON short_radar(ticker);
