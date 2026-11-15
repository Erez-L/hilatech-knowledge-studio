-- Better Auth integration. Additive: nothing is dropped.
--
-- Better Auth owns authentication state (credentials, sessions, verification
-- tokens). The application keeps owning identity-adjacent domain data
-- (organizations, memberships, workspaces). There is one users table.
--
-- users
--   * `email_verified` becomes the boolean Better Auth expects. The previous
--     timestamp column is kept under a new name, so no information is lost.
--   * `password_hash` is NOT used any more: Better Auth stores credentials in
--     `accounts`. The column is left in place (dropping it needs approval).
ALTER TABLE users RENAME COLUMN email_verified TO email_verified_at;
ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
UPDATE users SET email_verified = true WHERE email_verified_at IS NOT NULL;
ALTER TABLE users ADD COLUMN image text;
COMMENT ON COLUMN users.password_hash IS 'Unused since migration 0002: credentials live in accounts (Better Auth).';

-- sessions: Better Auth looks sessions up by `token`. The earlier design's
-- `token_hash` column is kept but no longer required.
ALTER TABLE sessions ALTER COLUMN token_hash DROP NOT NULL;
ALTER TABLE sessions ADD COLUMN token text UNIQUE;
ALTER TABLE sessions ADD COLUMN ip_address text;
ALTER TABLE sessions ADD COLUMN user_agent text;
ALTER TABLE sessions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN sessions.token_hash IS 'Unused since migration 0002 (Better Auth uses token).';

-- Credential and OAuth account links. `password` holds the password hash
-- produced by Better Auth for the "credential" provider.
CREATE TABLE accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id                text NOT NULL,
  provider_id               text NOT NULL,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  password                  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
CREATE INDEX accounts_user ON accounts (user_id);

-- Short-lived tokens for email verification and password reset.
CREATE TABLE verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verifications_identifier ON verifications (identifier);
CREATE INDEX verifications_expiry ON verifications (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON accounts, verifications TO hks_app;
