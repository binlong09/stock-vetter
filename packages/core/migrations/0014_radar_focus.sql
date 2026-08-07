-- Focus-list membership, recorded on the signal at the time it was surfaced.
--
-- The distinction this encodes is not severity, it is readiness: a delisting
-- notice on a name whose story you already know is a decision you can make
-- today, and the identical notice on a company you have never heard of is a
-- research lead. Both belong on the feed; conflating them is what makes a
-- 400-name universe unusable for short-term trading.
--
-- Stamped per row rather than joined from the watchlist on read, because the
-- watchlist is a file that changes: promoting a name next month should not
-- retroactively rewrite how last month's signals were triaged.
--
-- Existing rows predate the focus list, so 0 is correct for them — nothing was
-- on a focus list that did not exist.
ALTER TABLE short_radar ADD COLUMN focus INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_short_radar_focus ON short_radar(focus, first_seen_at DESC);
