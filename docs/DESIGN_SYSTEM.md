# Design system

Source of truth: `apps/web/src/app/globals.css` (tokens) and `apps/web/src/components` (components). This document describes what is implemented.

## Colour

Brand primitives (fixed):

| Name | Hex | Role |
|---|---|---|
| Deep Ink | `#172623` | Text, primary buttons (light), stage bands |
| Forest | `#28594F` | Brand accents, icons, focus ring (light) |
| Signal Lime | `#C7F36D` | Evidence highlight, AI actions, selected citation |
| Porcelain | `#F6F7F3` | Page background (light) |
| Mist | `#E4E9E3` | Hover surface (light) |
| Pure White | `#FFFFFF` | Raised surfaces and paper (light) |

Components use semantic tokens only, exposed as Tailwind utilities (`bg-surface`, `text-secondary`, `border-border`, and so on):

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F6F7F3` | `#0E1816` | Page |
| `surface` | `#FFFFFF` | `#14211E` | Raised surface |
| `sunken` | `#EEF1EC` | `#0B1412` | Sidebars, panels behind paper |
| `hover` | `#E4E9E3` | `#1C2E2A` | Hover surface |
| `paper` | `#FFFFFF` | `#192925` | Document pages |
| `foreground` | `#172623` | `#EBF0E9` | Primary text |
| `secondary` | `#43544F` | `#AFBDB6` | Secondary text |
| `tertiary` | `#5C6B66` | `#8A9A93` | Supporting labels |
| `disabled` | `#98A49F` | `#55655F` | Disabled text |
| `border` / `border-strong` | `#D6DDD5` / `#B4C0B7` | `#263A35` / `#3B544D` | Rules, control borders |
| `primary` / `on-primary` | Deep Ink / white | Signal Lime / ink | Primary action |
| `brand` | Forest | `#86C5B2` | Icons, small accents |
| `accent` / `on-accent` | Signal Lime / ink | Signal Lime / ink | AI actions, selected citation |
| `highlight` / `highlight-strong` | `#DFF8A8` / lime | lime at 20% / lime | Evidence marks |
| `bubble` / `on-bubble` | Deep Ink / white | `#223A34` / `#EBF0E9` | The person's question |
| `focus` | Forest | Signal Lime | Focus ring |
| `success`, `warning`, `danger` (+ `-surface`) | `#23694C`, `#8A5300`, `#A8322B` | `#7FD3A8`, `#F0C069`, `#F29A90` | Status |
| `stage` family | Deep Ink band | `#080F0E` band | Dark feature bands in both themes |

Contrast is checked by axe (WCAG 2.2 AA rule set) on both themes; see `MILESTONE_1_REPORT.md`.

## Typography

| Role | Family | Notes |
|---|---|---|
| Latin text | Plus Jakarta Sans (variable, 200–800) | All Latin runs, including inside Hebrew text |
| Hebrew text | Heebo (variable, Hebrew subset) | Falls in per glyph after Jakarta |
| Technical labels | IBM Plex Mono (400, 500) | Page numbers, file names, keys, sample labels |

Fonts are self-hosted from `apps/web/src/fonts` through `next/font/local` (all SIL OFL 1.1).

| Token | Size | Use |
|---|---|---|
| `text-display` | `clamp(2.625rem, 1.5rem + 4.4vw, 4.625rem)` | Hero headline, weight 800 |
| `text-h2` | `clamp(2rem, 1.35rem + 2.6vw, 3.25rem)` | Section headings, weight 700 |
| `text-app-title` | `clamp(1.75rem, 1.4rem + 1.2vw, 2.25rem)` | Workspace titles |
| `text-h3` | `clamp(1.375rem, 1.2rem + 0.7vw, 1.75rem)` | Item headings |
| `text-lead` | `clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)` | Intro paragraphs |
| `text-body` | `1rem` | Body |
| `text-small` | `0.875rem` | Controls, secondary text |
| `text-label` | `0.8125rem` | Supporting labels |
| `.type-meta` | `0.75rem` mono | Technical labels |

Hebrew overrides (`:root:lang(he)`): display line height 1.08 (0.98 in English), heading 1.18, body 1.7, and tracking reset to zero or near zero. Labels are sentence case; nothing is set in all caps except file-extension glyphs.

## Space, radius, elevation

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px, plus `--space-section` (`clamp(4.5rem, 3rem + 7vw, 9rem)`) and `--gutter` (`clamp(1.25rem, 0.5rem + 3.2vw, 3.5rem)`).
- Page width: `82rem`. Reading column in the workspace: `46rem`.
- Radius encodes material: `paper` 3px (document pages), `control` 10px (buttons, inputs), `panel` 16px (cards, composer, bubbles), `stage` 24px (the product frame).
- Shadows are ink-tinted, two levels: `shadow-raised` and `shadow-float`.
- Direction: logical properties everywhere (`ps-*`, `ms-*`, `border-s`, `start-*`, `text-start`). No `left`/`right` layout rules.

## Motion

| Token | Value |
|---|---|
| `--dur-fast` / `--dur-base` / `--dur-slow` | 150 / 220 / 320 ms |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |

- Page-load: hero threads draw and highlights sweep (700 ms), once.
- Response to action: answer blocks rise in (320 ms), evidence panel opens by width (280 ms), sheets slide from their logical edge (260 ms in, 180 ms out), source page cross-fades (200 ms), theme colours ease together (320 ms).
- `prefers-reduced-motion`: animations and transitions are cut to near zero, the answer appears whole, and smooth scrolling is off.
- Motion library: `motion` for presence and width animation; CSS for everything else.

## Components

Primitives (`components/ui`):

| Component | Notes |
|---|---|
| `Button` | Variants `primary`, `accent`, `outline`, `ghost`, `onStage`; sizes `sm`, `md`, `lg`, `icon`, `iconSm`; `asChild` for links |
| `Sheet` | Radix Dialog; sides `start`, `end`, `top`, `bottom` (logical); focus trap, Escape, scroll lock |

Shared (`components/shared`):

| Component | Notes |
|---|---|
| `Logo`, `LogoMark` | Never mirrored; `tone="stage"` for dark bands |
| `ThemeSwitcher`, `LanguageSwitcher` | Theme persists; language keeps the current path |
| `CitationChip` | Numbered marker; 24 px box with an enlarged hit area; `aria-pressed` |
| `AnswerBlocks` | Renders a typed block tree (paragraph, list, table). Never renders HTML. A citation with no matching source is not rendered |
| `SourcePage` | A document page with the cited passage marked |
| `FileGlyph` | File-type indicator |

Marketing (`components/marketing`): `MarketingHeader`, `HeroSection`, `HeroVisual`, `ProductPreview`, `HowItWorks`, `UseCases`, `TrustSection`, `ContactSection`, `ContactForm`, `MarketingFooter`.

Workspace (`components/workspace`): `KnowledgeWorkspace` (shell and state), `WorkspaceSidebar`, `WorkspaceEmptyState`, `MessageList`, `ChatComposer`, `EvidencePanel`.

Signature CSS classes: `.mark-evidence` (the highlighter, with `data-active` and `data-sweep`), `.paper`, `.ruled-ground`, `.type-meta`, `.skeleton`, `.scroll-quiet`.

Not built yet (planned names from the brief): `DocumentCard`, `DocumentUploadZone`, `ProcessingStatus`, `ConfirmDialog`, `ToastSystem`, `ErrorState`, a general `EmptyState`.

## shadcn/ui

The shadcn CLI could not reach its registry from the build environment. Components follow the shadcn structure (Radix primitives, `cva` variants, a `cn` helper, files under `components/ui`) and are written against this system's tokens. `tailwind-merge` is extended so the system's font-size utilities are not mistaken for colours.

## Internationalization

- `next-intl` with locale-prefixed routes (`/en`, `/he`); `lang` and `dir` are set on `<html>` by the locale layout.
- All interface strings live in `apps/web/messages/{en,he}.json` (identical key sets).
- Mixed-direction content: `.ltr-run` isolates file names, emails and amounts; text inputs for free text use `dir="auto"`.
- Directional icons (arrows, chevrons, panel icons) flip with `rtl:-scale-x-100`; the logo and file glyphs do not.
