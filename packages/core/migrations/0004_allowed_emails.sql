-- Migration 0004: move the web viewer's sign-in allowlist out of the
-- ALLOWED_EMAILS env var and into the database, so adding a reader is a single
-- SQL insert (via `pnpm allow-email <addr>`) with no env change and no Vercel
-- redeploy. auth.ts checks this table in its signIn callback.
--
-- Emails are stored lowercased/trimmed (the CLI and the auth check both
-- normalize before comparing). Fails closed: an empty table denies everyone,
-- same as the old empty-env-var behavior.
--
-- (Same constraints as 0001: statements split on ";"; no ";" inside literals.)

CREATE TABLE allowed_emails (
  email     TEXT PRIMARY KEY,
  note      TEXT,
  added_at  TEXT NOT NULL
);
