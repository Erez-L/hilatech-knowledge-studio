# Milestone 1 report — design foundation

Date: 2026-11-15. Scope: specifications, architecture designs, design system, landing page, Knowledge Workspace (sample-preview mode).

## What exists

| Item | State |
|---|---|
| Product, design and architecture documents (13 files) | Written. Architecture documents are designs; nothing in them is implemented |
| Design system | Implemented in `apps/web` |
| Landing page (`/en`, `/he`) | Implemented |
| Knowledge Workspace (`/en/demo`, `/he/demo`) | Implemented in sample-preview mode only |
| Contact form and `POST /api/contact` | Implemented. Stores leads in a local file in development; no production store yet |
| Backend, database, auth, ingestion, retrieval, live AI | Not started |

## What was verified, and how

All checks ran against a production build (`next build`, `next start`) in headless Google Chrome through Playwright, in a cloud Linux workspace.

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`, strict) | Pass |
| ESLint (`eslint-config-next`) | Pass, no warnings |
| Production build | Pass |
| Browser checks (`scripts/checks.mjs`) | 55 of 55 pass |
| axe, WCAG 2.0/2.1/2.2 A and AA rule sets | No violations on: landing (en light, he light, en dark), workspace empty (en light, he dark), workspace with conversation and evidence (en), evidence sheet (he, mobile), landing mobile menu, not-found |
| Screenshots (`scripts/visual-qa.mjs`) | 17 captured at 390, 768 and 1440 px; no console errors, failed requests or horizontal overflow |
| Extra widths | 360, 1024 and 1920 px loaded in both languages; no overflow, no console errors |

The 55 browser checks cover: language and direction attributes; product-preview tabs and citations; contact form validation, focus handling and success; API validation, malformed input, honeypot and rate limit; theme toggle and persistence; language switch; composer keyboard behaviour; the typed-question notice; stop and retry; citation to evidence mapping (document, page or section, highlighted passage); viewer navigation; evidence open and close; follow-up questions; sample history; library documents; mobile sheets; reduced motion.

Lighthouse (single run each, lab conditions on the build machine, not field data):

| Page | Form factor | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|
| `/en` | mobile | 95 | 99 | 100 | 100 |
| `/en` | desktop | 100 | 99 | 100 | 100 |
| `/he` | mobile | 85 | 99 | 100 | 100 |
| `/he` | desktop | 100 | 99 | 100 | 100 |
| `/en/demo` | mobile | 92 | 100 | 100 | 100 |
| `/en/demo` | desktop | 100 | 100 | 100 | 100 |

The landing accessibility score of 99 came from a heading-order finding in the source-page component. That was fixed afterwards, and a re-run of the accessibility category on `/en` (desktop) scored 100. The other rows were not re-run after the fix.

## Not verified

- Real devices and other browsers (Safari, Firefox, mobile browsers). Only desktop Chrome and its device emulation were used.
- On-screen keyboard behaviour on phones.
- Screen readers. Automated rules pass; no manual pass with VoiceOver, NVDA or TalkBack was done.
- Hebrew copy by a native-speaking editor.
- Anything involving a model, embeddings, a database or storage. None of it exists yet.
- Core Web Vitals in the field.

## Known gaps and decisions for the owner

1. **"Live demo" wording.** The navigation and buttons say "live demo" as the brief specifies, but the demo is a labelled sample preview until a model is connected. The destination page states this clearly; the button labels could be changed to "Open the demo" in the meantime.
2. **Landing copy describes the finished product** (upload, indexing, private storage, access controls). Those features are designed but not built. The trust section is worded as design rules, and must be re-checked against the implementation before the site is public.
3. **Privacy and terms pages** are not written, so the footer does not link to them.
4. **Sample documents exist only as excerpts** inside the fixture file. Real PDF, DOCX and TXT files for ingestion testing are still to be authored, in both languages if the Hebrew demo should not depend on cross-language retrieval.
5. **shadcn CLI** could not reach its registry from the build environment; components were written by hand in the shadcn structure.
6. **Chrome DevTools and Context7 MCP servers** were not available; Playwright, axe and Lighthouse were used in their place.
7. **TypeScript is pinned to 6.x** because `typescript-eslint` does not yet support 7.0.
8. **The contact rate limit is per process and in memory.** It is replaced by the shared Redis limiter in the functional milestone.
9. **pgvector is not installed in the build environment** and Docker is not running there, so database integration tests need another environment or a different approach. See `DEPLOYMENT.md`.
10. **Auth.js v5 is still in beta.** `ARCHITECTURE.md` keeps it behind one module; the choice is worth revisiting before authentication is built.

## Screenshots

`artifacts/screenshots/` — all captured from the running application:

`landing-desktop`, `landing-hero-desktop`, `landing-tablet`, `landing-mobile`, `landing-dark-desktop`, `landing-hebrew-rtl-desktop`, `landing-hebrew-rtl-mobile`, `workspace-empty-desktop`, `workspace-desktop`, `workspace-table-desktop`, `workspace-tablet`, `workspace-mobile`, `workspace-mobile-evidence`, `workspace-empty-mobile`, `workspace-dark-desktop`, `workspace-hebrew-rtl-desktop`, `workspace-hebrew-rtl-mobile`.

## Closure review (2026-11-15)

Changes made after the first review, on the same branch:

| Item | Change |
|---|---|
| "Live demo" wording | Navigation says "Demo"; buttons say "Explore the demo" (Hebrew: "הדגמה", "לסיור בהדגמה"). No "live" wording remains while answers are pre-written |
| Marketing claims | "How it works" now carries a visible in-development note. The trust section states that it describes the design, not a finished service |
| Contact form honesty | A `503 not_configured` response now shows its own message ("Requests can't be received right now…"). A browser check runs the form against a server with no lead store and asserts that success is never shown |
| Durable lead storage | Leads go through the `LeadStore` interface. The PostgreSQL implementation (`contact_leads`) is part of Milestone 2; until then production has no store and the form reports that |
| Rate limiting and proxy headers | Client address is taken only from the last `TRUSTED_PROXY_HOPS` entries of `X-Forwarded-For` (default 0 = header ignored). Requests with no trustworthy address share one bucket. The limiter evicts oldest keys instead of clearing, and 429 responses carry `Retry-After`. Checks confirm a forged header prefix cannot bypass the limit |
| Visual review | Hebrew headline no longer breaks at the maqaf on narrow screens; the two hero buttons no longer both start with "Explore" |

Checks after these changes: typecheck, lint and production build pass; 59 of 59 browser checks pass (including axe on the same nine states); 17 screenshots recaptured with no console errors, failed requests or overflow. Lighthouse was not re-run.

Still open at closure:

1. The rate limiter is still in-process memory; the shared Redis limiter is Milestone 2 work.
2. No production lead store exists yet (Milestone 2).
3. Landing copy still describes capabilities that are not operational; the in-development note must stay until they are verified.
4. Privacy and terms pages are not written.
5. No testing on real devices, Safari, Firefox or with a screen reader.
6. Hebrew copy has not been reviewed by a native-speaking editor.

The milestone is preserved as the git tag `milestone-1` on branch `milestone-1-design-foundation`.
