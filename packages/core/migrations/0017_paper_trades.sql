-- Paper ("mock buy") portfolio — the pipeline's own track record.
--
-- One rule, applied without discretion: every deep-dive verdict of
-- `mispriced-long` is bought at a fixed notional and held. Nothing here is a
-- decision the operator makes; the rows are derived from radar_jobs, so what
-- the table measures is the PIPELINE's hit rate rather than anyone's taste in
-- which flagged names to act on.
--
-- Written by the sweep (scripts/radar.ts) and `pnpm paper`; the /radar/paper
-- page reads it. Both legs of the side-by-side synthesis get their own
-- positions (`leg`), which turns "the models disagreed" into "one of them made
-- money".

CREATE TABLE IF NOT EXISTS paper_positions (
  -- '<accession>:<leg>'. A deep-dive re-run (--reanalyze) therefore cannot
  -- open a second position on the same filing, and the alt leg gets its own.
  id TEXT PRIMARY KEY,
  accession TEXT NOT NULL,
  ticker TEXT NOT NULL,
  leg TEXT NOT NULL DEFAULT 'primary',    -- primary | alt
  model TEXT,                             -- the model that returned the verdict
  form TEXT NOT NULL DEFAULT '',
  filing_date TEXT NOT NULL DEFAULT '',
  conviction INTEGER,
  thesis TEXT,
  verdict_at TEXT NOT NULL,               -- when the deep-dive decided the buy
  opened_at TEXT NOT NULL,                -- when this row was created
  -- The fill: the first daily close at or after verdict_at. Null until that
  -- bar exists — a verdict reached after the close waits for the next one, and
  -- an unfilled position is shown as pending rather than valued at a guess.
  entry_date TEXT,
  entry_price REAL,                       -- raw close on entry_date
  notional REAL NOT NULL,                 -- equal weight by design
  benchmark TEXT NOT NULL DEFAULT 'IWM',
  status TEXT NOT NULL DEFAULT 'open',    -- open | closed
  closed_at TEXT,
  exit_date TEXT,
  exit_price REAL,
  close_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_paper_positions_status ON paper_positions(status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_positions_ticker ON paper_positions(ticker);

-- Daily bars for every held ticker plus the benchmark.
--
-- adj_close is what returns are computed from: this universe is $50M-$2B tech
-- where reverse splits are routine, and a 1-for-10 would otherwise print as a
-- +900% winner. The whole series is re-fetched and REPLACEd on each refresh so
-- a split occurring after entry re-adjusts the entry bar too.
CREATE TABLE IF NOT EXISTS paper_marks (
  ticker TEXT NOT NULL,
  as_of TEXT NOT NULL,                    -- trading date, YYYY-MM-DD
  close REAL NOT NULL,
  adj_close REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (ticker, as_of)
);

CREATE INDEX IF NOT EXISTS idx_paper_marks_ticker ON paper_marks(ticker, as_of);
