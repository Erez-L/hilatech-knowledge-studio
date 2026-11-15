# Product requirements

Status: draft specification. Nothing in this document is implemented or tested yet. Delivery status is tracked in `FEATURE_SCOPE.md`; pass conditions are in `ACCEPTANCE_CRITERIA.md`.

## 1. Product definition

**Name:** HilaTech Knowledge Studio

**Category:** AI knowledge management; a knowledge assistant built on retrieval-augmented generation (RAG).

**Positioning statement:** "Your knowledge. Instant answers. Verified sources."

**Value proposition:** Turn business documents into a searchable, conversational knowledge workspace that gives useful answers with traceable evidence.

**What it is:** A web application in which a team uploads internal documents, the system extracts and indexes them, and people ask questions in natural language. Each answer is grounded in retrieved passages and carries citations that open the underlying source at the right page or section.

**Provenance:** This is an independently developed demonstration product by HilaTech. It is not a paid client project. It is HilaTech's second portfolio project and exists to show product thinking, visual craft, frontend engineering, practical AI integration and end-to-end execution. The product and its marketing must not contain invented customers, customer logos, testimonials, usage metrics, business outcomes, certifications or compliance claims.

## 2. Audiences

Primary audiences for the product:

- Customer support teams
- Business service companies
- HR departments
- Internal operations teams
- Software and technology companies
- Training organizations
- Professional offices

Secondary audience for the public demo: prospective HilaTech clients who arrive from a portfolio listing (for example XPlace) and judge whether HilaTech can build an AI product for them.

## 3. Customer problem

Employees spend too much time searching documents and repeatedly asking colleagues for information. Critical knowledge is spread across files and is hard to access consistently.

The product must make its answer to this problem obvious on first contact. Messaging leads with the outcome (reliable answers from company knowledge), not with technical terms such as vector databases, embeddings or LLM orchestration.

## 4. Goals and non-goals

### Goals

1. A user can upload documents, see them processed, and ask questions that are answered from those documents.
2. Every answer is either grounded in retrieved evidence with valid citations, or states plainly that the documents do not support an answer.
3. A citation always leads to a real retrieved chunk, the correct document, and the correct page or section.
4. A visitor can try a public demo without signing in, against clearly fictional sample documents, with no access to private data.
5. The product works in Hebrew (RTL) and English (LTR) across the landing page and the workspace.
6. The landing page and Knowledge Workspace have a distinctive, consistent visual identity (see the design documents).
7. The product is honest about what is live AI output and what is a simulated or sample response.

### Non-goals (initial delivery)

- Full CRM, billing engine, marketplace.
- Complex multi-agent orchestration, custom agent builder, autonomous workflows.
- Fine-grained per-document ACL matrix.
- External enterprise connectors.
- OCR for scanned PDFs.
- Arbitrary file uploads by anonymous public-demo visitors.
- Any dependency on, or modification of, the existing HilaTech SaaS repository.

## 5. Decisions already made

| Area | Decision |
|---|---|
| LLM | Accessed through a provider abstraction. Anthropic Claude API in development; Amazon Bedrock in production. Model IDs are configuration and are not hardcoded across the application. |
| Embeddings | Amazon Bedrock `cohere.embed-multilingual-v3` (1024 dimensions) behind a provider interface. Hebrew and English retrieval quality must be validated against the real provider before any quality claim is made. |
| Vector store | PostgreSQL with pgvector only. No Pinecone or other paid vector database. |
| Test doubles | Deterministic test doubles are allowed in automated tests and must always be labelled as such. |
| Simulated answers | Never presented as live AI responses. The RAG workflow is not "complete" until verified against the actual providers. |
| Secrets | No API keys in chat or in the repository. Environment variables, secret management, and a `.env.example` with placeholder values only. |
| Cloud spend | No paid AWS resources are provisioned without explicit owner approval. |
| Demo data | Fictional company "Northstar Business Services" with four sample documents: Customer Support Handbook, Refund and Cancellation Policy, Employee Onboarding Guide, Product and Service Catalog. |

## 6. Functional requirements

Requirement IDs are stable and are referenced from the other specification documents.

### 6.1 Landing page (LND)

- **LND-01** Header with product branding, links to Product, How it works, Use cases, Live demo and Contact, a language selector, a theme selector, and a primary call to action "Try Live Demo".
- **LND-02** Mobile navigation is a purpose-designed menu, not a shrunken desktop bar. It stays within the viewport and is keyboard and screen-reader operable.
- **LND-03** Hero section with the headline "Your knowledge, finally within reach.", the supporting line "Turn documents into intelligent answers — backed by the sources your team can trust.", and two calls to action: "Try Live Demo" and "Explore the Product".
- **LND-04** The hero visual is built from real interface elements and shows a question becoming an answer connected to specific documents. No stock robot imagery.
- **LND-05** Interactive product preview showing a fictional company knowledge library, a sample question, a structured sample answer, clickable source citations, a document preview, and a clear path into the live demo. The preview content is labelled as a sample.
- **LND-06** "How it works" section with three visually distinct steps: add your documents; ask meaningful questions; verify every answer.
- **LND-07** Use-case section covering customer support, HR and onboarding, internal operations, and technical documentation, using original illustrations or purposeful UI examples.
- **LND-08** Trust section explaining how the product handles private documents, source-based answers, access controls, and uncertain or unsupported questions. It states only behaviour the product actually has.
- **LND-09** Conversion section with the prompt "Ready to make your business knowledge searchable?" and the contact form (section 6.11).
- **LND-10** Footer with branding, navigation, privacy and terms links where those pages exist, and a contact path.
- **LND-11** No customer logos, testimonials, or production metrics presented as real. No lorem ipsum. No call to action that leads nowhere.

### 6.2 Public demo (DEMO)

- **DEMO-01** The demo is reachable from the landing page without signing in.
- **DEMO-02** The demo uses only the four Northstar Business Services sample documents. The company and documents are identified as fictional in the interface.
- **DEMO-03** The sample documents are internally consistent so that questions can be checked against them.
- **DEMO-04** The demo offers suggested questions, each of which has a real answer in the seeded documents.
- **DEMO-05** Demo data is isolated from private workspaces. No demo request can read private user documents, chunks, conversations or storage objects.
- **DEMO-06** Anonymous visitors cannot upload files.
- **DEMO-07** The demo enforces query limits, token limits, rate limiting, and abuse protections, and keeps model spend within a configured ceiling (section 6.10).
- **DEMO-08** When a limit is reached, the interface says so plainly and tells the visitor what they can do next (wait, or contact HilaTech).
- **DEMO-09** If no live AI provider is configured, the demo does not show fabricated answers as if they were live. It shows either a clearly labelled sample-preview mode or a useful configuration/error state.
- **DEMO-10** In sample-preview mode, every pre-written answer carries a persistent, visible label stating that it is a pre-written sample and not a live AI response. The label is present in both languages and both themes and is exposed to assistive technology.
- **DEMO-11** The demo does not expose infrastructure details (hostnames, bucket names, model account identifiers, stack traces).

### 6.3 Knowledge Workspace and chat (WS)

- **WS-01** Desktop layout has three regions: navigation, conversation, and evidence. The default view is the conversation, not a dashboard of KPI cards.
- **WS-02** Navigation region contains: brand, new chat, conversation history, knowledge library, settings, user menu, and a workspace switcher if more than one workspace applies.
- **WS-03** Conversation region contains: a contextual welcome or conversation title, user and AI messages, structured answer formatting, citation chips, suggested follow-up questions, and the chat composer.
- **WS-04** The initial empty state shows a welcoming headline, a short explanation, four realistic example questions, indicators of which documents are available, and the chat input.
- **WS-05** The composer has an auto-resizing textarea, a visible focus state, a send button, disabled and pending states, Enter to send, Shift+Enter for a new line, visible remaining usage where limits apply, and error recovery that preserves the typed text.
- **WS-06** Answers stream to the screen as they are generated when the provider supports streaming. Streaming status is visible and announced accessibly.
- **WS-07** The user can stop a response in progress, retry a failed or stopped response, and copy an answer.
- **WS-08** Answer rendering supports paragraphs, headings, lists, tables, inline citation markers, and code formatting, and handles mixed Hebrew and English text correctly.
- **WS-09** Model output is rendered safely. Model-generated HTML is never rendered unsanitized.
- **WS-10** When the documents do not support an answer, the response says so clearly and helpfully (for example, "I couldn't find reliable information about that in the available documents.") and carries no citations. The product does not invent policies, facts, quotations or citations.
- **WS-11** Answer generation follows the RAG sequence: validate user and workspace; check query limits; embed the query; retrieve chunks with tenant filters; rank and select evidence; apply relevance and evidence thresholds; build a grounded model request; stream the response; validate source references; persist the conversation and citations; record usage.
- **WS-12** Retrieved document text is treated as untrusted content, not as instructions. Document text cannot override the system instructions.
- **WS-13** The generation prompt instructs the model to use supplied evidence, avoid invented citations, explain insufficient information, preserve uncertainty, and never claim to have read unavailable documents.

### 6.4 Citations and evidence (CIT)

- **CIT-01** Every citation shown to a user references a chunk that was actually retrieved for that answer.
- **CIT-02** Citation identifiers produced by the model are validated against the retrieved chunk set before display. An identifier that does not match is discarded; it never becomes a link.
- **CIT-03** Selecting a citation opens the evidence region, selects the correct document, navigates to the correct page or section, and shows the relevant excerpt.
- **CIT-04** The evidence region lists retrieved sources with document name, page number or section, and the relevant excerpt, and has expand and collapse controls.
- **CIT-05** Source content is visually and semantically distinguished from generated interpretation.
- **CIT-06** Page numbers and section references come from extraction metadata. None are invented. Formats without pages (for example DOCX, TXT) use section references.
- **CIT-07** PDF preview supports page navigation.
- **CIT-08** If exact in-document text highlighting is not available, the product shows the correct page and the extracted evidence passage and does not imply pixel-accurate highlighting.
- **CIT-09** The evidence region does not permanently occupy screen width when no source is selected.
- **CIT-10** Citations are persisted with a relationship to the chunk they reference, so they remain valid when a conversation is reopened. Behaviour when the cited document has since been deleted is defined in LIB-12.

### 6.5 Document library and upload (LIB)

- **LIB-01** The library lists the workspace's documents with file type indicator, upload date, processing status and file size. Grid and list views are offered where both are useful.
- **LIB-02** Search by filename and metadata.
- **LIB-03** Document preview from the library.
- **LIB-04** Empty, loading and error states are designed and correct.
- **LIB-05** Upload is available to authenticated users only, through a drag-and-drop area that also works by keyboard and file picker.
- **LIB-06** Supported formats in the initial delivery: PDF, DOCX, TXT. Markdown is supported only if extraction is implemented and verified. No format is advertised as supported until extraction has been verified with real sample files.
- **LIB-07** The upload area shows: drag-over state, file validation result, maximum size, upload progress, upload success, processing, indexing complete, and processing failure with a reason the user can act on.
- **LIB-08** A document is shown as ready only after text extraction and indexing have both completed. Until then it cannot be presented as queryable.
- **LIB-09** Server-side validation rejects oversized files, unexpected MIME types, malformed files, unsafe file paths and duplicate uploads, and guards against resource exhaustion.
- **LIB-10** Scanned PDFs that would need OCR are detected and reported as unsupported.
- **LIB-11** Ingestion runs as a background job: secure upload to private storage; metadata creation; content extraction; page/section metadata extraction; text normalization; chunking with configurable size and overlap that respects document structure where possible; embedding; vector persistence; status update; retry and failure handling.
- **LIB-12** Removing a document requires confirmation. Deletion removes the stored file and its indexed chunks according to a documented deletion policy, and the document is excluded from all subsequent retrieval. The policy also states what existing conversations show for citations that pointed to the deleted document.
- **LIB-13** Each chunk records document ID, organization/workspace ID, chunk ID, chunk index, page or section reference, text, embedding model identifier, embedding, and creation timestamp.
- **LIB-14** Embeddings of different models or dimensions are never mixed in one retrieval index. Changing the embedding model requires a controlled reindex.

### 6.6 Conversations (CONV)

- **CONV-01** Conversations, messages and citations are persisted for authenticated users.
- **CONV-02** The navigation region lists previous conversations. Selecting one restores its messages and working citations.
- **CONV-03** A user can continue a previous conversation with a new question.
- **CONV-04** A user can start a new conversation at any time.
- **CONV-05** A conversation is visible only to its owner within the owning workspace.
- **CONV-06** Empty, loading and error states for the conversation list and for a single conversation.

### 6.7 Authentication and authorization (AUTH)

- **AUTH-01** Users sign in and sign out through a maintained authentication solution with secure sessions.
- **AUTH-02** Protected routes and API handlers enforce authorization on the server. Client-side checks are not relied on.
- **AUTH-03** All data access is scoped to the user's organization and workspace. Cross-tenant retrieval, listing, preview and download are prevented.
- **AUTH-04** Document files are held in private object storage. Previews and downloads use short-lived authorized URLs or an authorizing server route.
- **AUTH-05** Sensitive actions (sign-in, upload, deletion, access failures) are written to an audit log.
- **AUTH-06** Unauthenticated visitors who open a protected route are sent to sign-in and returned to their destination afterwards.

### 6.8 Internationalization (I18N)

- **I18N-01** Hebrew (`he`) and English (`en`) are supported on the landing page and in the workspace.
- **I18N-02** Translation dictionaries are complete for both languages. No user-facing string is hardcoded in a component.
- **I18N-03** The document carries the correct `lang` and `dir` attributes for the active language.
- **I18N-04** Layout uses CSS logical properties so that RTL is not a set of one-off overrides.
- **I18N-05** Directional navigation and directional icons mirror in RTL. Brand graphics and icons whose meaning does not depend on direction do not mirror.
- **I18N-06** Mixed-direction content (filenames, dates, email addresses, numbers, code, English terms inside Hebrew text) displays correctly.
- **I18N-07** Dates and numbers are localized. Tables and forms align correctly in both directions.
- **I18N-08** The language switcher is available on every major screen and the choice persists across navigation and return visits.
- **I18N-09** Switching the interface language does not alter stored document content or previously generated answers.

### 6.9 Themes (THM)

- **THM-01** Light and dark themes are available on the landing page and in the workspace.
- **THM-02** Dark mode is designed independently, not produced by inverting the light palette.
- **THM-03** The theme choice persists, and the first paint uses the chosen theme without a flash of the other one.
- **THM-04** Both themes meet the contrast requirements in section 7.1.
- **THM-05** Theme transitions are smooth and respect `prefers-reduced-motion`.

### 6.10 Usage limits and rate limiting (LIM)

- **LIM-01** Query and token limits apply to the public demo and to authenticated workspaces. The values are configuration, not constants in code.
- **LIM-02** Rate limiting applies to chat, upload, authentication and contact-form endpoints.
- **LIM-03** Limits are enforced on the server. The client display is informational only.
- **LIM-04** Remaining allowance is visible near the composer where a limit applies.
- **LIM-05** Reaching a limit produces a clear, honest message and a structured error with an appropriate HTTP status. It does not fail silently or degrade to a fabricated answer.
- **LIM-06** Usage events are recorded per request so that spend can be reviewed and capped.
- **LIM-07** Request size limits apply to all endpoints that accept a body.

### 6.11 Contact form (CON)

- **CON-01** A contact / request-a-demo form is available in the landing page conversion section.
- **CON-02** Inputs are validated on the client and again on the server.
- **CON-03** A valid submission is persisted or delivered through a configured mechanism. Success is reported to the visitor only after that has happened.
- **CON-04** Success and error states are designed, localized and announced accessibly. A failed submission keeps the visitor's input.
- **CON-05** The endpoint is rate limited and protected against automated abuse.

## 7. Non-functional requirements

### 7.1 Accessibility

- **NFR-A11Y-01** Primary user workflows target WCAG 2.2 Level AA patterns.
- **NFR-A11Y-02** All functionality is operable by keyboard, with a visible focus indicator and a logical focus order in both LTR and RTL.
- **NFR-A11Y-03** Text and essential interface components meet AA contrast in both themes. Signal Lime is used as an accent only where the resulting contrast passes.
- **NFR-A11Y-04** Dialogs, sheets and menus trap and restore focus correctly and have accessible names.
- **NFR-A11Y-05** Streaming answers, upload progress, toasts and errors are announced through appropriate live regions without flooding screen readers.
- **NFR-A11Y-06** Touch targets meet the WCAG 2.2 target-size minimum.
- **NFR-A11Y-07** Motion respects `prefers-reduced-motion`. There is no perpetual distracting animation.
- **NFR-A11Y-08** Automated accessibility checks run in the test suite. Automated checks do not by themselves establish conformance, and no conformance claim is made on that basis.

### 7.2 Performance

- **NFR-PERF-01** Aim for good real-world performance and Core Web Vitals. No performance figure is published unless it has been measured.
- **NFR-PERF-02** Visual effects must not noticeably degrade mobile performance.
- **NFR-PERF-03** Fonts, images and scripts are loaded deliberately; unnecessary resources are not loaded.
- **NFR-PERF-04** No horizontal overflow at 360, 390, 768, 1024, 1440 or 1920 px widths.
- **NFR-PERF-05** Ingestion runs in a background worker and does not block web requests.

### 7.3 Security and privacy

- **NFR-SEC-01** Tenant isolation is enforced in every query, including vector retrieval.
- **NFR-SEC-02** No secrets in the repository, in chat, or in client bundles. Configuration comes from environment variables and a secret manager. `.env.example` contains placeholders only.
- **NFR-SEC-03** No AWS credentials in frontend code. No public bucket for private documents.
- **NFR-SEC-04** All input is validated at runtime with typed request and response contracts. Errors are stable and structured, and do not leak internals.
- **NFR-SEC-05** Logs carry request correlation IDs and omit sensitive document text unless strictly needed.
- **NFR-SEC-06** Protection against common web vulnerabilities, including injection, cross-site scripting, cross-site request forgery, and path traversal.
- **NFR-SEC-07** Prompt-injection resistance as described in WS-12 and CIT-02.
- **NFR-SEC-08** No paid cloud resource is provisioned without explicit approval. Development, demo and production configuration are separate.

### 7.4 Honesty about simulated and live AI

- **NFR-HON-01** A pre-written, fixture or simulated answer is never presented as a live AI response, anywhere in the product or its marketing.
- **NFR-HON-02** Deterministic test doubles are allowed in automated tests only, and are labelled as test doubles in code and in test reports.
- **NFR-HON-03** The RAG workflow is not described as complete, working or verified until it has been run against the actual LLM and embedding providers.
- **NFR-HON-04** Hebrew and English retrieval quality is not claimed until measured against the real embedding provider with the evaluation dataset.
- **NFR-HON-05** A file format is not described as supported until extraction is verified with real files.
- **NFR-HON-06** Screenshots used in documentation and the portfolio come from the running application, not from mockups. A screenshot of sample-preview mode shows its label.
- **NFR-HON-07** Completion reports state what was verified, how, and what was not. Unmet criteria are reported with their blocker.

### 7.5 Maintainability and operability

- **NFR-OPS-01** TypeScript in strict mode. Modular codebase without unnecessary microservices.
- **NFR-OPS-02** Reproducible local environment (Docker Compose), database migrations, seed data, and documented commands for run, test and build.
- **NFR-OPS-03** The application is deployable independently of the existing HilaTech SaaS platform.
- **NFR-OPS-04** LLM and embedding providers are replaceable through their interfaces without changes to calling code.

## 8. Evaluation of answer quality

An evaluation dataset over the Northstar documents is required. It contains simple factual questions, multi-section questions, comparison questions, Hebrew questions, English questions, questions that cannot be answered from the documents, and questions built on misleading assumptions. Answer grounding and citation accuracy are measured against it using the real providers. Results are reported as measured; no target figure is asserted in advance.

## 9. Assumptions and open questions

1. Numeric values for query, token, rate and file-size limits are not given in the brief. They are treated as configuration to be set by the owner.
2. The deletion policy (immediate hard delete or delayed purge, and what old citations show) is referenced by the brief but not defined.
3. The sign-in method and whether registration is open or invitation-only are not specified.
4. The contact-form delivery mechanism (database, email, or both) is not specified.
5. The language of the Northstar documents is not specified. Whether Hebrew questions are answered from English documents (cross-lingual retrieval) or from Hebrew editions affects demo design and evaluation.
6. Whether an answer follows the language of the question or the interface language is not specified.
7. Whether anonymous demo conversations are retained, and for how long, is not specified.
8. Privacy and terms pages are required only "where applicable"; their content needs owner input.
