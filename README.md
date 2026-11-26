# HilaTech Knowledge Studio

An AI knowledge workspace: upload business documents, ask questions in Hebrew or English, and check every answer against the passage it came from.

This is an independently developed demonstration product by HilaTech. The company in the demo, Northstar Business Services, and its documents are fictional.

## Status

**Milestone 1 — design foundation: closed.** Design system, landing page and the Knowledge Workspace in sample-preview mode, in English and Hebrew. See `docs/MILESTONE_1_REPORT.md`.

**Milestone 2 — real RAG: built, tested with test doubles, not yet verified with real AI providers.** Accounts and organizations (Better Auth), a private document library, an ingestion worker, tenant-scoped retrieval on PostgreSQL + pgvector with row-level security, streamed answers with validated citations, an evidence viewer, and a public demo with strict limits. Every screen works against the real backend in English and Hebrew.

**What is simulated:** in every test the embedding and chat models are **deterministic test doubles**, and the interface labels their output as such. **No call has been made to Anthropic, Amazon Bedrock or Amazon S3**, so answer quality, retrieval quality and cross-language retrieval are unknown, and this is not yet claimed to work as an AI product. The tests and procedure for that verification are ready: `docs/REAL_PROVIDER_VERIFICATION.md`. Full status: `docs/MILESTONE_2_PLAN.md`.

## Run it

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Other commands:

```bash
pnpm typecheck
pnpm lint
pnpm build && pnpm start
```

Tests need PostgreSQL 16 with pgvector and Redis. All of them use deterministic test doubles in place of the AI models:

```bash
bash scripts/dev-services.sh start   # host-installed services (see the script header)
pnpm test                            # 101 tests: database, AI layer, pipeline, pending sign-ups
bash scripts/http-tests.sh           # 58 tests over HTTP: auth, authorization, tenant isolation, public demo, limits
bash scripts/ui-checks.sh            # 75 browser checks with screenshots into artifacts/screenshots/app
```

The part of the tests that needs no services runs with `pnpm test:unit`. GitHub Actions runs it with the typecheck and the lint for every pull request (`.github/workflows/ci.yml`), and again before an image is built. The same workflow also runs the suites above that need PostgreSQL and Redis (the pipeline, registration and database suites, and the HTTP suite), against pgvector and Redis service containers with the development credentials and the deterministic test doubles. The live suites (`pnpm test:live`) call paid services and stay manual.

Checks of the landing page and the scripted preview (need a server on port 3100):

```bash
pnpm --filter @hks/web exec next start --port 3100
node apps/web/scripts/visual-qa.mjs
node apps/web/scripts/checks.mjs
```

Operating commands:

```bash
pnpm db:migrate          # apply migrations (owner credentials)
pnpm demo:seed           # index the twelve fictional documents into the public demo
pnpm evaluate            # run the 46 evaluation questions; add `-- --yes` with real providers (paid)
pnpm check:readiness     # inspect a production configuration; calls no paid service
pnpm test:live           # real-provider tests; every file is off until its switch is set
```

Configuration is described in `.env.example`. Real-provider verification has not been run; the procedure is `docs/REAL_PROVIDER_VERIFICATION.md` and the current status is `docs/MILESTONE_2_PLAN.md`.

## Layout

```
apps/web/            Next.js app (App Router): UI, design system, route handlers
  messages/          en.json, he.json
  src/app/           routes, global tokens (globals.css)
  src/components/    ui, shared, marketing, workspace
  src/sample/        fictional sample content for the preview
  scripts/           visual QA and browser checks
docs/                product, design and architecture documents
artifacts/screenshots/  captured from the running app
```

```
apps/worker/         ingestion worker process (BullMQ)
packages/shared/     configuration, error codes, logging
packages/database/   migrations, typed schema, tenant-scoped repositories
packages/ai/         provider adapters, extraction, chunking, prompt, citation filter
packages/core/       upload, ingestion, answering, storage, queue
samples/northstar/   fictional sample documents (built by scripts/build-sample-documents.py)
```

## Documents

| Area | Files |
|---|---|
| Product | `PRODUCT_REQUIREMENTS`, `USER_JOURNEYS`, `FEATURE_SCOPE`, `ACCEPTANCE_CRITERIA` |
| Design | `DESIGN_VISION`, `DESIGN_SYSTEM`, `SCREEN_BLUEPRINTS`, `RESPONSIVE_BEHAVIOR` |
| Architecture | `ARCHITECTURE`, `DATABASE_SCHEMA`, `RAG_PIPELINE`, `SECURITY`, `DEPLOYMENT` |
| Status and verification | `MILESTONE_1_REPORT`, `MILESTONE_2_PLAN`, `REAL_PROVIDER_VERIFICATION` |
