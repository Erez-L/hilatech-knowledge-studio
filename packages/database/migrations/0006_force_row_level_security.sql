-- Row level security applies to the table owner too (FORCE). Until now the policies constrained
-- only the application role; a process connected as the owner role (the migration credentials)
-- read and wrote every tenant's rows without noticing. The application role is unaffected.
--
-- The owner role now sees a tenant's rows only after setting app.organization_id for the
-- transaction, like the application does. Schema changes are not affected. A superuser (used for
-- backups with pg_dump) bypasses row level security as before.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspaces', 'documents', 'document_chunks', 'chunk_embeddings', 'ingestion_jobs',
    'conversations', 'messages', 'citations', 'usage_events', 'audit_events',
    'ai_budget_days', 'document_summaries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
