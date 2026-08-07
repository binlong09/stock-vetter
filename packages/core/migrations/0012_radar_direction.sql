-- The radar began as a short-only scanner, so a signal's direction was
-- implicit. Refocused on small caps it no longer is: an activist SC 13D and a
-- shelf takedown are both loud signals on the same feed and they point
-- opposite ways, and plenty of events (a material agreement, a change of
-- control) genuinely can't be signed without reading the terms.
--
-- `market_cap` rides along because materiality is cap-relative — the radar
-- promotes 8-K items for small caps that it leaves alone for mega caps, and a
-- reader needs to see which regime a row was judged under.
--
-- Existing rows were all short-side by construction, so backfilling them to
-- 'bearish' is faithful rather than a guess. Their market cap is unknown (the
-- old watchlist carried no caps), which NULL states honestly.
ALTER TABLE short_radar ADD COLUMN direction TEXT NOT NULL DEFAULT 'bearish';
ALTER TABLE short_radar ADD COLUMN market_cap REAL;

CREATE INDEX IF NOT EXISTS idx_short_radar_direction ON short_radar(direction);
