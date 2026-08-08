-- Side-by-side synthesis comparison.
--
-- The deep-dive can now run its cloud synthesis twice per filing — once on
-- the primary model (whose verdict drives everything downstream: the feed
-- chip, auto-focus, the digest) and once on a comparison model. The B side is
-- an evaluation harness, not a second opinion the system acts on: it exists
-- so a cheap model can be judged against the incumbent on live filings before
-- being promoted to primary. Which model is which is recorded per row —
-- `model`/`cost` for the side that counts, `alt_*` for the challenger — so
-- the comparison stays meaningful after the primary is switched.
--
-- Rows written before this migration have NULL everywhere here, which reads
-- correctly as "no comparison ran" (and an unknown primary model, which is
-- honest — it wasn't recorded at the time).
ALTER TABLE radar_jobs ADD COLUMN model TEXT;
ALTER TABLE radar_jobs ADD COLUMN cost REAL;
ALTER TABLE radar_jobs ADD COLUMN alt_model TEXT;
ALTER TABLE radar_jobs ADD COLUMN alt_verdict TEXT;
ALTER TABLE radar_jobs ADD COLUMN alt_conviction INTEGER;
ALTER TABLE radar_jobs ADD COLUMN alt_assessment_json TEXT;
ALTER TABLE radar_jobs ADD COLUMN alt_cost REAL;
