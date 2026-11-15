# User journeys

Status: draft specification. These journeys describe intended behaviour. None of it is implemented or tested yet.

Requirement IDs in brackets (for example `[CIT-03]`) refer to `PRODUCT_REQUIREMENTS.md`. All people and the company Northstar Business Services are fictional and exist only to illustrate the product.

## 1. Personas

### 1.1 Dana — customer support lead

- **Context:** Leads a support team at a business services company. Agents answer questions about refunds, cancellations and service terms.
- **Goal:** Agents give the same correct answer every time, quickly, and can show the customer or a supervisor where the answer comes from.
- **Frustrations:** Policies live in several files. New agents ask senior agents instead of reading. Answers drift from the written policy.
- **What she needs from the product:** Fast answers with a citation she can open and read; a clear statement when the policy does not cover a case.
- **Devices:** Desktop at work; phone when away from the desk.

### 1.2 Yael — HR manager

- **Context:** Runs onboarding. Works mostly in Hebrew; some documents and terms are in English.
- **Goal:** New employees find answers about onboarding steps, benefits and procedures without emailing HR.
- **Frustrations:** Repeated questions; outdated copies of the onboarding guide in circulation.
- **What she needs from the product:** A fully usable Hebrew interface, correct display of mixed Hebrew and English text, the ability to replace an outdated document and be sure the old one is no longer used.
- **Devices:** Laptop.

### 1.3 Omar — operations coordinator

- **Context:** Maintains internal procedures and the service catalog. Uploads and curates documents for the team.
- **Goal:** Keep the knowledge library current and know which documents are actually ready to be queried.
- **Frustrations:** Tools that say "uploaded" when a file is not yet usable; no explanation when a file fails.
- **What he needs from the product:** Honest processing status, actionable failure reasons, search across the library, safe deletion.
- **Devices:** Desktop and tablet.

### 1.4 Michael — prospective client visiting the portfolio demo

- **Context:** A business owner or technical decision-maker who found HilaTech through a portfolio listing. Has a few minutes and no account.
- **Goal:** Decide whether HilaTech can build a credible AI product for his company.
- **Frustrations:** Demos that are static mockups, that require sign-up, or that show obviously fake results.
- **What he needs from the product:** An immediate, working impression; proof that answers trace to sources; honesty about what is a sample; an easy way to get in touch.
- **Devices:** Often a phone first, desktop later.

## 2. Journey map

| # | Journey | Primary persona | Acceptance workflow |
|---|---|---|---|
| J1 | Public demo visitor | Michael | A |
| J2 | Unsupported question | Dana, Michael | B |
| J3 | First-time authenticated upload | Omar | C, E |
| J4 | Returning user continues a conversation | Dana | — |
| J5 | Document deletion | Yael, Omar | D |
| J6 | Language switch | Yael | F |
| J7 | Mobile use | Michael, Dana | G |

## 3. J1 — Public demo visitor

**Persona:** Michael. **Entry point:** landing page, from a portfolio link. **Precondition:** not signed in.

### Main path

1. Michael opens the landing page. The hero states the product value and shows a question connected to an answer and its source documents `[LND-03, LND-04]`.
2. He scrolls to the interactive product preview and selects a citation in the sample answer. A document preview opens. The preview content is labelled as a sample `[LND-05]`.
3. He selects "Try Live Demo" `[LND-01, DEMO-01]`.
4. The demo workspace opens without a sign-in prompt. The empty state names Northstar Business Services as a fictional company, lists the four sample documents, and offers four example questions `[WS-04, DEMO-02, DEMO-04]`.
5. He selects a suggested question, or types his own, and sends it.
6. The answer streams into the conversation with inline citation markers `[WS-06, WS-08]`.
7. He selects a citation. The evidence region opens, selects the cited document, moves to the cited page or section, and shows the excerpt, visibly separate from the generated text `[CIT-03, CIT-05]`.
8. He pages through the source document to read the surrounding context `[CIT-07]`.
9. He asks a follow-up question, or selects a suggested follow-up.
10. He returns to the landing page conversion section, or uses a contact link in the demo, and submits the contact form `[CON-01–CON-04]`.

### Outcome

Michael has seen a question answered from documents, verified it against the source, and has a way to contact HilaTech.

### Failure branches

| Branch | Trigger | Expected behaviour |
|---|---|---|
| J1-F1 | No live AI provider is configured (including all of Milestone 1) | The demo runs in sample-preview mode. Each pre-written answer carries a persistent label stating it is a sample and not a live AI response. Only the prepared questions are answerable; free-text questions outside the prepared set get a clear explanation, not an improvised answer `[DEMO-09, DEMO-10, NFR-HON-01]`. |
| J1-F2 | Demo query or token limit reached | A plain message explains that the demo limit has been reached and what to do next. The composer is disabled with an explanation; earlier answers and citations stay usable `[DEMO-08, LIM-05]`. |
| J1-F3 | Rate limit hit by rapid requests | The request is rejected with a clear retry message. The typed question is preserved `[LIM-02, WS-05]`. |
| J1-F4 | Provider error or timeout mid-stream | Streaming stops, the partial answer is marked incomplete, and a retry action is offered. No citation is shown for content that was not validated `[WS-07, CIT-02]`. |
| J1-F5 | Network loss | An error state with retry appears. The typed question is preserved. |
| J1-F6 | Source preview fails to load | The evidence region shows the extracted excerpt and an error for the preview, with retry. The citation is not removed. |
| J1-F7 | Contact form invalid or delivery fails | Field-level validation messages appear; on delivery failure the input is kept and an error is shown. Success is never shown unless the lead was persisted or delivered `[CON-03, CON-04]`. |
| J1-F8 | Visitor tries to upload a file | Upload is not offered in the public demo. Where it would appear, the interface explains that upload requires an account `[DEMO-06]`. |

## 4. J2 — Unsupported question

**Personas:** Dana (authenticated), Michael (demo). **Precondition:** a workspace with indexed documents.

### Main path

1. The user asks a question the documents do not answer (for example, a policy the Northstar documents never mention).
2. The system retrieves candidates, applies relevance and evidence thresholds, and finds insufficient support `[WS-11]`.
3. The response states clearly that reliable information was not found in the available documents `[WS-10]`.
4. No citation chips appear, and the evidence region does not present sources as support for an answer `[CIT-01]`.
5. The response offers a helpful next step: rephrase, or try one of the suggested questions that the documents do cover.

### Variant — misleading assumption

1. The user asks a question that presupposes something false (for example, "What is the fee for the 90-day refund?" when the policy defines no such window).
2. The response does not accept the false premise. It states what the documents do say, with citations, and that the premise is not supported.

### Variant — partial support

1. The documents cover part of the question.
2. The response answers the supported part with citations and says explicitly which part is not covered. Uncertainty is preserved, not smoothed over `[WS-13]`.

### Failure branches

| Branch | Trigger | Expected behaviour |
|---|---|---|
| J2-F1 | The model emits a citation identifier that was not in the retrieved set | The identifier is discarded before display and never becomes a link `[CIT-02]`. |
| J2-F2 | A document contains text that tries to instruct the assistant | The text is treated as source content only. It does not change the assistant's behaviour `[WS-12]`. |
| J2-F3 | Retrieval itself fails (database or embedding provider error) | A system error state with retry is shown. It is not worded as "no information found", because that would misreport a fault as an absence of evidence. |

## 5. J3 — First-time authenticated upload

**Persona:** Omar. **Precondition:** Omar has an account in his organization; the workspace has no documents.

### Main path

1. Omar opens the sign-in page and signs in `[AUTH-01]`.
2. He lands in the workspace. The empty state explains that no documents are available yet and points to the library.
3. He opens the knowledge library. The empty state invites him to upload and lists supported formats and the maximum file size `[LIB-04, LIB-07]`.
4. He drags a PDF onto the upload area. The area shows a drag-over state `[LIB-05]`.
5. He drops the file. Client validation passes, the upload starts, and progress is shown.
6. Upload completes. The document appears in the library with status "Processing". It is not presented as ready `[LIB-08]`.
7. Background ingestion extracts text, records page/section metadata, chunks, embeds and indexes `[LIB-11]`.
8. The status changes to indexing complete, without Omar reloading the page.
9. He opens a new chat and asks a question that the uploaded document answers.
10. The answer streams and cites the uploaded document `[CIT-01]`.
11. He selects the citation and sees the correct page and excerpt in the evidence region `[CIT-03]`.

### Outcome

Omar's document is queryable, and he has verified that an answer traces to it.

### Failure branches

| Branch | Trigger | Expected behaviour |
|---|---|---|
| J3-F1 | Wrong credentials | A safe error message that does not reveal whether the account exists. |
| J3-F2 | Unsupported file type | Rejected before upload with a message listing supported formats. The server also rejects it if the client check is bypassed `[LIB-09]`. |
| J3-F3 | File over the maximum size | Rejected with the limit stated. |
| J3-F4 | File extension and actual content disagree | Server validation rejects the file with a clear reason. |
| J3-F5 | Duplicate of an existing document | The user is told the document already exists; no second copy is indexed silently. |
| J3-F6 | Upload interrupted | The failure is shown with a retry action. No half-uploaded document is listed as processing. |
| J3-F7 | Scanned PDF with no extractable text | Status becomes failed with the reason "scanned document; OCR is not supported". It is never marked ready `[LIB-10]`. |
| J3-F8 | Malformed or password-protected file | Status becomes failed with an actionable reason. The user can remove the document. |
| J3-F9 | Embedding provider unavailable during ingestion | The job retries according to the retry policy. If retries are exhausted, status becomes failed with a reason and a way to retry. |
| J3-F10 | User asks about the document while it is still processing | The document is not retrieved. The interface makes clear which documents are ready; the answer does not pretend to have read it `[LIB-08]`. |
| J3-F11 | Session expires during upload | The user is asked to sign in again and returned to the library. The upload state is reported truthfully. |
| J3-F12 | A user from another organization attempts to list, preview or query the document | Access is denied on the server and the document never appears in their retrieval results `[AUTH-03]`. |

## 6. J4 — Returning user continues a conversation

**Persona:** Dana. **Precondition:** Dana has at least one earlier conversation with cited answers.

### Main path

1. Dana signs in. Her session may still be valid, in which case she goes straight to the workspace.
2. The navigation region lists her previous conversations `[CONV-02]`.
3. She selects a conversation. Its messages load in order, with citation chips intact.
4. She selects a citation from an earlier answer. The evidence region opens at the correct page or section, as it did originally `[CIT-10]`.
5. She types a follow-up question. The answer streams, is appended to the same conversation, and carries its own citations `[CONV-03]`.
6. She starts a new chat for an unrelated topic. The previous conversation remains in history `[CONV-04]`.

### Failure branches

| Branch | Trigger | Expected behaviour |
|---|---|---|
| J4-F1 | Conversation list fails to load | Error state with retry in the navigation region. The composer for a new chat stays usable. |
| J4-F2 | A cited document was deleted since the answer was written | The citation is shown as no longer available, according to the deletion policy. It does not open a broken preview and does not show stale content as current `[LIB-12]`. |
| J4-F3 | Usage limit reached | The limit and remaining allowance are visible near the composer. Sending is blocked with an explanation. History stays readable `[LIM-04, LIM-05]`. |
| J4-F4 | Conversation URL belongs to another user or organization | A not-found or forbidden response that does not confirm the conversation exists `[CONV-05]`. |
| J4-F5 | Streaming fails on the follow-up | The partial answer is marked incomplete, retry is offered, and the earlier messages are unaffected. |
| J4-F6 | No previous conversations | The history area shows an empty state that explains what will appear there. |

## 7. J5 — Document deletion

**Personas:** Yael replacing an outdated onboarding guide; Omar curating the library. **Precondition:** signed in; the document exists and is indexed.

### Main path

1. Yael opens the knowledge library and finds the document by search `[LIB-02]`.
2. She chooses remove on the document.
3. A confirmation dialog names the document and states what deletion does: the file and its indexed content are removed and it will no longer be used in answers `[LIB-12]`.
4. She confirms. The document leaves the library list and a confirmation toast appears.
5. The stored file and the document's chunks are removed according to the deletion policy. The action is written to the audit log `[AUTH-05]`.
6. She asks a question that only the deleted document could answer. The response is the insufficient-evidence response, with no citation to the deleted document.
7. She uploads the current version of the guide (journey J3).

### Failure branches

| Branch | Trigger | Expected behaviour |
|---|---|---|
| J5-F1 | User cancels the dialog | Nothing changes. Focus returns to the control that opened the dialog. |
| J5-F2 | Deletion fails on the server | The document stays listed, an error with retry is shown, and it is not reported as deleted. |
| J5-F3 | File removal succeeds but chunk removal fails, or the reverse | The document is not left retrievable. The inconsistency is recorded and retried; the user is not told deletion completed until it has. |
| J5-F4 | Document is still processing | Deletion cancels or supersedes the ingestion job. No chunks from that job remain afterwards. |
| J5-F5 | User lacks permission, or the document belongs to another organization | Denied on the server. |
| J5-F6 | Another user's open conversation cites the document | Handled as in J4-F2. |

## 8. J6 — Language switch

**Persona:** Yael. **Precondition:** the interface is in English.

### Main path

1. Yael opens the language selector in the header and chooses Hebrew `[I18N-08]`.
2. The interface switches to Hebrew. The document's `lang` is `he` and `dir` is `rtl` `[I18N-03]`.
3. Navigation moves to the inline-start side for RTL. Directional icons mirror; the brand mark does not `[I18N-05]`.
4. She navigates the landing page, the workspace, the library, and the contact form. All interface text is Hebrew, with correct form and table alignment `[I18N-02, I18N-07]`.
5. She opens a conversation that contains English filenames, an email address and numbers inside Hebrew sentences. They display in the correct order `[I18N-06]`.
6. She opens a document preview. The document content appears in its own language and direction, unchanged by the interface language `[I18N-09]`.
7. She asks a question in Hebrew and receives a readable, correctly directed answer with working citations.
8. She reloads the page. The interface is still in Hebrew `[I18N-08]`.

### Failure branches

| Branch | Trigger | Expected behaviour |
|---|---|---|
| J6-F1 | A translation key is missing | Treated as a defect. Dictionary completeness is checked by an automated test so that a missing key fails the build, not the user. |
| J6-F2 | Switch happens mid-conversation | The conversation, the typed draft and the open evidence region are preserved. |
| J6-F3 | Switch happens while an answer is streaming | The stream is not corrupted or duplicated. |
| J6-F4 | Hebrew question, English-only sources | The answer is given only if retrieval finds sufficient evidence; otherwise the insufficient-evidence response is shown. Cross-lingual quality is not claimed until validated against the real embedding provider `[NFR-HON-04]`. |
| J6-F5 | Long Hebrew or mixed-direction filename | Truncated safely without breaking layout; the full name is available on focus or hover. |

## 9. J7 — Mobile use

**Personas:** Michael on the public demo; Dana in the authenticated workspace. **Precondition:** viewport of 360–390 px.

### Main path

1. The user opens the landing page on a phone. The hero is readable and there is no horizontal scrolling `[NFR-PERF-04]`.
2. They open the mobile menu, which stays within the viewport, and choose the live demo `[LND-02]`.
3. The workspace shows the conversation as the primary view, with compact navigation.
4. They tap the composer. The virtual keyboard opens; the composer stays visible and usable above it.
5. They send a question. The answer streams and remains readable; tables scroll inside their own container.
6. They tap a citation. Sources open in a sheet or dedicated view with the document name, page or section, and excerpt `[CIT-03]`.
7. They close the sheet and return to the same scroll position in the conversation.
8. They open conversation history from the compact navigation and switch conversations.
9. (Dana) She opens the library and uploads a file using the device file picker.

### Tablet variant

At 768–1024 px the workspace uses a two-panel layout where it fits, and moves smoothly between conversation and sources.

### Failure branches

| Branch | Trigger | Expected behaviour |
|---|---|---|
| J7-F1 | Keyboard covers the composer | Treated as a defect; the layout must keep the composer in view. |
| J7-F2 | Device rotation with a sheet open | The sheet and the conversation remain usable and inside the viewport. |
| J7-F3 | Slow or dropped connection | Skeleton states appear while loading; failures show retry and keep the typed text. |
| J7-F4 | Long filename, long URL or wide table in an answer | Contained by truncation or internal scrolling; the page does not scroll sideways. |
| J7-F5 | Dialog or menu taller than the viewport | Scrolls internally; its actions remain reachable. |
| J7-F6 | Reduced-motion preference set | Sheet and message transitions are reduced or removed `[NFR-A11Y-07]`. |
| J7-F7 | Drag-and-drop unavailable on touch | The file picker is the upload path; the upload area says so. |

## 10. Cross-journey rules

1. Every state has a designed empty, loading, success and error presentation.
2. An error never destroys the user's typed input.
3. A system fault is never reported as "no information found".
4. Nothing is shown as ready, sent, deleted or verified before it is.
5. Sample or simulated content is always labelled, in both languages and both themes.
6. Authorization is decided on the server in every journey.
