-- A saved summary of one document with its highlighted passages, per interface language.
-- Regenerating replaces the row. Deleting the document deletes its summaries.
CREATE TABLE document_summaries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL,
  document_id         uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  locale              text NOT NULL CHECK (locale IN ('he', 'en')),
  provider            text NOT NULL,
  model_id            text NOT NULL,
  provider_kind       text NOT NULL CHECK (provider_kind IN ('live', 'test_double')),
  content             jsonb NOT NULL,
  created_by_user_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, locale)
);
ALTER TABLE document_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_summaries
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON document_summaries TO hks_app;

-- Summaries are their own kind of usage, so they do not count as questions.
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_kind_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
  CHECK (kind IN ('chat_completion', 'query_embedding', 'document_embedding', 'document_ocr', 'document_summary'));
