-- Migration 0002: Auth.js (NextAuth v5) tables for the web viewer's magic-link
-- login. Lives in the same database as the app tables (single DB). With JWT
-- sessions we don't need a sessions table; the verification-tokens table is what
-- makes the magic link work (a one-time token stored on send, consumed on click).
--
-- (Same constraints as 0001: statements split on ";"; no ";" inside literals.)

CREATE TABLE auth_users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  email_verified TEXT,
  name           TEXT,
  image          TEXT
);

CREATE TABLE auth_accounts (
  user_id              TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  provider             TEXT NOT NULL,
  provider_account_id  TEXT NOT NULL,
  refresh_token        TEXT,
  access_token         TEXT,
  expires_at           INTEGER,
  token_type           TEXT,
  scope                TEXT,
  id_token             TEXT,
  session_state        TEXT,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE INDEX idx_auth_accounts_user ON auth_accounts(user_id);

CREATE TABLE auth_verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);
