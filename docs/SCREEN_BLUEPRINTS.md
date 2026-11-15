# Screen blueprints

Implemented screens: landing page (`/[locale]`), Knowledge Workspace in sample-preview mode (`/[locale]/demo`), and a localized not-found page. Planned screens are listed at the end.

## Landing page

```
┌──────────────────────────────────────────────────────────────┐
│ logo        Product  How it works  Use cases  Demo  Contact   │  sticky; gains a
│                                     עברית  ☾  [Try live demo] │  border when scrolled
├──────────────────────────────────────────────────────────────┤
│ Your knowledge,            ┌ question ┐      ┌─ page ──────┐  │
│ finally within             ├ answer ①─┼──────┤ ▓▓marked▓▓  │  │  hero: headline at the
│ reach.                     │        ②─┼──┐   └─────────────┘  │  start edge, live
│ lead text                  └──────────┘  └───┤ ▓▓marked▓▓  │  │  illustration at the end
│ [Try the live demo] [Explore]                └─────────────┘  │
├───────────────────────── dark stage ─────────────────────────┤
│ Ask a question. See where the answer comes from.              │
│ ┌ questions ─┬ question + answer ①② ──────┬ source page ───┐ │  interactive preview:
│ │ library    │                             │ ▓▓marked▓▓     │ │  4 questions, clickable
│ └────────────┴─────────────────────────────┴────────────────┘ │  citations
│ [Open the demo workspace]                                     │
├──────────────────────────────────────────────────────────────┤
│ From a folder of files to an answer you can check.            │
│ 01 files being read │ 02 a question typed │ 03 a marked page  │  a real sequence, so numbered
├──────────────────────────────────────────────────────────────┤
│ One workspace, useful to every team.                          │
│ team + what changes ─────────── a question they might ask     │  four rows, hairline rules
├──────────────────────────────────────────────────────────────┤
│ Built so you can check its work.   │ private documents        │
│ [example: no answer in documents]  │ source-based answers     │
│                                    │ access controls          │
│                                    │ unsupported questions    │
├───────────────────────── dark stage ─────────────────────────┤
│ Ready to make your business knowledge searchable?   [ form ]  │
├──────────────────────────────────────────────────────────────┤
│ logo, tagline, links, disclosure, ©                           │
└──────────────────────────────────────────────────────────────┘
```

Behaviour:

- **Hero illustration** is assembled from the product's own components and the sample documents. Hovering or focusing a citation strengthens its thread and highlight.
- **Product preview** uses tabs for the four example questions (arrow keys work, including in RTL). Selecting a citation swaps the source page.
- **Contact form** validates on the client and again on the server with the same schema. States: idle, field errors (focus moves to the first invalid field), sending, sent, and a form-level error. It includes a honeypot field and a per-IP rate limit. Success is shown only after the lead is stored.
- **Mobile menu** is a sheet from the top with large links, language, theme and the main action.
- No customer logos, testimonials, metrics or compliance claims appear anywhere.

## Knowledge Workspace

```
┌ navigation ───┬ conversation ──────────────────────┬ evidence ───────────┐
│ logo          │ title  [Sample preview]  [Evidence]│ Evidence          ✕ │
│ [+ New chat]  │ ● answers here are pre-written …   ├─────────────────────┤
│               ├────────────────────────────────────┤ Sources             │
│ Sample        │                     ┌ question ┐   │ ① policy   Page 3   │
│ conversations │ Knowledge Studio [pre-written]     │ ② handbook Page 11  │
│  …            │ answer text ① …                    │                     │
│ Knowledge     │ – list item ②                      │ Document            │
│ library       │ 2 sources · Copy · Retry           │ ‹   Page 3 of 8   › │
│  …            │ Related questions                  │ ┌ paper ──────────┐ │
│               ├────────────────────────────────────┤ │ Extracted text  │ │
│ workspace     │ [ Ask about these documents     ↑ ]│ │ ▓▓ marked ▓▓    │ │
│ ← site  עב ☾  │ Enter to send | Shift Enter newline│ └─────────────────┘ │
└───────────────┴────────────────────────────────────┴─────────────────────┘
```

Regions:

- **Navigation**: brand, new chat, sample conversations, knowledge library (opens a document in the viewer), workspace name, back to site, language, theme. Settings and a user menu arrive with authentication; they are not shown as dead controls.
- **Conversation**: title, a persistent sample-preview label and banner, messages, composer.
- **Evidence**: hidden until a citation, the sources button or a library document is chosen. Lists the sources of the answer in focus, then the document viewer with previous/next navigation.

States implemented:

| State | Behaviour |
|---|---|
| Empty | Headline, short explanation, four example questions as rows, the documents available, composer |
| Revealing | Answer blocks appear one at a time with skeleton lines; send becomes stop |
| Stopped | Partial answer with a note; retry available |
| Complete | Sources count, copy, retry, related questions |
| Typed question | A notice that the question was not sent to a model, with example questions. No answer and no citations are shown |
| Citation selected | Evidence opens on the right document and page or section, passage marked |
| Page without sample text | Viewer says the text is not included in the sample preview |

Citation rules already enforced in the UI: a citation number always maps to a real passage in the list; a citation whose passage is missing is not rendered; the viewer labels content as extracted text and states that the marked passage is quoted while the answer is a summary. PDF rendering with pixel-accurate highlighting is not claimed; the viewer shows extracted text by page or section.

### Sample-preview mode

Everything in the workspace today comes from `apps/web/src/sample/northstar.ts`, hand-written for the fictional Northstar Business Services. No model, embedding or retrieval step runs. The label appears in the top bar, in a banner, and on every answer.

## Not-found page

Localized title, explanation and two actions (home, demo workspace).

## Planned screens (not built)

Document library and upload, document preview page, conversation history management, sign-in, settings, usage, privacy and terms. They will reuse the components and rules above and get their own blueprint here when designed.
