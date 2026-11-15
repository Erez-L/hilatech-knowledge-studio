# HilaTech Knowledge Studio

An AI knowledge workspace: upload business documents, ask questions in Hebrew or English, and check every answer against the passage it came from.

This is an independently developed demonstration product by HilaTech. The company in the demo, Northstar Business Services, and its documents are fictional.

## Status

**Milestone 1 — design foundation: closed.** Design system, landing page and the Knowledge Workspace in sample-preview mode, in English and Hebrew. See `docs/MILESTONE_1_REPORT.md`.

**Milestone 2 — real RAG: in progress.** The backend pipeline is built and tested: PostgreSQL + pgvector schema with row-level security, document extraction and chunking, a BullMQ ingestion worker, tenant-scoped retrieval, grounded answers with validated citations, persistence and deletion. It is tested end to end with **deterministic test doubles** in place of the embedding and chat models.

**Not done yet:** authentication, the HTTP API, and wiring the interface to the backend. The workspace in the browser still shows pre-written samples and says so. **The pipeline has not been run against real model providers**, so it is not yet claimed to work as an AI product. See `docs/MILESTONE_2_PLAN.md`.

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

Backend tests need PostgreSQL 16 with pgvector and Redis:

```bash
bash scripts/dev-services.sh start   # host-installed services (see the script header)
pnpm test                            # 65 tests: database, AI layer, end-to-end pipeline
```

Browser checks (need Google Chrome and a running server on port 3100):

```bash
pnpm --filter @hks/web exec next start --port 3100
node apps/web/scripts/visual-qa.mjs     # screenshots into artifacts/screenshots
node apps/web/scripts/checks.mjs        # accessibility and interaction checks
```

Configuration is described in `.env.example`. No secrets are needed for this milestone.

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
| Architecture (designs, not implemented) | `ARCHITECTURE`, `DATABASE_SCHEMA`, `RAG_PIPELINE`, `SECURITY`, `DEPLOYMENT` |
