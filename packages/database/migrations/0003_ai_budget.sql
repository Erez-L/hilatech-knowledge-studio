-- Daily AI token budget per organization, as atomic reservations.
-- A row is the number of tokens reserved (and, after reconciliation, used) on
-- one UTC day. The application increments it with a single conditional
-- statement, so concurrent workers cannot overspend between a check and a write.
CREATE TABLE ai_budget_days (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day             date NOT NULL,
  input_tokens    bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens   bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day)
);
ALTER TABLE ai_budget_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_budget_days
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON ai_budget_days TO hks_app;
