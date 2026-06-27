-- Migration 0008: cache normalized earnings-call transcripts. Normalizing the
-- auto-transcription proper-noun mangling (the normalize.ts LLM pass) is the
-- dominant cost of an Alpha Vantage transcript — ~3-4× the extract/critique/
-- judge engine (the spike measured ~$0.21/transcript, of which ~$0.14 was
-- normalize). Both consumers (signals tracker + stock-vetter) read the same
-- transcript, and the daily cron re-checks each quarter, so we persist the
-- cleaned text keyed by (ticker, quarter) and only pay normalize on a miss.
--
-- raw_turns_json keeps the original AV turns (speaker/title/content/sentiment)
-- so the per-turn citation segmentation survives without a re-fetch.
--
-- (Same constraints as 0001: statements split on ";"; no ";" inside literals.)

CREATE TABLE normalized_transcripts (
  ticker          TEXT NOT NULL,
  quarter         TEXT NOT NULL,   -- calendar format, e.g. "2025Q4"
  normalized_text TEXT NOT NULL,   -- the cleaned, turn-tagged transcript text
  raw_turns_json  TEXT NOT NULL,   -- JSON array of {speaker,title,content,sentiment,segment}
  normalized_at   TEXT NOT NULL,
  PRIMARY KEY (ticker, quarter)
);
