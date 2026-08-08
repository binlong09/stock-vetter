-- Company identity for radar tickers: full registrant name and a short
-- business description, so the feed reads "PAR — Par Technology Corp,
-- point-of-sale software for restaurants" instead of a bare ticker the
-- reader has never heard of.
--
-- Written by the sweep (scripts/radar.ts) from the watchlist, whose builder
-- fetches descriptions from Yahoo's assetProfile; rows fall back to the SIC
-- industry label until the watchlist is rebuilt with descriptions. Keyed by
-- CIK because tickers get reused and reassigned; the join from short_radar
-- is on cik for the same reason.
CREATE TABLE IF NOT EXISTS radar_companies (
  cik TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL
);
