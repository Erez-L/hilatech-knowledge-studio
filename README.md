# HilaTech Knowledge Studio

An AI knowledge workspace: upload business documents, ask questions in Hebrew or English, and check every answer against the passage it came from.

This is an independently developed demonstration product by HilaTech. The company in the demo, Northstar Business Services, and its documents are fictional.

## Status

**Milestone 1 — design foundation.** Built and browser-tested:

- Design system (tokens, light and dark themes, typography, motion, RTL/LTR)
- Landing page, in English and Hebrew
- Knowledge Workspace in **sample-preview mode**, in English and Hebrew
- Contact form with client and server validation

**Not built yet:** database, authentication, document upload and ingestion, retrieval, live AI answers, the document library, conversation persistence. In sample-preview mode the workspace replays hand-written example answers from `apps/web/src/sample/northstar.ts`; nothing is sent to a model, and the interface says so on screen.

See `docs/MILESTONE_1_REPORT.md` for exactly what was verified and what was not.

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

`apps/worker` and `packages/*` are described in `docs/ARCHITECTURE.md` and arrive with the functional milestone.

## Documents

| Area | Files |
|---|---|
| Product | `PRODUCT_REQUIREMENTS`, `USER_JOURNEYS`, `FEATURE_SCOPE`, `ACCEPTANCE_CRITERIA` |
| Design | `DESIGN_VISION`, `DESIGN_SYSTEM`, `SCREEN_BLUEPRINTS`, `RESPONSIVE_BEHAVIOR` |
| Architecture (designs, not implemented) | `ARCHITECTURE`, `DATABASE_SCHEMA`, `RAG_PIPELINE`, `SECURITY`, `DEPLOYMENT` |
