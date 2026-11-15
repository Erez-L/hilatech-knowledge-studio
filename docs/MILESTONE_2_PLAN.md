# Milestone 2 — real full-stack RAG: plan and status

Branch: `milestone-2-rag-foundation`. Updated 2026-11-15.

Goal: turn the sample-preview workspace into a working knowledge application, in small checkpoints that are each verified before the next starts.

## Rules that apply to every checkpoint

- Nothing simulated is presented as AI. The deterministic test doubles are tagged `test_double`, kept in their own embedding index, saved with `pipeline_mode = 'sample'`, refused in production, and labelled in the interface.
- A feature is reported complete only when it works end to end and has a test.
- The RAG pipeline is not called "working" until it passes a test against real providers. It has not: see "External verification still required".
- No paid AWS resources are created. No secrets are committed.

## Checkpoints

| # | Checkpoint | Status |
|---|---|---|
| 1 | Database foundation: schema, migrations, row-level security, tenant-scoped repositories, vector search | **Done and tested** |
| 2 | AI layer: provider interfaces and adapters, test doubles, extraction, chunking, prompt, citation filter | **Done and tested** (adapters with stubbed clients only) |
| 3 | Pipeline: storage, upload, BullMQ worker, ingestion to Ready, retrieval, grounded answer, persistence, deletion | **Done and tested** with test doubles |
| 4 | Authentication, server-side authorization, HTTP API (upload, documents, conversations, streaming chat), Redis rate limits, PostgreSQL lead store | Not started — needs the auth decision below |
| 5 | Product UI on real data: sign-in, library, upload and progress, workspace wired to the streaming API, document preview, all states; Playwright and axe in he/en, light/dark, mobile/desktop | Not started |
| 6 | Demo tenant seeded through the pipeline, evaluation set, verification against real providers, threshold calibration | Not started — needs credentials |

## What exists after checkpoints 1–3

```
packages/shared     configuration (zod), error codes, structured logging
packages/database   SQL migrations, typed schema, tenant transactions, repositories
packages/ai         provider interfaces + adapters, extraction, chunking, prompt, citation filter
packages/core       storage, upload, ingestion, answer orchestration, BullMQ queue and worker
apps/worker         worker process entry point
samples/northstar   six real sample documents (3 PDF, 2 DOCX incl. one Hebrew, 1 TXT), all fictional
```

The mandatory flow, step by step:

| Step | State |
|---|---|
| 1. Authenticated user uploads PDF, DOCX or TXT | Upload use case done; HTTP endpoint and authentication are checkpoint 4 |
| 2. Server validates the upload | Done: size, type from bytes, extension agreement, zip-bomb check |
| 3. File stored privately | Done for local disk; S3 adapter written, not verified |
| 4. Ingestion job created | Done: database row plus BullMQ job |
| 5. Text extracted | Done: PDF by page, DOCX by heading trail, TXT, Markdown; scanned PDFs reported unsupported |
| 6. Chunked | Done: structure-aware, overlap within a page |
| 7. Embeddings generated | Done with the test double; Bedrock Cohere adapter written, not verified |
| 8. Chunks and vectors saved | Done: `vector(1024)`, HNSW index, one transaction |
| 9. Status becomes Ready | Done, only after indexing succeeds |
| 10. User asks in the workspace | Use case done; UI wiring is checkpoint 5 |
| 11. Retrieval from the correct workspace | Done: tenant filter before ranking, plus row-level security |
| 12. Grounded answer from the LLM | Orchestration done; real model output not verified |
| 13. Streamed to the frontend | Event stream produced by the use case; HTTP streaming is checkpoint 4 |
| 14. Citations reference retrieved chunks | Done: unknown labels are dropped before client or database |
| 15. Citation opens the right document and location | Data is stored and returned (document, page or section, excerpt); the viewer is checkpoint 5 |
| 16. Conversation and usage persisted | Done |

## Test results (65 tests, all passing)

Run with `pnpm test`, against PostgreSQL 16.15 + pgvector 0.6.0 and Redis 7.0 on the build machine.

- **Database (18):** migrations idempotent; typed schema matches the database column for column; the application role sees nothing without a tenant, cannot read or write another tenant, cannot read leads or alter the audit trail; vector ranking is correct and confined to the workspace even when another tenant holds perfect matches; non-ready documents are excluded; wrong-dimension vectors are rejected; one model's index is never served to another; duplicate protection; two-step deletion with tombstoned citations; conversations private to their owner.
- **AI layer (30):** file detection from bytes; extension mismatch; zip bomb; PDF pages exact; running footers removed; DOCX heading trail; Hebrew DOCX; Markdown; scanned PDF; damaged files; page limit; chunk size limits, sections, overlap; Hebrew normalization; test doubles; prompt containment of injected text; citation filter under every stream split; adapter request and response shapes (stubbed); configuration rules.
- **Pipeline (17):** upload through the BullMQ worker to Ready for PDF, DOCX, TXT and Hebrew DOCX; bad uploads rejected before storage; scanned and damaged files; duplicate file; provider outage retried three times, then manual retry succeeds; answer with page and section citations; conversation continuation; Hebrew question; insufficient evidence without calling the model; no cross-organization retrieval; invented citations dropped; injected document text escaped; cancellation; not-configured errors; conversation ownership; deletion of file, chunks and vectors.

Also checked by hand: the worker process starts with test doubles in development, exits with a clear message when unconfigured, and refuses test doubles in production.

## External verification still required

None of these could be exercised in the build environment (no credentials; Bedrock and S3 are not reachable from it).

| Integration | What is unverified |
|---|---|
| Anthropic API | The chat adapter has never called the API. Needs `ANTHROPIC_API_KEY` |
| Amazon Bedrock, Claude | The Converse streaming adapter, model or inference-profile ID, region, IAM permissions |
| Amazon Bedrock, Cohere Embed Multilingual v3 | Request and response shape, the 1024-dimension output, batch and length limits |
| Retrieval quality | Similarity thresholds are placeholders; Hebrew and cross-language retrieval quality is unknown. The test double is lexical and proves nothing about quality |
| Answer quality | Grounding, citation accuracy and refusal behaviour of the real model; prompt-injection resistance beyond input escaping |
| Amazon S3 | The storage adapter, bucket policy, encryption |
| Hebrew PDFs | Reading order of right-to-left text from pdf.js |
| Docker Compose file | Written but not run (no Docker daemon in the build environment) |
| Large workspaces | The approximate (HNSW) search path above 20,000 vectors per workspace is not load-tested |

## Decisions needed from the owner

1. **Authentication library.** The architecture document proposed Auth.js v5, which is still a beta. The schema currently includes a `sessions` table for a small server-side session implementation (hashed tokens, scrypt passwords, httpOnly cookies). The options are that, Better Auth, or Auth.js. Checkpoint 4 starts once this is chosen.
2. **Credentials for verification.** An Anthropic API key in a local `.env` allows the chat half to be verified from the build environment. Embeddings need Bedrock access, which the build environment cannot reach, so the full pipeline must be verified from a machine that can.
3. **Sample documents in Hebrew.** One Hebrew document exists. Decide whether the public demo should carry Hebrew editions of all sample documents.

## Deviations from the architecture document

- `packages/core` was added for use cases shared by the web app and the worker (the document placed orchestration in the apps).
- Document deletion finishes inside the request instead of a queued job. A failed file removal is logged for a later sweep.
- Database-backed sessions are sketched in place of Auth.js JWT sessions, pending decision 1.
- Local development uses services installed on the host (`scripts/dev-services.sh`), because Docker was not available to test the Compose file.
