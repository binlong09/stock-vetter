-- Deep-dive job queue. When the radar flags a filing it enqueues one job here
-- (deduped by accession). A worker on the GPU box claims pending jobs, runs the
-- short-scan deep-dive, and writes the result back. The box being offline just
-- means jobs sit `pending` until the worker next runs — the queue is the buffer.
CREATE TABLE IF NOT EXISTS radar_jobs (
  accession TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  form TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  enqueued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  triage_score REAL,
  escalated INTEGER,        -- 0/1; whether it reached the cloud tier
  verdict TEXT,             -- actionable-short | watchlist | no-edge | insufficient-data
  conviction INTEGER,       -- 1-10 when escalated
  assessment_json TEXT,     -- full ShortAssessment JSON when escalated
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_radar_jobs_status ON radar_jobs(status, enqueued_at);
