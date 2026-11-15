# Acceptance criteria

Status: draft specification. These are the conditions the product must meet. None has been evaluated; no criterion is currently passing.

## 1. Conventions

- Criteria are numbered and stable. Workflow criteria use Given / When / Then. Review criteria are checklists.
- Each criterion has a verification method:
  - **E2E** — automated browser test.
  - **INT** — automated integration test against real local services (database, queue, storage).
  - **LIVE** — run against the real LLM and embedding providers. A pass with test doubles does not satisfy a LIVE criterion.
  - **REVIEW** — human review in a real browser, recorded with screenshots.
  - **CMD** — a command whose output is recorded.
- Deterministic test doubles may be used in E2E and INT tests. They must be labelled as test doubles in code and in reports.
- "Sample documents" means the four fictional Northstar Business Services documents: Customer Support Handbook, Refund and Cancellation Policy, Employee Onboarding Guide, Product and Service Catalog.
- A criterion that cannot be met is reported as unmet with its blocker. It is not reworded, skipped or suppressed.

## 2. Functional workflows

### 2.1 Workflow A — public demo

| ID | Criterion | Method |
|---|---|---|
| A-01 | Given a visitor who is not signed in, when they open the landing page and select "Try Live Demo", then the demo workspace opens without a sign-in step. | E2E |
| A-02 | Given the demo workspace, when it first loads, then it names Northstar Business Services as fictional, lists the four sample documents, and shows four example questions. | E2E |
| A-03 | Given the demo workspace with live providers configured, when the visitor sends a supported question, then an answer streams into the conversation and completes without error. | E2E, LIVE |
| A-04 | Given a completed answer to a supported question, then it contains at least one citation, and every citation corresponds to a chunk retrieved for that answer. | INT, LIVE |
| A-05 | Given an answer with citations, when the visitor selects one, then the evidence region opens with the cited document selected. | E2E |
| A-06 | Given an opened citation, then the evidence region shows the page or section recorded for that chunk and the excerpt text matches the stored chunk text. | E2E, INT |
| A-07 | Given an opened PDF source, when the visitor uses page navigation, then the preview moves to the requested page. | E2E |
| A-08 | Given an opened citation, then source content is visually and semantically distinct from generated text, and no pixel-accurate highlight is implied where none exists. | REVIEW |
| A-09 | Given each suggested question, when it is asked with live providers, then the answer is supported by the sample documents and cites them. | LIVE |
| A-10 | Given the demo, when any demo request is made, then it can read only demo data; no private document, chunk, conversation or storage object is reachable. | INT |
| A-11 | Given the demo, then no upload control is functional for an anonymous visitor, and the upload endpoints reject anonymous requests. | E2E, INT |
| A-12 | Given the demo query, token or rate limit is reached, when the visitor sends another question, then a clear limit message is shown, the request is rejected with a structured error, and no model call is made. | E2E, INT |
| A-13 | Given no live provider is configured, when the demo opens, then it is in sample preview mode or shows a configuration/error state; it never shows a fixture answer without a label. | E2E |
| A-14 | Given sample preview mode, then every fixture answer displays a persistent label stating it is a pre-written sample and not a live AI response, in Hebrew and English, in light and dark themes, and the label is exposed to assistive technology. | E2E, REVIEW |
| A-15 | Given sample preview mode, when the visitor types a question outside the prepared set, then the interface explains the mode and gives no improvised answer. | E2E |

### 2.2 Workflow B — unsupported question

| ID | Criterion | Method |
|---|---|---|
| B-01 | Given indexed sample documents, when the user asks a question they do not answer, then the response states that reliable information was not found in the available documents. | LIVE |
| B-02 | Given an insufficient-evidence response, then it contains no citation chips and no inline citation markers. | E2E, LIVE |
| B-03 | Given an insufficient-evidence response, then it contains no invented policy, fact or quotation. | LIVE (evaluation set) |
| B-04 | Given a question built on a false premise, when it is asked, then the response does not adopt the premise and cites only what the documents state. | LIVE (evaluation set) |
| B-05 | Given a partly supported question, then the supported part is cited and the unsupported part is identified as not covered. | LIVE (evaluation set) |
| B-06 | Given model output containing a citation identifier outside the retrieved set, then that identifier is removed before display and is not rendered as a link. | INT (labelled test double) |
| B-07 | Given a document containing instruction-like text, when a question retrieves it, then the assistant's behaviour and system instructions are unchanged. | LIVE |
| B-08 | Given retrieval fails because of a system fault, then the user sees an error state with retry, not an insufficient-evidence response. | INT, E2E |

### 2.3 Workflow C — authenticated upload

| ID | Criterion | Method |
|---|---|---|
| C-01 | Given a registered user, when they sign in with valid credentials, then they reach the workspace and a secure session exists. | E2E |
| C-02 | Given an unauthenticated request to any protected route or API handler, then it is rejected or redirected on the server. | INT |
| C-03 | Given a signed-in user in the library, when they upload a valid PDF, DOCX or TXT file, then progress is shown and the document appears with a processing status. | E2E |
| C-04 | Given a document that is still processing, then it is not shown as ready and is not returned by retrieval. | INT, E2E |
| C-05 | Given a processing document, when ingestion finishes, then its status changes to indexed without a manual reload, and its chunks exist with page or section references and the embedding model identifier. | E2E, INT |
| C-06 | Given an indexed uploaded document, when the user asks a question it answers, then the answer cites that document. | LIVE |
| C-07 | Given that answer, when the citation is selected, then the evidence region shows the correct page or section and excerpt from the uploaded document. | E2E, LIVE |
| C-08 | Given a file of an unsupported type, an oversized file, a file whose content does not match its extension, or a malformed file, when it is submitted, then the server rejects it with a specific, safe error. | INT |
| C-09 | Given a scanned PDF with no extractable text, when it is ingested, then its status is failed with a reason stating OCR is not supported, and it is never marked ready. | INT |
| C-10 | Given a duplicate of an existing document, when it is uploaded, then the user is informed and no second set of chunks is created. | INT |
| C-11 | Given a transient embedding or extraction failure, then the job is retried per policy; after retries are exhausted the status is failed with a recorded error. | INT (labelled test double) |
| C-12 | Given each format claimed as supported, then extraction has been verified with a real sample file of that format. | INT |
| C-13 | Given the configured embedding model, then the vector column dimension equals the model's dimension (1024 for `cohere.embed-multilingual-v3`), and a chunk with a different model identifier is not used in retrieval. | INT |

### 2.4 Workflow D — deletion

| ID | Criterion | Method |
|---|---|---|
| D-01 | Given an indexed document, when the user chooses remove, then a confirmation dialog names the document and describes the effect. | E2E |
| D-02 | Given the dialog, when the user cancels, then nothing is changed and focus returns to the triggering control. | E2E |
| D-03 | Given the dialog, when the user confirms, then the document no longer appears in the library. | E2E |
| D-04 | Given a confirmed deletion, then the stored file is removed from object storage according to the documented deletion policy. | INT |
| D-05 | Given a confirmed deletion, then all chunks and embeddings of the document are removed according to the documented deletion policy. | INT |
| D-06 | Given a deleted document, when a question that only it could answer is asked, then retrieval returns none of its chunks and the answer does not cite it. | INT, LIVE |
| D-07 | Given a deleted document, when its former preview or download URL is requested, then access is denied. | INT |
| D-08 | Given an earlier conversation citing the deleted document, when it is reopened, then the citation is shown as unavailable per the deletion policy and does not open stale content. | E2E |
| D-09 | Given a deletion, then an audit event records the actor, the document and the time. | INT |
| D-10 | Given a deletion that fails part-way, then the document is not left retrievable and the user is not told it succeeded. | INT |

### 2.5 Workflow E — tenant isolation

| ID | Criterion | Method |
|---|---|---|
| E-01 | Given organizations A and B, when a user in A uploads a document, then it does not appear in B's library list or search results. | INT |
| E-02 | Given that document's identifier, when a user in B requests its details, preview or download, then the server denies access without confirming it exists. | INT |
| E-03 | Given a question in B that the document would answer, then retrieval returns no chunk from A and the answer cites nothing from A. | INT, LIVE |
| E-04 | Given a conversation owned by a user in A, when a user in B requests it by identifier, then access is denied. | INT |
| E-05 | Given any retrieval query, then it includes a tenant filter applied in the database query, not after the fact in application code. | INT, code review |
| E-06 | Given the public demo, then it cannot retrieve from A or B, and A and B's private data cannot be reached through any demo endpoint. | INT |
| E-07 | Given an identifier tampered with in a request by an authenticated user, then authorization is still decided on the server from the session. | INT |

### 2.6 Workflow F — localization

| ID | Criterion | Method |
|---|---|---|
| F-01 | Given English is active, when the user selects Hebrew, then the root element has `lang="he"` and `dir="rtl"`; selecting English gives `lang="en"` and `dir="ltr"`. | E2E |
| F-02 | Given either language, then the landing page, demo, workspace, library, sign-in and contact form show no untranslated interface string. | E2E, REVIEW |
| F-03 | Given the translation dictionaries, then every key present in one language is present in the other. | CMD (automated check) |
| F-04 | Given Hebrew, then navigation, panels and sheets are placed for RTL, directional icons are mirrored, and brand graphics and non-directional icons are not. | REVIEW |
| F-05 | Given Hebrew, then mixed content (English filenames, email addresses, numbers, dates, code) is displayed in the correct order. | REVIEW, E2E |
| F-06 | Given either language, then dates and numbers follow the active locale and tables and forms are correctly aligned. | E2E, REVIEW |
| F-07 | Given a language choice, when the page is reloaded or another screen is opened, then the choice persists. | E2E |
| F-08 | Given a document preview, when the interface language changes, then the document's content and direction are unchanged. | E2E |
| F-09 | Given a Hebrew question with live providers, then the answer renders with correct direction and its citations work. | LIVE |
| F-10 | Given the evaluation dataset, then Hebrew and English retrieval results have been measured against the real embedding provider and recorded before any quality claim is made. | LIVE |
| F-11 | Given the source code, then layout uses CSS logical properties and RTL is not implemented as per-component directional overrides. | Code review |
| F-12 | Given a language switch during an open conversation, then the conversation, the draft text and the open evidence region are preserved. | E2E |

### 2.7 Workflow G — responsive interface

Viewport widths under test: 360, 390, 768, 1024, 1440 and 1920 px.

| ID | Criterion | Method |
|---|---|---|
| G-01 | At every test width, on the landing page, workspace and library, there is no horizontal page overflow in either language. | E2E |
| G-02 | At 360 and 390 px, the mobile menu opens, stays inside the viewport, and every item is reachable. | E2E |
| G-03 | At 360 and 390 px, the conversation is the primary view and sources open in a sheet or dedicated view. | E2E, REVIEW |
| G-04 | On a touch device with the virtual keyboard open, the composer remains visible and usable. | REVIEW (real device or emulation, stated which) |
| G-05 | At 768 and 1024 px, a two-panel layout is used where it fits and moving between conversation and sources works. | E2E, REVIEW |
| G-06 | At 1440 and 1920 px, the three regions are used, text line lengths remain readable, and the evidence region takes no permanent width when no source is selected. | REVIEW |
| G-07 | At every test width, dialogs, menus and toasts stay inside the viewport and their actions are reachable. | E2E |
| G-08 | At 360 and 390 px, upload works through the file picker and all upload states are displayed. | E2E |
| G-09 | Interactive targets meet the WCAG 2.2 minimum target size. | E2E (automated check), REVIEW |
| G-10 | Long filenames, long URLs and wide tables are contained without breaking layout. | E2E |
| G-11 | With `prefers-reduced-motion` set, transitions are reduced or removed and no content becomes unreachable. | E2E |

## 3. Frontend acceptance

Verified by human review in a real browser, with screenshots from the running application at 390, 768 and 1440 px, in both languages and both themes. A statement that a visual check was done is valid only if the browser was actually used.

| ID | Criterion |
|---|---|
| FE-01 | The landing page has a recognizable visual identity consistent with the design vision; it does not read as a default component-library or template layout. |
| FE-02 | The hero communicates the product value without scrolling at the review widths. |
| FE-03 | The product preview shows a question, a structured answer, clickable citations and a document preview, and is labelled as a sample. |
| FE-04 | Typography follows the defined scale and font choices for Hebrew, English and technical labels. |
| FE-05 | The workspace offers more than a message list and input: navigation, conversation and evidence regions are all present and purposeful. |
| FE-06 | Evidence and citations are part of the layout, not an afterthought or a modal-only feature. |
| FE-07 | Cards, buttons, inputs and modals draw from one component system; no screen uses a one-off variant of an existing component. |
| FE-08 | RTL layouts read as native Hebrew layouts, not mirrored English ones with defects. |
| FE-09 | Dark mode is separately designed: surfaces, borders, shadows and accent use are tuned for dark, not inverted. |
| FE-10 | The mobile layout is comfortable and all primary workflows can be completed on it. |
| FE-11 | No obvious visual defect remains in the reviewed screenshots (misalignment, clipping, overlap, unintended wrapping). |
| FE-12 | No broken icon, missing image or missing font. |
| FE-13 | No placeholder route: every reachable route has real content and correct states. |
| FE-14 | No dead call to action: every button and link does what it says or is honestly disabled with an explanation. |
| FE-15 | No lorem ipsum or filler text anywhere. |
| FE-16 | No font size or spacing value outside the design system scale. |
| FE-17 | No decorative chart without a stated purpose. |
| FE-18 | No dashboard KPI cards in the default workspace view. |
| FE-19 | No fabricated customer logo, testimonial, metric, certification or compliance claim. |
| FE-20 | Text and essential interface components meet WCAG 2.2 AA contrast in both themes. |
| FE-21 | Every interactive element has a visible focus state and is reachable by keyboard in a logical order in both directions. |
| FE-22 | Empty, loading, success and error states exist and are designed for every data-driven region. |
| FE-23 | The screenshots intended for the portfolio have each been reviewed individually against FE-01 to FE-22. |

## 4. Quality gates

All gates are run before completion is reported. The command, date and result of each are recorded in the completion report.

| ID | Gate | Pass condition | Method |
|---|---|---|---|
| QG-01 | Type checking | Zero errors in TypeScript strict mode. No blanket suppression added to achieve this. | CMD |
| QG-02 | Linting | Zero errors. Any disabled rule is justified in place. | CMD |
| QG-03 | Unit tests | All pass. Skipped tests are listed with reasons. | CMD |
| QG-04 | Integration tests | All pass against real local PostgreSQL + pgvector, queue and object storage. | CMD |
| QG-05 | End-to-end browser tests | Workflows A–G pass in a real browser engine. Use of test doubles is stated per test. | CMD |
| QG-06 | Live provider verification | Workflows A, B and C and criterion F-10 have been run against the actual LLM and embedding providers. Until this is done, the RAG workflow is reported as not verified. | LIVE |
| QG-07 | Accessibility checks | Automated checks report no serious or critical violation on primary workflows; a manual keyboard and screen-reader pass of the primary workflows is recorded. | CMD, REVIEW |
| QG-08 | Production build | Completes without error. | CMD |
| QG-09 | Responsive screenshot validation | Screenshots at all six test widths are captured from the running application and reviewed. | REVIEW |
| QG-10 | Basic performance review | Core Web Vitals and a performance trace are observed for the landing page and workspace; findings and actions are recorded. No figure is published that was not measured. | REVIEW |
| QG-11 | Security review of public and demo endpoints | Rate limits, request size limits, input validation, isolation and error messages are checked for every unauthenticated endpoint. | REVIEW, INT |
| QG-12 | Browser console | No uncaught error and no failed request on primary workflows. Errors are fixed, not silenced. | E2E |
| QG-13 | Secrets | No secret in the repository, its history, or any client bundle. `.env.example` holds placeholders only. | CMD, REVIEW |
| QG-14 | Model output safety | Model-generated HTML is never rendered unsanitized; a test with hostile markup in model output passes. | INT (labelled test double) |
| QG-15 | Evaluation run | The evaluation dataset has been run with the real providers; grounding and citation accuracy are reported as measured. | LIVE |
| QG-16 | Test integrity | No test was deleted, skipped or weakened, and no error suppressed, solely to turn a gate green. | Code review |

## 5. Definition of done

The project is not declared complete until each item below is met. An item that cannot be met is reported honestly with its blocker.

| ID | Condition | Evidence |
|---|---|---|
| DOD-01 | The product has a coherent, distinctive visual identity. | FE-01, FE-04, FE-07, FE-09 |
| DOD-02 | The landing page is polished and responsive. | FE-01–FE-03, G-01, G-02, QG-09 |
| DOD-03 | The Knowledge Workspace looks and works professionally. | FE-05, FE-06, Workflow A, Workflow G |
| DOD-04 | The document library is functional. | C-03, D-01–D-03, library search and preview tests |
| DOD-05 | Document ingestion works end to end. | C-03–C-05, C-08–C-13 |
| DOD-06 | Real RAG questions return grounded answers. | A-03, A-04, A-09, B-01–B-05, QG-06, QG-15 |
| DOD-07 | Citation navigation works with actual sources. | A-05–A-08, C-07 |
| DOD-08 | Hebrew RTL works throughout the main application. | F-01–F-06, F-09, FE-08 |
| DOD-09 | English LTR works throughout the main application. | F-01, F-02, F-06 |
| DOD-10 | The public demo is usable and properly isolated. | A-01–A-03, A-10, A-11, E-06 |
| DOD-11 | Sensitive documents are protected. | Workflow E, D-07, C-02, QG-11, QG-13 |
| DOD-12 | Rate limits and cost controls are enforced. | A-12, QG-11, server-side limit tests |
| DOD-13 | Automated tests pass, or failures are transparently reported. | QG-01–QG-05, QG-16 |
| DOD-14 | Real browser screenshots have been reviewed. | QG-09, FE-23 |
| DOD-15 | Setup documentation is complete: `README.md`, `.env.example`, migrations, seed data, Docker Compose, worker start-up, test, build and deployment guide. | A clean-checkout setup following only the documentation succeeds. |
| DOD-16 | The project is suitable for a professional portfolio presentation. | Portfolio deliverables exist; they identify the work as an independent HilaTech demonstration product and list only features that genuinely work. |

### 5.1 Conditions that override "done"

- **DOD-X1** A static or fixture-driven interface is not accepted in place of a working application. Sample preview mode does not satisfy DOD-05, DOD-06 or DOD-07.
- **DOD-X2** A working but visually generic application is not accepted in place of the required design quality.
- **DOD-X3** DOD-06 cannot be met by tests that use test doubles alone.
- **DOD-X4** No paid AWS resource was provisioned without explicit owner approval.
- **DOD-X5** No simulated answer is presented as a live AI response anywhere in the product, the screenshots or the portfolio material.

## 6. Milestone 1 acceptance subset

Milestone 1 has no backend, so only the following criteria can be evaluated at its end. All others remain open.

- Workflow A: A-01, A-02, A-05, A-08, A-13, A-14, A-15 (against fixtures, with the sample preview label visible).
- Workflow F: F-01–F-08, F-11, F-12, for the landing page and workspace only.
- Workflow G: G-01–G-03, G-05–G-07, G-09–G-11, for the landing page and workspace only.
- Frontend acceptance: FE-01–FE-23, for the landing page and workspace only.
- Quality gates: QG-01, QG-02, QG-08, QG-12, QG-13, and QG-09 at 390, 768 and 1440 px.

Passing this subset does not complete any item of the definition of done that depends on a backend or on live AI.

## 7. Open items affecting these criteria

1. D-04, D-05 and D-08 depend on a deletion policy that is not yet defined.
2. A-12 and DOD-12 need owner-set limit values to become fully testable.
3. F-09 and F-10 depend on the language of the sample documents (English only, or Hebrew editions as well).
4. QG-06 and QG-15 need provider credentials and an approved spend ceiling.
5. C-01 depends on the chosen sign-in method.
