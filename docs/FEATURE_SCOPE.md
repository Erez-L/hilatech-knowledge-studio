# Feature scope

Status: draft specification. The status columns below record planning state only. No item is implemented or tested.

## 1. How to read this document

- **P0** is required for the initial delivery. **P1** is implemented only after P0 is stable. **P2** is out of scope for the initial delivery.
- P1 and P2 work must not compromise P0 quality.
- The priority tables reflect section 4 of the master brief item for item.
- Status values: **Not started**, **In progress**, **Done**. An item is **Done** only when its acceptance criteria in `ACCEPTANCE_CRITERIA.md` pass. For anything that depends on AI, "Done" also requires verification against the real providers.
- Current state: Milestone 1 items are **In progress**. Everything else is **Not started**.

## 2. P0 — required

Several P0 features are delivered in two parts: the interface in Milestone 1 and the working function in Milestone 2. For those, the status applies to the Milestone 1 part only, and the feature as a whole is not complete until the later milestone.

| # | Feature | Requirements | Milestone | Status |
|---|---|---|---|---|
| P0-01 | Premium marketing landing page | LND-01–LND-11 | M1 | In progress |
| P0-02 | Public interactive demo with curated documents | DEMO-01–DEMO-11 | M1 (sample-preview mode); M2 (live RAG) | In progress (M1 part only) |
| P0-03 | Responsive authenticated Knowledge Workspace | WS-01–WS-05, AUTH-02 | M1 (interface, sample preview); M2 (authenticated, live) | In progress (M1 part only) |
| P0-04 | AI chat with streaming answers | WS-06–WS-09 | M2 | Not started |
| P0-05 | Retrieval-augmented generation | WS-10–WS-13 | M2 | Not started |
| P0-06 | Functional source citations | CIT-01–CIT-06, CIT-08–CIT-10 | M1 (interaction against fixtures); M2 (validated against retrieved chunks) | In progress (M1 part only) |
| P0-07 | Document preview with page navigation for PDFs | CIT-07, LIB-03 | M2 | Not started |
| P0-08 | Document upload for authenticated users | LIB-05–LIB-07, LIB-09, LIB-10 | M2 | Not started |
| P0-09 | Document ingestion and indexing status | LIB-08, LIB-11, LIB-13, LIB-14 | M2 | Not started |
| P0-10 | Searchable document library | LIB-01–LIB-04, LIB-12 | M2 | Not started |
| P0-11 | Conversation history | CONV-01–CONV-06 | M2 | Not started |
| P0-12 | Basic authentication and authorization | AUTH-01–AUTH-06 | M2 | Not started |
| P0-13 | Hebrew and English localization | I18N-01, I18N-02, I18N-06–I18N-09 | M1 (landing, workspace); M2 (remaining screens) | In progress (M1 part only) |
| P0-14 | Full RTL/LTR layouts | I18N-03–I18N-05 | M1 (landing, workspace); M2 (remaining screens) | In progress (M1 part only) |
| P0-15 | Light and dark themes | THM-01–THM-05 | M1 (landing, workspace); M2 (remaining screens) | In progress (M1 part only) |
| P0-16 | Correct empty, loading, success and error states | All areas | M1 (landing, workspace); M2 (remaining screens) | In progress (M1 part only) |
| P0-17 | Contact / request-a-demo form | CON-01–CON-05 | M1 (form interface and client validation); M2 (server validation, persistence or delivery) | In progress (M1 part only) |
| P0-18 | Usage limits and rate limiting | LIM-01–LIM-07 | M2 | Not started |
| P0-19 | Automated tests | NFR-HON-02, quality gates | M2 (unit, integration, end-to-end); M3 (full gate run) | Not started |

## 3. P1 — after P0 is stable

Not scheduled in any milestone. Each item is considered only when every P0 item is Done.

| # | Feature | Notes | Status |
|---|---|---|---|
| P1-01 | Document collections or folders | Organize the library beyond a flat list. | Not started |
| P1-02 | Document tags and filtering | Extends library search. | Not started |
| P1-03 | Conversation export | Format to be decided when scheduled. | Not started |
| P1-04 | Source-only answer mode | Returns retrieved passages without generated text. | Not started |
| P1-05 | Admin usage overview | Built on the usage events recorded in P0-18. | Not started |
| P1-06 | Optional document comparison | Optional even within P1. | Not started |
| P1-07 | More advanced onboarding | Beyond the P0 empty states. | Not started |

## 4. P2 — out of scope for initial delivery

These are not planned, designed or stubbed. No route, menu item or call to action refers to them.

| # | Feature | Status |
|---|---|---|
| P2-01 | Full CRM | Out of scope |
| P2-02 | Billing engine | Out of scope |
| P2-03 | Complex multi-agent orchestration | Out of scope |
| P2-04 | Marketplace | Out of scope |
| P2-05 | Fine-grained document ACL matrix | Out of scope |
| P2-06 | External enterprise connectors | Out of scope |
| P2-07 | Scanned-PDF OCR | Out of scope |
| P2-08 | Custom agent builder | Out of scope |
| P2-09 | Autonomous workflows | Out of scope |

Scanned PDFs are still detected in P0 so they can be reported as unsupported (LIB-10). That detection is P0; the OCR itself is P2.

## 5. Milestone plan

The milestones group the brief's phases: Milestone 1 covers phases 0–4, Milestone 2 covers phase 5, and Milestone 3 covers phases 6–7.

### 5.1 Milestone 1 — design foundation

**Purpose:** prove the design quality on the two most important screens before building the rest.

**Constraint:** there is no backend in this milestone. No database, authentication, ingestion, retrieval or model call exists. The Knowledge Workspace therefore runs in a clearly labelled **sample preview** mode that shows pre-written fixture answers over the Northstar Business Services sample content.

| # | Deliverable | Status |
|---|---|---|
| M1-01 | Repository and environment audit | In progress |
| M1-02 | Product specification: `PRODUCT_REQUIREMENTS.md`, `USER_JOURNEYS.md`, `FEATURE_SCOPE.md`, `ACCEPTANCE_CRITERIA.md` | In progress |
| M1-03 | Visual design specification: `DESIGN_VISION.md`, `DESIGN_SYSTEM.md`, `SCREEN_BLUEPRINTS.md`, `RESPONSIVE_BEHAVIOR.md` | In progress |
| M1-04 | Technical architecture: `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `RAG_PIPELINE.md`, `SECURITY.md`, `DEPLOYMENT.md` | In progress |
| M1-05 | Design system: semantic tokens, typography, spacing, light and dark themes, core components | In progress |
| M1-06 | Landing page in Hebrew and English, both themes, including the contact form interface with client validation | In progress |
| M1-07 | Knowledge Workspace in sample preview mode: three-region layout, empty state, composer, answer rendering, citation chips, evidence region | In progress |
| M1-08 | Northstar Business Services sample content and pre-written fixture answers, with citations that point to real passages in that content | In progress |
| M1-09 | Sample preview labelling on every fixture answer, in both languages and both themes | In progress |
| M1-10 | Browser-based visual review of both screens at 390, 768 and 1440 px, with screenshots from the running application | In progress |

**Rules for sample preview mode**

1. Every fixture answer carries a visible, persistent label stating that it is a pre-written sample and not a live AI response.
2. The mode is also identified at the workspace level, not only per message.
3. Only the prepared questions produce answers. Free-text input that does not match a prepared question gets an explanation of the mode, not an improvised or approximated answer.
4. Fixture citations reference real passages in the sample documents, with correct page or section references.
5. No interface text, screenshot caption or report describes sample preview output as AI-generated, retrieved or live.
6. The contact form never reports success unless the lead was actually stored. In Milestone 1 the route handler validates input and writes to a local file store in development (`LEADS_STORE=file`); with no store configured it returns `503 not_configured` and the form shows an error. Database persistence arrives in Milestone 2.

**Exit criteria**

- The four product documents, four design documents and five architecture documents exist.
- The landing page and workspace render in a real browser in both languages and both themes.
- Screenshots at the three review widths have been captured and reviewed, and significant visual defects corrected.
- The owner accepts the visual quality before Milestone 2 starts.

**Not delivered in Milestone 1:** any live AI answer, upload, ingestion, authentication, persistence, rate limiting, or verified RAG behaviour. P0-02, P0-03 and P0-06 remain incomplete at the end of this milestone.

### 5.2 Milestone 2 — functional application

**Purpose:** make the product work end to end against real services.

| # | Deliverable | Status |
|---|---|---|
| M2-01 | Local environment: Docker Compose with PostgreSQL + pgvector, Redis, and S3-compatible storage; `.env.example` | Not started |
| M2-02 | Database schema, migrations and seed data, including tenant scoping and a 1024-dimension vector column matching the configured embedding model | Not started |
| M2-03 | Authentication, sessions, server-side authorization, organization and workspace scoping | Not started |
| M2-04 | LLM provider abstraction with an Anthropic Claude API adapter (development) and an Amazon Bedrock adapter (production); model IDs from configuration | Not started |
| M2-05 | Embedding provider interface with an Amazon Bedrock `cohere.embed-multilingual-v3` adapter | Not started |
| M2-06 | Upload flow: validation, private object storage, metadata, duplicate handling | Not started |
| M2-07 | Ingestion worker: extraction for PDF, DOCX and TXT, page/section metadata, chunking, embedding, vector persistence, status, retries, scanned-PDF detection | Not started |
| M2-08 | Retrieval and answer generation: tenant-filtered vector search in pgvector, evidence thresholds, grounded prompt, streaming, citation validation, persistence, usage recording | Not started |
| M2-09 | Document library: list, search, preview with PDF page navigation, deletion with confirmation and chunk removal | Not started |
| M2-10 | Conversation history: list, open, continue, new | Not started |
| M2-11 | Public demo on live RAG, isolated from private workspaces, with seeded Northstar documents | Not started |
| M2-12 | Usage limits, rate limiting, request size limits, spend ceiling | Not started |
| M2-13 | Contact form server validation and lead persistence or delivery | Not started |
| M2-14 | Localization, RTL/LTR, themes and state coverage on all remaining screens | Not started |
| M2-15 | Evaluation dataset over the Northstar documents, in Hebrew and English | Not started |
| M2-16 | Unit, integration and end-to-end tests; deterministic test doubles labelled as such | Not started |
| M2-17 | Audit logging, structured errors, request correlation IDs | Not started |

**Exit criteria**

- Workflows A–E in `ACCEPTANCE_CRITERIA.md` pass against the real LLM and embedding providers, not against test doubles.
- Hebrew and English retrieval has been measured with the evaluation dataset against the real embedding provider, and the results recorded.
- Sample preview mode remains available as the labelled fallback when no provider is configured.

**Dependencies that need the owner**

- Provider credentials supplied through environment variables or a secret manager, never in chat or the repository.
- Explicit approval before any paid AWS resource is provisioned or any paid model usage beyond an agreed ceiling.
- Confirmation that the chosen Bedrock models are available in the intended region and account.

### 5.3 Milestone 3 — quality, hardening and delivery

**Purpose:** verify, harden and package the product for portfolio presentation.

| # | Deliverable | Status |
|---|---|---|
| M3-01 | Full quality gate run: type check, lint, unit, integration, end-to-end, accessibility, production build | Not started |
| M3-02 | Responsive screenshot validation at 360, 390, 768, 1024, 1440 and 1920 px | Not started |
| M3-03 | Accessibility review of primary workflows against WCAG 2.2 AA patterns | Not started |
| M3-04 | Hebrew RTL review on every major screen with real Hebrew content | Not started |
| M3-05 | Basic performance review, including Core Web Vitals observations | Not started |
| M3-06 | Security review of public and demo endpoints; tenant isolation tests; prompt-injection tests | Not started |
| M3-07 | Hardening of ingestion against malformed, oversized and hostile files | Not started |
| M3-08 | AWS deployment design using managed services. Design only; nothing is provisioned without approval | Not started |
| M3-09 | Setup documentation: `README.md`, worker start-up, test, build and deployment guides; separate development, demo and production configuration | Not started |
| M3-10 | Screenshot set in `artifacts/screenshots/` taken from the running application | Not started |
| M3-11 | Portfolio deliverables: project title, Hebrew and English summaries, case-study description, stack summary, problem and solution, feature highlights, three to five real screenshots, demo script, cover image from the actual interface, list of features that genuinely work | Not started |
| M3-12 | Truthful completion report listing what was verified, how, and what was not | Not started |

**Exit criteria**

- Every item of the definition of done in `ACCEPTANCE_CRITERIA.md` is met, or is reported as unmet with its blocker.
- Portfolio material states that this is an independently developed demonstration product, and contains no invented customers, testimonials, metrics or compliance claims.

## 6. Scope control

1. A feature not listed under P0 is not built before every P0 item is Done.
2. New ideas are added to P1 or P2 here before any work starts on them.
3. A P0 feature may not be marked Done on the strength of its interface alone, or on tests that use test doubles alone.
4. If a P0 item cannot be completed, it stays open and the blocker is recorded here and in the completion report.

## 7. Open scope questions

1. **Contact form in Milestone 1.** Resolved in implementation: the form is validated on the client and the server, and stores leads through a `LeadStore` interface (file store in development, none in production until the database exists). It shows an error rather than a false success when nothing is configured. The owner should still choose the production delivery mechanism (database, email or both).
2. **Markdown upload.** The brief lists it as conditional. It is not scheduled; it is added to M2-07 only if extraction is implemented and verified.
3. **Document versions and workspace switcher.** The brief marks both "if needed" / "if applicable". Neither is scheduled. P0 assumes one workspace per organization.
4. **Limit values.** Query, token, rate and file-size limits and the spend ceiling need owner-set values before M2-12.
5. **Deletion policy.** Needs definition before M2-09.
6. **Language of the sample documents.** English only, or Hebrew editions as well; this determines the size of M2-15 and what the demo can show in Hebrew.
