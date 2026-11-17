-- Usage events gain a kind for reading scanned PDF pages with a vision model (OCR).
-- Only the list of allowed values changes; no rows are touched.
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_kind_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
  CHECK (kind IN ('chat_completion', 'query_embedding', 'document_embedding', 'document_ocr'));
