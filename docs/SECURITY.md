# Security

Status: **design**. This document describes intended controls. None of them is claimed to be implemented or tested, and no control here has been reviewed by a third party. The product holds no security or privacy certification, and nothing in this document or in the product's interface should be read as a compliance claim.

Related documents: `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `RAG_PIPELINE.md`, `DEPLOYMENT.md`.

## 1. Scope and assets

| Asset | Why it matters |
|---|---|
| Tenant documents (files, extracted text, embeddings) | Private business knowledge; the main confidentiality asset |
| Conversations and answers | Contain questions about, and paraphrases of, private documents |
| Credentials: session secret, database and Redis credentials, object-storage credentials, Anthropic API key, AWS role | Compromise gives access to data or to paid services |
| Model spend | The public demo lets anonymous visitors trigger paid inference |
| Integrity of answers and citations | The product's value is that citations can be trusted |
| Contact leads | Personal data of prospects |
| Availability of the demo | Portfolio visibility |

## 2. Actors and trust boundaries

| Actor | Trust | Notes |
|---|---|---|
| Anonymous visitor | Untrusted | Landing page, public demo, contact form |
| Authenticated member | Trusted only within their organization and role | May be malicious toward other tenants |
| Uploaded document | Untrusted content | May be malformed, oversized, or written to manipulate the model |
| Model output | Untrusted content | May contain invented citations, HTML, links |
| Model and embedding providers | Trusted processors | Receive question text and document chunks |
| Operator (owner) | Trusted | Holds deployment credentials |

Trust boundaries: browser ↔ web application; web application ↔ PostgreSQL, Redis, object storage; worker ↔ uploaded file bytes; application ↔ model provider; tenant ↔ tenant; demo organization ↔ every other organization.

## 3. Threat model summary

| # | Threat | Main controls | Section |
|---|---|---|---|
| T1 | Unauthenticated access to protected pages or API | Server-side session check in every handler; proxy redirect is a convenience only | 4 |
| T2 | Member of organization A reads or retrieves organization B's data (IDOR, missing filter, vector search leak) | Tenant context from the session; tenant filter in every query; composite foreign keys; row-level security; 404 for foreign IDs | 4 |
| T3 | Demo visitor reaches private data or modifies demo content | Demo is an ordinary isolated tenant; read-only policies; no uploads | 4, 9 |
| T4 | Malicious upload: wrong type, oversized, malformed, decompression bomb, path traversal in names | Allow-list, size limits, magic bytes, ZIP pre-scan, worker resource limits, server-generated keys | 5 |
| T5 | Prompt injection from document text | Documents as data; no tools; escaping; server-side citation validation; safe rendering | 6 |
| T6 | Invented or forged citations become trusted links | Labels validated against the retrieved set; links built only from server data | 6 |
| T7 | XSS through model output, filenames or document text | Safe Markdown rendering, React escaping, CSP with nonces | 6, 11 |
| T8 | Leaked or guessed download URL | Private bucket; short-lived presigned URLs issued after authorization; no URLs in logs | 7 |
| T9 | Secret exposure (repository, client bundle, logs, error messages) | Environment and secret manager only; `server-only`; redaction; safe errors | 8 |
| T10 | Sensitive text in logs | Logging rules; IDs and counts only | 8 |
| T11 | Abuse of the public demo: cost exhaustion, scraping, automated traffic | Layered rate limits, global daily budget circuit breaker, output caps, optional bot challenge | 9 |
| T12 | Credential stuffing and brute force on sign-in | Rate limits per IP and per account, Argon2id, uniform error messages | 4, 9 |
| T13 | CSRF on state-changing endpoints | `SameSite=Lax` cookies, Origin check, JSON-only bodies | 11 |
| T14 | SQL injection, SSRF, open redirect | Parameterized queries, no server-side URL fetching, validated redirect targets | 11 |
| T15 | Vulnerable or malicious dependency | Lockfile, audit in CI, minimal dependencies, restricted install scripts | 12 |
| T16 | Deleted document remains retrievable | Deletion order removes vectors first; verified by test | `DATABASE_SCHEMA.md` 6 |
| T17 | Simulated output presented as live AI | `pipelineMode` derived from provider kind; start-up rejection of doubles in production | `ARCHITECTURE.md` 7.2 |

## 4. Authentication, authorization and tenant isolation

### 4.1 Authentication

- Auth.js (`next-auth` v5) behind `apps/web/src/server/auth`. Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix in deployed environments. `AUTH_SECRET` is at least 32 random bytes and differs per environment.
- Passwords: Argon2id with parameters chosen to take roughly 100–250 ms on the deployment hardware; minimum length 10; no composition rules; rejection of the most common passwords from a bundled list. Hashes never leave the server and are never logged.
- Sign-in and registration responses do not reveal whether an email address exists. Failed sign-ins are rate limited per IP hash and per account identifier (section 9) and written to the audit log.
- Sessions are JWT-based (see `ARCHITECTURE.md` section 12). A stolen cookie is valid until expiry; the mitigations are a short lifetime, `HttpOnly`, and re-reading membership and `users.disabled_at` on every request so that a disabled user or removed membership loses access immediately. Full server-side session revocation would require database sessions and is recorded as a possible later change.
- Auth.js v5 is distributed under the `beta` tag and the project is in maintenance mode under the Better Auth team (https://better-auth.com/blog/authjs-joins-better-auth, read 2026-11-15). The version is pinned exactly and security advisories for `next-auth` are watched.

### 4.2 Authorization

- Authorization is performed on the server, in every route handler, server component that reads tenant data, and Server Function. The Next.js documentation states that Proxy must not be relied on alone for this (https://nextjs.org/docs/app/api-reference/file-conventions/proxy). `proxy.ts` redirects only.
- One function, `getRequestContext()`, returns the tenant context or throws `unauthenticated`. Handlers cannot obtain a repository without it.
- Capabilities by role:

| Capability | owner | admin | member | demo session |
|---|---|---|---|---|
| Read documents, ask questions | yes | yes | yes | yes (demo organization only) |
| Upload documents | yes | yes | yes | no |
| Delete a document | yes | yes | own uploads only | no |
| Read own conversations | yes | yes | yes | own demo session only |
| Read other members' conversations | no | no | no | no |
| View organization usage | yes | yes | no | own allowance only |
| Manage members | yes | yes (not owners) | no | no |

- Requests for a resource in another organization return `404` with the generic `not_found` code, and write an `access.denied` audit event.

### 4.3 Tenant isolation

Enforced at four levels; each is designed to hold if the one above it fails.

1. **Identity.** `organizationId` and `workspaceId` come from the session and membership lookup. They are never read from the request body, query string or headers.
2. **Query.** Every repository function requires the tenant context and adds `organization_id` (and `workspace_id`) predicates, including the vector search statement. The tenant filter is inside the SQL, not applied to results afterwards. There are no ad-hoc queries in route handlers; a lint rule forbids importing the database client outside `packages/database`.
3. **Schema.** Composite foreign keys carry `organization_id` from parent to child, so a chunk, embedding, message or citation cannot reference a parent in another organization.
4. **Row-level security.** Policies on every tenant table compare `organization_id` with a transaction-local setting; a missing setting yields no rows. The application role has no `BYPASSRLS`. Details in `DATABASE_SCHEMA.md` section 7. RLS is defence in depth, not the primary control.

Other isolation points:

- Object keys are prefixed with the organization ID and generated by the server. A presigned URL is issued only after the document row has been loaded through the tenant-scoped repository.
- Redis keys for rate limits and usage include the organization or subject ID. Job payloads include `organizationId`, and the worker re-derives the tenant context from the database row, not from the payload alone.
- Model requests contain chunks from exactly one tenant, selected by the query above. There is no shared prompt cache keyed by content across tenants in this design.
- Tests: an integration suite creates two organizations and asserts that listing, detail, preview URL, chunk evidence, retrieval, deletion and conversation access all fail across the boundary — both through the API and by attempting direct repository calls with the wrong context. RLS is tested by issuing unfiltered statements as `hks_app`.

## 5. Upload validation

Uploads go directly from the browser to object storage with a presigned POST; file bytes do not pass through the web process. Validation therefore happens in three places.

| Stage | Check | Failure result |
|---|---|---|
| Initiation (web) | Authenticated, non-demo, rate limited; organization quota (`ORG_MAX_DOCUMENTS`); declared size ≤ `UPLOAD_MAX_BYTES`; extension in `{pdf, docx, txt, md}`; declared MIME type on the allow-list and consistent with the extension; filename ≤ 255 characters with no control characters or path separators | `400` with a specific code |
| Storage (policy) | Presigned POST conditions: exact key, exact `Content-Type`, `content-length-range 1..UPLOAD_MAX_BYTES`, 10-minute expiry | Storage rejects the upload |
| Completion (web) | Object exists; `HEAD` size within limits and equal to the declared size; first bytes (ranged `GET`) match the expected signature | Object deleted; document `failed` |
| Ingestion (worker) | Full signature and structure check; SHA-256; format-specific checks below; resource limits | Document `failed` or `unsupported` with a stable code |

Type detection uses magic bytes, never the client's MIME type or extension alone:

| Type | Signature and structure |
|---|---|
| PDF | Starts with `%PDF-`; parses; not encrypted |
| DOCX | Starts with `PK\x03\x04`; ZIP central directory contains `[Content_Types].xml` and `word/document.xml`; not macro-enabled |
| TXT / Markdown | No signature exists. Accepted only if no known binary signature is detected, there are no NUL bytes, and the content decodes strictly as UTF-8 or BOM-marked UTF-16 |

**Decompression bombs (DOCX).** A DOCX is a ZIP archive. Before parsing, the worker inspects the central directory and rejects archives with too many entries, an excessive declared uncompressed size, an extreme compression ratio, nested archives, or suspicious entry names (thresholds in `RAG_PIPELINE.md` section 3.2). Because declared sizes can be falsified, the worker also enforces a container memory limit and a per-job timeout, so a file that slips past the pre-scan fails the job instead of exhausting the host.

**Resource exhaustion (all formats).** Maximum pages, maximum extracted characters, maximum chunks, wall-clock timeout, bounded worker concurrency, files written to a per-job temporary directory with a size cap and removed afterwards. The worker container runs as a non-root user with a read-only root filesystem except for the temporary directory.

**Path safety.** User filenames are display metadata only. Object keys and temporary file names are built from UUIDs. Archive entry names are never used as filesystem paths; DOCX content is read from the archive in memory by the parser.

**Content handling.** The worker never executes or renders uploaded content: no PDF JavaScript, no external references fetched, no macros, no embedded objects. Markdown is parsed to a syntax tree and never converted to HTML on the server.

**Malware.** No antivirus scanning is in the first delivery. Files are stored and returned as opaque bytes with a forced content type and are parsed only by the libraries above. This is a stated gap; a scanning step can be added between completion and ingestion.

**Duplicates.** The worker's SHA-256 and a partial unique index prevent the same bytes from being indexed twice in a workspace.

## 6. Prompt injection, citations and output handling

Assumption: any uploaded document may contain text written to manipulate the model ("ignore previous instructions", fake system messages, requests to cite something, hidden text). Model-level defences reduce the success rate; they do not eliminate it. The design therefore limits what a successful injection can do.

| Control | Effect |
|---|---|
| Instructions only in the system prompt; documents inserted as delimited `<source>` data with an explicit statement that their content is not instructions | Reduces the chance the model follows embedded text |
| Escaping of `<`, `>`, `&` in chunk text, titles and section names | Document text cannot close its container or imitate prompt structure |
| Removal of invisible and bidirectional control characters during normalization | Removes one way to hide instructions from human reviewers of the evidence |
| The model has no tools, no network access and no ability to trigger actions | A successful injection can change text only |
| Retrieval is tenant-scoped before the model is called | Injected text cannot make the model reveal another tenant's data, because that data is never in the request |
| System prompt contains no secrets | Prompt disclosure reveals nothing sensitive |
| Citation labels are request-local and validated on the server | Injected text cannot produce a citation to an arbitrary document, page or URL |
| Evidence panel shows the stored chunk text, visually separated from the generated answer | Users can check an answer against its source |
| Output length cap (`LLM_MAX_OUTPUT_TOKENS`) and question length cap | Bounds cost of induced verbosity |
| `injection` category in the evaluation dataset | Measures residual risk; see `RAG_PIPELINE.md` section 12 |

Residual risk, stated plainly: a document can still cause a misleading answer within its own tenant, for example by containing false statements or by persuading the model to phrase things in a particular way. Members of a tenant are trusted to curate their own documents; the demo organization's documents are authored by HilaTech.

**Citation trust.** The rule from the brief — an arbitrary generated citation string must never become a trusted link — is implemented as: labels are checked against the set supplied in the same request before any text reaches the client; links are constructed from server-held chunk and document IDs; citations are re-validated against the database before being stored. See `RAG_PIPELINE.md` section 10.

**Rendering model output.** Assistant text is rendered as Markdown through a renderer configured to ignore raw HTML, with an element allow-list and URL scheme allow-list (`https`, `mailto`). `dangerouslySetInnerHTML` is not used for model or document content. Links in answers open with `rel="noopener noreferrer nofollow"`. Images in model output are not rendered, which removes a data-exfiltration channel through image URLs. Filenames, titles and excerpts are rendered as text through React.

## 7. Object storage and signed URLs

- Private bucket; public access blocked at bucket and account level; no ACLs; TLS-only bucket policy in AWS.
- The application's identity may `PutObject` (through presigned POST), `GetObject`, `DeleteObject` and `ListBucket` on its own bucket only. In AWS this is a task role; there are no long-lived keys in the application. Local development uses MinIO credentials from `.env`.
- Download and preview: `GET /api/v1/documents/{id}/content` authorizes, then returns a presigned GET URL valid for 300 seconds. Response header overrides force the stored content type and a sanitized `Content-Disposition` (RFC 5987 encoding for non-ASCII names).
- A presigned URL is a bearer credential for its lifetime. Mitigations: short expiry, one object per URL, never logged, never stored, `Referrer-Policy: no-referrer` on pages that use them, issuance recorded in the audit log.
- Upload URLs: one key, one content type, bounded size, 10-minute expiry. An upload that is never completed is removed by the stale-upload sweep.
- Bucket CORS allows only the application origin, `GET` and `POST`, and the headers the upload needs.
- PDF preview is rendered in the browser from the presigned URL. Uploaded files are never served from the application's own origin, so a hostile file cannot run in that origin.

## 8. Secrets and logging hygiene

**Secrets**

- Sources: environment variables in local development (`.env`, ignored by git); a secret manager in deployed environments, injected into the container at start. `.env.example` holds names and placeholders only.
- No secret in the repository, in images, in client bundles, in logs, in error responses or in chat. Variables with secrets are never prefixed `NEXT_PUBLIC_`. Modules that read them import `server-only`, so an accidental client import fails the build.
- AWS access in deployed environments uses IAM roles with temporary credentials. No AWS access keys are created for the application. The Anthropic API key is used in development only.
- Least privilege: the model role may invoke only the configured model and inference profile ARNs; the storage role only the application bucket; the database application role has no DDL and no `BYPASSRLS`.
- The configuration loader validates presence and format at start and reports the variable name only.
- Secret scanning (for example gitleaks) runs in CI and as a pre-commit hook.
- Rotation: `AUTH_SECRET`, database password and API keys can be rotated by updating the secret and restarting; rotating `AUTH_SECRET` signs all users out.

**Logging**

- Structured logs with correlation IDs. Content rules are in `ARCHITECTURE.md` section 14: no document text, questions, answers, prompts, filenames, email addresses, credentials, cookies, presigned URLs or raw IP addresses.
- Client IPs are stored only as a salted hash (`IP_HASH_SALT`), for rate limiting and abuse analysis.
- Error responses carry a stable code, a safe message and the correlation ID. Stack traces, SQL, hostnames, bucket names, account IDs and model account identifiers stay in server logs (DEMO-11).
- Provider SDK debug logging is disabled outside local development, because it can print request bodies.
- Log retention is a deployment setting (`DEPLOYMENT.md`).

## 9. Rate limiting, abuse and cost controls

All limits are enforced on the server in Redis before any provider call. Values are configuration; the numbers below are proposed defaults pending the owner's confirmation.

| Scope | Limit (proposed) | Key |
|---|---|---|
| Demo chat, per visitor | 5 questions / minute, 20 / day | Demo session ID and IP hash (both must pass) |
| Demo chat, global | `DEMO_DAILY_TOKEN_BUDGET` tokens / UTC day | Global counter — circuit breaker |
| Authenticated chat, per user | 20 questions / minute | User ID |
| Authenticated usage, per organization | `ORG_DAILY_TOKEN_BUDGET` tokens / UTC day | Organization ID |
| Upload initiation | 10 / hour per user; `ORG_MAX_DOCUMENTS` total | User ID, organization ID |
| Sign-in | 10 / 15 minutes per IP hash; 5 / 15 minutes per account identifier | IP hash, hashed email |
| Registration | 5 / hour per IP hash | IP hash |
| Contact form | 3 / hour per IP hash | IP hash |
| Read endpoints | 120 / minute per subject | Subject |

Cost controls for the public demo:

1. **Global daily budget.** When the demo's token budget for the day is spent, demo chat returns `429 demo_limit_reached` for everyone until reset, and the interface says so honestly. This is the control that bounds spend regardless of how many distinct visitors or IP addresses appear.
2. **Per-request caps.** Question length, number and size of context chunks, `LLM_MAX_OUTPUT_TOKENS`, conversation history turns. With the default settings one demo answer is bounded to a few thousand input tokens and about one thousand output tokens.
3. **Reservation before the call.** The handler reserves the estimated worst-case cost before calling the provider and corrects it afterwards, so concurrent requests cannot overshoot the budget by more than one reservation.
4. **Retrieval gate.** Questions with no supporting evidence are answered without a model call.
5. **No anonymous uploads.** Embedding spend cannot be triggered by visitors.
6. **Fail closed.** If Redis is unavailable, chat returns `503`; it does not run unmetered.
7. **Provider-side ceiling.** A monthly budget alert in the AWS account and a spend limit on the Anthropic workspace are recommended as an independent backstop (owner action).
8. **Kill switch.** `DEMO_CHAT_ENABLED=false` turns demo chat into a labelled unavailable state without a deployment.

Abuse controls:

- IP-based limits use the client address from the trusted proxy header only (`TRUSTED_PROXY_HOPS` configured per deployment); an untrusted `X-Forwarded-For` value is ignored.
- Demo session cookies are signed; creating many sessions does not bypass the IP and global limits.
- The contact form has a honeypot field, a minimum fill time, server-side validation and length limits. A bot challenge (for example Cloudflare Turnstile) is an optional addition for the contact form and demo if automated traffic appears; it is not in the first delivery.
- Demo conversations are purged after the retention window, so the demo does not accumulate visitor text.
- One concurrent chat stream per subject; a second request while one is open returns `429`.

## 10. Audit events

Stored in `audit_events` (append-only for the application role). Each event has actor, action, target, outcome, correlation ID, timestamp and IP hash. Metadata holds IDs and codes only.

| Action | When |
|---|---|
| `auth.sign_in`, `auth.sign_in_failed`, `auth.sign_out`, `auth.registered` | Authentication events |
| `membership.added`, `membership.role_changed`, `membership.removed` | Access changes |
| `document.upload_initiated`, `document.upload_completed`, `document.ingestion_failed` | Document lifecycle |
| `document.download_url_issued` | Each presigned preview or download URL |
| `document.delete_requested`, `document.deleted` | Deletion, including the object-storage outcome |
| `conversation.deleted` | Conversation removal |
| `access.denied` | Authorization failure or cross-tenant attempt |
| `limit.exceeded` | Usage budget or abuse threshold reached (sampled to avoid flooding) |
| `reindex.started`, `reindex.activated` | Operator actions on embedding indexes |

Ordinary chat questions are not audit events; they are covered by `usage_events` without content. Audit rows are readable by organization owners and admins for their own organization only. Retention is a deployment setting.

## 11. Web application controls

**Security headers** (set in `proxy.ts` and `next.config.ts`):

| Header | Value (design) |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`; `script-src 'self' 'nonce-{per-request}' 'strict-dynamic'`; `style-src 'self' 'nonce-{per-request}'` (falling back to `'unsafe-inline'` for styles only if the component and animation libraries prove to require inline style attributes — to be determined during implementation and recorded); `img-src 'self' data: blob:`; `font-src 'self'`; `connect-src 'self' {object-storage origin}`; `worker-src 'self' blob:`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` in deployed environments |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin`; `no-referrer` on workspace pages |
| `Permissions-Policy` | Camera, microphone, geolocation and similar features disabled |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `X-Frame-Options` | `DENY` (legacy companion to `frame-ancestors`) |

Fonts are self-hosted, so no third-party font or script origin is needed. A nonce-based policy makes pages dynamically rendered; the marketing page may use a stricter static policy without nonces if that is needed for caching. The CSP is first deployed in report-only mode, then enforced.

**Other controls**

| Risk | Control |
|---|---|
| CSRF | Session cookie `SameSite=Lax`; state-changing API routes require `Content-Type: application/json` and an `Origin` header equal to the application origin; Auth.js routes use their built-in CSRF protection; no state changes on `GET` |
| XSS | React escaping; safe Markdown rendering (section 6); CSP; no inline event handlers |
| SQL injection | Drizzle parameterized queries; no string-built SQL; vector literals passed as parameters |
| SSRF | The server fetches no user-supplied URLs. Object-storage and provider endpoints come from configuration only |
| Open redirect | Post-sign-in return targets must be same-origin relative paths |
| Request size | 64 KB JSON limit; file bytes never reach the application |
| Input validation | zod schemas for params, query and body on every route; unknown keys rejected |
| Clickjacking | `frame-ancestors 'none'` |
| Caching | `Cache-Control: no-store` on API responses and authenticated pages |
| Information exposure | No `X-Powered-By`; generic health endpoint; no source maps served publicly in deployed environments |
| Transport | HTTPS only in deployed environments; TLS to the database and Redis where the service supports it |

## 12. Dependency and supply-chain hygiene

- pnpm with a committed lockfile; CI installs with `--frozen-lockfile`.
- Install scripts are restricted to an explicit allow-list (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).
- `pnpm audit` and a dependency-review step run in CI; high-severity findings in production dependencies block merges unless explicitly waived with a reason.
- Automated update pull requests (Dependabot or Renovate), grouped weekly; security updates immediately.
- Parsers for untrusted files (`unpdf`/pdf.js, `mammoth`, the ZIP reader) are the highest-risk dependencies. They run only in the worker, which has no inbound network exposure, minimal privileges and resource limits.
- Pre-release dependencies are pinned to exact versions and listed: `next-auth` (v5 beta) and, where used for local tests, `@electric-sql/pglite-pgvector` (0.0.x).
- Container images use a slim, pinned Node.js base image, run as a non-root user, and are rebuilt regularly to pick up base-image fixes. An image scan step is part of the CI outline.
- New dependencies need a stated reason; small utilities are written in-house where that is cheaper than a dependency.

## 13. Privacy notes

- Question text and retrieved document chunks are sent to the configured model provider; chunk text is sent to the embeddings provider. With cross-Region inference profiles on Amazon Bedrock, requests can be processed in other Regions within the profile's geography, or anywhere for the global profile. The owner chooses the profile (`DEPLOYMENT.md`). This is disclosed in the product's trust section in plain language.
- The demo uses fictional documents only. Visitors are told not to enter personal or confidential information; demo conversations are deleted after the retention window.
- Deletion behaviour, including what remains in past answers and in backups, is defined in `DATABASE_SCHEMA.md` section 6.
- Contact leads are stored with the minimum fields and are accessible to operators only.

## 14. Verification plan

Security controls are considered unverified until the following have been run and their results recorded:

1. Tenant-isolation integration suite (API, repository and RLS levels) on real PostgreSQL.
2. Upload validation tests with hostile fixtures: wrong signature, oversized, encrypted PDF, scanned PDF, DOCX with forged sizes and extreme compression ratio, traversal names, malformed files.
3. Citation validation tests with fabricated labels, out-of-range labels and labels from earlier turns.
4. Injection items in the evaluation dataset against the live model.
5. Deletion test: after deletion, retrieval returns nothing from the document and the object is gone.
6. Rate-limit and budget tests, including the demo circuit breaker and concurrent requests.
7. Header and CSP check in a browser, with no console violations on the main screens.
8. Review of public and demo endpoints for information exposure.
9. Dependency audit and secret scan.

## Response headers of the application pages

Set in `apps/web/next.config.ts` from `apps/web/src/lib/security-headers.ts`, for every path except `/api/` (route handlers set their own; the original-file download has a sandboxing policy of its own):

- `Content-Security-Policy`: `default-src 'self'`, scripts, styles, fonts, images and connections from this origin only, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that turns off camera, microphone, geolocation and payment.

`script-src` includes `'unsafe-inline'` because the Next.js App Router delivers its page data and bootstrap as inline scripts. Nonces would remove that need, but they require rendering every page dynamically and were not verified against a production build; this is a known limit of the policy, which still blocks scripts from any other origin. A unit test pins the policy, and the HTTP suite checks that a production page carries it.
