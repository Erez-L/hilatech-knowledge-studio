-- HilaTech Knowledge Studio — initial schema.
-- Run by the owner role (hks_owner). The application connects as hks_app,
-- which owns nothing and is always subject to row-level security.
-- The `vector` extension must already exist (created by a superuser).

-- ---------------------------------------------------------------- identity

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind        text NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'demo')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- At most one demo organization.
CREATE UNIQUE INDEX organizations_single_demo ON organizations (kind) WHERE kind = 'demo';

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL CHECK (email = lower(email) AND char_length(email) <= 254),
  email_verified  timestamptz,
  name            text CHECK (name IS NULL OR char_length(name) <= 120),
  password_hash   text,
  locale          text NOT NULL DEFAULT 'en' CHECK (locale IN ('he', 'en')),
  disabled_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 of the session token; the token itself is only ever in the cookie.
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

CREATE TABLE memberships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX memberships_user ON memberships (user_id);

CREATE TABLE workspaces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug             text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id)
);

-- --------------------------------------------------------------- documents

CREATE TABLE documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  workspace_id         uuid NOT NULL,
  uploaded_by_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  title                text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
  original_filename    text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  file_type            text NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'md')),
  mime_type            text NOT NULL,
  size_bytes           bigint NOT NULL CHECK (size_bytes > 0),
  content_sha256       text,
  storage_key          text NOT NULL,
  language             text CHECK (language IS NULL OR language IN ('he', 'en', 'mixed')),
  page_count           integer,
  chunk_count          integer NOT NULL DEFAULT 0,
  status               text NOT NULL CHECK (status IN
                         ('pending_upload', 'uploaded', 'queued', 'processing', 'ready', 'failed', 'unsupported', 'deleting')),
  failure_code         text,
  failure_detail       text,
  ready_at             timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, organization_id) REFERENCES workspaces (id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id)
);
CREATE INDEX documents_library ON documents (organization_id, workspace_id, created_at DESC);
CREATE INDEX documents_status ON documents (organization_id, workspace_id, status);
-- Duplicate protection: identical bytes cannot be processed twice in one workspace.
CREATE UNIQUE INDEX documents_no_duplicates ON documents (workspace_id, content_sha256)
  WHERE content_sha256 IS NOT NULL AND status IN ('processing', 'ready');

CREATE TABLE document_chunks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  workspace_id      uuid NOT NULL,
  document_id       uuid NOT NULL,
  chunk_index       integer NOT NULL CHECK (chunk_index >= 0),
  -- From extraction only; never inferred.
  page_number       integer CHECK (page_number IS NULL OR page_number >= 1),
  page_end          integer,
  section_path      text[],
  text              text NOT NULL,
  search_text       text NOT NULL,
  fts               tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  char_count        integer NOT NULL,
  token_estimate    integer NOT NULL,
  chunking_version  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (document_id, organization_id) REFERENCES documents (id, organization_id) ON DELETE CASCADE,
  UNIQUE (document_id, chunk_index),
  UNIQUE (id, organization_id)
);
CREATE INDEX document_chunks_tenant ON document_chunks (organization_id, workspace_id);

-- -------------------------------------------------------------- embeddings

CREATE TABLE embedding_indexes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text NOT NULL,
  model_id       text NOT NULL,
  -- test_double indexes hold vectors from the deterministic stand-in and are
  -- never mixed with, or compared to, vectors from a real model.
  kind           text NOT NULL CHECK (kind IN ('live', 'test_double')),
  dimensions     integer NOT NULL CHECK (dimensions > 0),
  distance       text NOT NULL DEFAULT 'cosine',
  storage_table  text NOT NULL DEFAULT 'chunk_embeddings',
  status         text NOT NULL CHECK (status IN ('building', 'active', 'retired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  activated_at   timestamptz,
  retired_at     timestamptz,
  UNIQUE (id, dimensions)
);
-- At most one active index per kind.
CREATE UNIQUE INDEX embedding_indexes_one_active ON embedding_indexes (kind) WHERE status = 'active';

CREATE TABLE chunk_embeddings (
  chunk_id            uuid NOT NULL,
  embedding_index_id  uuid NOT NULL,
  -- The composite foreign key below means only an index registered with 1024
  -- dimensions can own rows here: incompatible dimensions cannot be mixed.
  dimensions          integer NOT NULL DEFAULT 1024 CHECK (dimensions = 1024),
  organization_id     uuid NOT NULL,
  workspace_id        uuid NOT NULL,
  document_id         uuid NOT NULL,
  embedding           vector(1024) NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, embedding_index_id),
  FOREIGN KEY (chunk_id, organization_id) REFERENCES document_chunks (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (embedding_index_id, dimensions) REFERENCES embedding_indexes (id, dimensions)
);
CREATE INDEX chunk_embeddings_hnsw_cosine ON chunk_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunk_embeddings_tenant ON chunk_embeddings (organization_id, workspace_id, embedding_index_id);
CREATE INDEX chunk_embeddings_document ON chunk_embeddings (document_id);

CREATE TABLE ingestion_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  document_id         uuid NOT NULL,
  kind                text NOT NULL DEFAULT 'ingest' CHECK (kind IN ('ingest', 'reindex')),
  status              text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  step                text CHECK (step IS NULL OR step IN
                        ('validating', 'extracting', 'normalizing', 'chunking', 'embedding', 'persisting')),
  progress            smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempt             integer NOT NULL DEFAULT 0,
  error_code          text,
  error_detail        text,
  embedding_index_id  uuid REFERENCES embedding_indexes (id),
  correlation_id      text NOT NULL,
  queued_at           timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  finished_at         timestamptz,
  FOREIGN KEY (document_id, organization_id) REFERENCES documents (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX ingestion_jobs_document ON ingestion_jobs (document_id, queued_at DESC);
CREATE INDEX ingestion_jobs_open ON ingestion_jobs (status) WHERE status IN ('queued', 'running');

-- ----------------------------------------------------------- conversations

CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  workspace_id     uuid NOT NULL,
  user_id          uuid REFERENCES users (id) ON DELETE CASCADE,
  demo_session_id  text,
  title            text,
  locale           text NOT NULL CHECK (locale IN ('he', 'en')),
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, organization_id) REFERENCES workspaces (id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id),
  -- Owned by exactly one of: a user, or an anonymous demo session.
  CHECK ((user_id IS NULL) <> (demo_session_id IS NULL))
);
CREATE INDEX conversations_owner ON conversations (organization_id, workspace_id, user_id, last_message_at DESC);
CREATE INDEX conversations_demo ON conversations (demo_session_id) WHERE demo_session_id IS NOT NULL;

CREATE TABLE messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  conversation_id     uuid NOT NULL,
  role                text NOT NULL CHECK (role IN ('user', 'assistant')),
  content             text NOT NULL,
  status              text NOT NULL CHECK (status IN ('complete', 'streaming', 'cancelled', 'failed')),
  answer_status       text CHECK (answer_status IS NULL OR answer_status IN ('answered', 'insufficient_evidence', 'uncited')),
  -- 'sample' marks output of a deterministic test double. It is never shown as live AI.
  pipeline_mode       text CHECK (pipeline_mode IS NULL OR pipeline_mode IN ('live', 'sample')),
  llm_provider        text,
  llm_model_id        text,
  embedding_index_id  uuid REFERENCES embedding_indexes (id),
  input_tokens        integer,
  output_tokens       integer,
  retrieval           jsonb,
  error_code          text,
  correlation_id      text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, organization_id) REFERENCES conversations (id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id)
);
CREATE INDEX messages_conversation ON messages (conversation_id, created_at);

CREATE TABLE citations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  message_id       uuid NOT NULL,
  label            text NOT NULL,
  ordinal          integer NOT NULL,
  chunk_id         uuid REFERENCES document_chunks (id) ON DELETE SET NULL,
  document_id      uuid REFERENCES documents (id) ON DELETE SET NULL,
  document_title   text,
  page_number      integer,
  section_path     text[],
  excerpt          text,
  similarity       real,
  source_state     text NOT NULL DEFAULT 'available' CHECK (source_state IN ('available', 'removed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (message_id, organization_id) REFERENCES messages (id, organization_id) ON DELETE CASCADE,
  UNIQUE (message_id, label)
);
CREATE INDEX citations_chunk ON citations (chunk_id);
CREATE INDEX citations_document ON citations (document_id);

-- ------------------------------------------------- usage, leads, audit

CREATE TABLE usage_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id     uuid,
  user_id          uuid,
  demo_session_id  text,
  kind             text NOT NULL CHECK (kind IN ('chat_completion', 'query_embedding', 'document_embedding')),
  provider         text NOT NULL,
  model_id         text NOT NULL,
  provider_kind    text NOT NULL CHECK (provider_kind IN ('live', 'test_double')),
  input_tokens     integer NOT NULL DEFAULT 0,
  output_tokens    integer NOT NULL DEFAULT 0,
  units            integer NOT NULL DEFAULT 0,
  message_id       uuid,
  document_id      uuid,
  correlation_id   text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_org ON usage_events (organization_id, created_at DESC);
CREATE INDEX usage_events_time ON usage_events (created_at);

CREATE TABLE contact_leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) <= 120),
  email       text NOT NULL CHECK (char_length(email) <= 254),
  company     text CHECK (company IS NULL OR char_length(company) <= 160),
  message     text CHECK (message IS NULL OR char_length(message) <= 2000),
  locale      text NOT NULL,
  source      text NOT NULL DEFAULT 'landing',
  request_id  text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled', 'spam')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_leads_time ON contact_leads (created_at DESC);

CREATE TABLE audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid,
  actor_user_id    uuid,
  actor_kind       text NOT NULL CHECK (actor_kind IN ('user', 'demo', 'system', 'anonymous')),
  action           text NOT NULL,
  target_type      text,
  target_id        uuid,
  outcome          text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  -- IDs and codes only: no document text, filenames or secrets.
  metadata         jsonb NOT NULL DEFAULT '{}',
  correlation_id   text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_org ON audit_events (organization_id, created_at DESC);
CREATE INDEX audit_events_action ON audit_events (action, created_at DESC);

-- ------------------------------------------------------ row-level security
-- Defence in depth. Every repository call also filters by tenant explicitly;
-- these policies make a forgotten filter return nothing instead of another
-- tenant's rows. The app sets `app.organization_id` per transaction. When it
-- is absent, current_setting(..., true) is NULL and no row matches.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspaces', 'documents', 'document_chunks', 'chunk_embeddings', 'ingestion_jobs',
    'conversations', 'messages', 'citations', 'usage_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)
         WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_events FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY audit_append ON audit_events FOR INSERT
  WITH CHECK (organization_id IS NULL
              OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- ------------------------------------------------------------------ grants

GRANT USAGE ON SCHEMA public TO hks_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations, users, sessions, memberships, workspaces, documents, document_chunks,
  chunk_embeddings, ingestion_jobs, conversations, messages, citations, embedding_indexes
  TO hks_app;
-- Append-only for the application.
GRANT SELECT, INSERT ON usage_events, audit_events TO hks_app;
-- The application can record a lead but cannot read leads back.
GRANT INSERT ON contact_leads TO hks_app;
