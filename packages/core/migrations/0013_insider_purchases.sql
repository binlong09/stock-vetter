-- Open-market insider purchases parsed out of Form 4s, plus the set of Form 4
-- accessions already processed.
--
-- Two tables rather than one because "we read this filing" and "this filing
-- contained a purchase" are different facts, and most Form 4s are the first
-- without being the second (grants, option exercises and tax withholding all
-- file a Form 4 and none of them are a buy). Without the `seen` table an
-- intraday re-sweep would re-fetch and re-parse every Form 4 that reported no
-- purchase, every run, forever.
--
-- The purchases table exists because a CLUSTER is the signal and a cluster
-- cannot be computed from one sweep: three insiders buying across two weeks is
-- the pattern worth reporting, and an intraday run only sees today. So each
-- sweep accumulates here and the detector reads the trailing window back out.
CREATE TABLE IF NOT EXISTS insider_filings_seen (
  accession TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insider_purchases (
  key TEXT PRIMARY KEY,
  cik TEXT NOT NULL,               -- issuer, zero-padded to 10
  ticker TEXT NOT NULL,
  accession TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  transaction_date TEXT NOT NULL,  -- the trade, which precedes the filing
  owner_cik TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_title TEXT NOT NULL DEFAULT '',
  is_officer INTEGER NOT NULL DEFAULT 0,
  is_director INTEGER NOT NULL DEFAULT 0,
  is_ten_percent INTEGER NOT NULL DEFAULT 0,
  shares REAL NOT NULL,
  price REAL,
  value REAL,
  recorded_at TEXT NOT NULL
);

-- The detector's only query shape: one issuer's trailing window.
CREATE INDEX IF NOT EXISTS idx_insider_purchases_cik_date
  ON insider_purchases(cik, transaction_date DESC);
