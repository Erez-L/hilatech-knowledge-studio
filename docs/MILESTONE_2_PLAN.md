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
| 4 | Authentication (Better Auth), server-side authorization, HTTP API (upload, documents, conversations, streaming chat), Redis rate limits, PostgreSQL lead store | **Done and tested** over real HTTP |
| 5 | Product UI on real data: sign-in, library, upload and progress, workspace on the streaming API, document preview, all states; Playwright and axe in he/en, light/dark, mobile/desktop | **Done and tested** in a real browser, with test doubles for the AI |
| 6 | Public demo tenant with strict limits and isolation, evaluation set and runner, production readiness check, real-provider test suite and procedure | **Built and tested with test doubles. Not verified against real providers** (no credentials; Bedrock and S3 are unreachable from the build environment) |

## Status after checkpoint 6

### What is real and tested

- Sign-up, email verification, sign-in, sign-out, password reset, session expiry and revocation, rate limits (Better Auth on the existing tables; mail goes to a development outbox file).
- Tenant isolation at three levels: the session decides the organization, every repository call is scoped, and PostgreSQL row-level security refuses the rest. Tested over HTTP with manipulated ids, headers, query strings and bodies.
- Upload → validation → private storage → queue → worker → extraction → chunking → vectors → Ready, for PDF, DOCX, TXT and Markdown in English and Hebrew.
- Question → retrieval inside the workspace → streamed answer → validated citations → evidence viewer with the cited passage and a server-rendered page image → saved conversation and usage.
- Public demo at `/demo`: anonymous signed session, twelve fictional documents (six English, six Hebrew), read-only, three limits (per address per minute, per visitor, per day for everyone), isolated from customer organizations in both directions.
- Contact leads in PostgreSQL.

### What is simulated

Every answer and every vector in the tests comes from **deterministic test doubles**: a word-matching stand-in for the embeddings model and a stand-in for the chat model that stitches retrieved sentences together. The interface labels this output ("Test double", "Test-double output, not AI") and the database stores it as `pipeline_mode = 'sample'` in a separate `test_double` embedding index. The doubles are refused when `APP_ENV=production`. They prove that the system works end to end. They prove nothing about answer quality, retrieval quality or Hebrew/English cross-language retrieval.

### What has never been run

- No call has been made to the Anthropic API, Amazon Bedrock (Claude or Cohere Embed Multilingual v3), Amazon S3 or an SMTP server.
- `pnpm test:live` (six test files in `tests/live/`) and the procedure in `docs/REAL_PROVIDER_VERIFICATION.md` are written and type-checked. With nothing configured every file skips. The first real run may expose errors in the tests as well as in the adapters.
- The similarity thresholds (`RAG_MIN_SIMILARITY`, `RAG_EVIDENCE_MIN_SIMILARITY`) are placeholders until calibrated with real embeddings.
- The Docker Compose file has not been run (no Docker daemon in the build environment).

### Known issues found by review, not yet fixed

| Area | Issue |
|---|---|
| Bedrock region | One region is used for both models. Cohere Embed Multilingual v3 is not offered in every region (not in il-central-1) |
| `docs/DEPLOYMENT.md` | The Bedrock model-access steps predate the current AWS behaviour (first invocation of a third-party model needs AWS Marketplace permissions) |
| Members | The members API exists and is tested; there is no members screen yet |

### Hardening after checkpoint 6 (code and automated tests only; nothing was run against AWS)

- **Embedding token limit.** Cohere Embed Multilingual v3 accepts 512 tokens per text and the request never lets the service truncate. Chunks are now sized before embedding with a deliberately high local token estimate (target 400 tokens: one token per 3 Latin characters, per 1.5 characters of Hebrew or any other script, per punctuation mark). A chunk that does not fit is split at sentence ends, then at whitespace, keeping its page and section; the pieces are stored and each vector belongs to exactly the stored piece. If the provider still rejects a passage, the batch is retried one passage at a time, the offender is split in two, at most three levels deep, and then the document fails with a clear reason. **The estimate is not Cohere's tokenizer and has not been compared with it**; the live embeddings test measures the real limit.
- **Daily AI budget.** New table `ai_budget_days` (migration `0003`, row-level security). Every provider call is preceded by an atomic reservation in one conditional SQL statement, so concurrent workers cannot overspend: document embedding (uploads, retries, demo seeding), query embedding and chat. A question reserves its worst case and is reconciled to the tokens the model reports; a reservation is released only when nothing was sent; every retry reserves again. An exhausted budget fails the document or the question with `budget_exceeded` and is not retried automatically. Budgets are per organization and reset at midnight UTC. Test doubles are counted with estimated tokens.
- **S3 errors.** `exists()` is false only for a definite 404; `get()` reports `not_found` only for `NoSuchKey`; a 403, invalid credentials, a wrong Region, a missing bucket and network failures are raised as errors that say what to check, and never contain the object key. Tested with stubbed SDK responses only.

### Fixed during checkpoint 6

- **Signed links broke after a PDF was opened.** pdf.js installs a simplified `Uint8Array.prototype.toBase64` that ignores its options; the authentication library then encoded verification and reset tokens in the wrong alphabet, and links failed whenever the token contained `+`. `packages/ai/src/extraction/pdf-library.ts` now replaces it with a standard implementation. Found by the demo tests.
- **A citation could show the page before the cited text.** A passage could start on one page and end on the next, and the citation showed the first. A chunk now never spans two pages (chunking version `v2`).
- **A cut-off or refused model reply was stored as a complete answer.** `max_tokens`, `refusal` and filter stop reasons now mark the answer as failed.
- One missing Bedrock stream error (`serviceUnavailableException`) is now handled.
- A conversation that could not be opened left the workspace on a loading skeleton.

## What existed after checkpoints 1–3 (kept for the record)

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

## Test results

| Suite | Command | Result |
|---|---|---|
| Unit and integration (database, AI layer, pipeline, storage) | `pnpm test` | 95 passed |
| HTTP, against a production build with the worker, PostgreSQL and Redis | `bash scripts/http-tests.sh` | 58 passed |
| Browser (Chrome through Playwright, with axe) | `bash scripts/ui-checks.sh` | 75 passed |
| Evaluation set, 46 questions, test doubles | `pnpm demo:seed && pnpm evaluate` | Runs end to end; the numbers are not quality evidence |
| Real providers | `pnpm test:live` | **Not run** |

All of the above use test doubles for the AI models. PostgreSQL 16.15 + pgvector 0.6.0 and Redis 7.0 on the build machine.

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

## What the owner needs to do to verify with real providers

Follow `docs/REAL_PROVIDER_VERIFICATION.md` on a machine that can reach Bedrock. In short: put credentials in the environment (never in chat or the repository), run `pnpm check:readiness`, then `pnpm test:live` one switch at a time, then `pnpm demo:seed` and `pnpm evaluate -- --yes`. Each step lists what it costs before it runs. Nothing in this repository provisions AWS resources.

## Deviations from the architecture document

- `packages/core` was added for use cases shared by the web app and the worker (the document placed orchestration in the apps).
- Document deletion finishes inside the request instead of a queued job. A failed file removal is logged for a later sweep.
- Authentication uses Better Auth with database sessions on the existing tables (owner decision), not Auth.js.
- Local development uses services installed on the host (`scripts/dev-services.sh`), because Docker was not available to test the Compose file.
