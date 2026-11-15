# Responsive behaviour

Breakpoints (Tailwind v4 defaults plus two custom): `xs` 416, `sm` 640, `md` 768, `lg` 1024, `wide` 1200, `xl` 1280 px.

## Landing page

| Width | Layout |
|---|---|
| < 640 | Single column. Hero illustration stacks: question, answer, then the two pages; threads are not drawn (they would cross text) and the highlights carry the link. Menu is a top sheet. Product preview stacks questions, answer, source. Steps, use cases and trust items stack. Form fields are full width. |
| 640–1023 | Hero illustration returns to two columns with threads. Trust items in two columns. Form in two columns. Language and theme controls move into the header. |
| 1024–1199 | Full navigation in the header. Product preview shows questions beside the answer, source below. Steps in three columns. Use cases in two columns per row. |
| ≥ 1200 | Hero in two columns (text, illustration). Product preview in three columns. Section intros split heading and lead text. |

Type and section spacing scale fluidly with `clamp()` between these points.

## Knowledge Workspace

| Width | Navigation | Conversation | Evidence |
|---|---|---|---|
| < 768 | Sheet from the start edge | Full width; composer pinned to the bottom; keyboard hint hidden | Bottom sheet (86% of the viewport height), closes with Escape, the close button or the overlay |
| 768–1199 | Sheet from the start edge | Shares the row with evidence when it is open | Inline panel, `clamp(20rem, 36vw, 30rem)` wide |
| ≥ 1200 | Fixed column, 18rem | Centre column, reading width capped at 46rem | Inline panel, same width rule |

- The shell is `100dvh` with `interactive-widget=resizes-content`, so the composer stays above the on-screen keyboard in browsers that support it. This has been checked in desktop Chrome emulation only, not on physical devices.
- The evidence region takes no space until it has content.
- Tables in answers scroll horizontally inside their own container.
- Long file names and titles truncate with an ellipsis; nothing forces the page wider than the viewport.

## Right-to-left

The same rules apply mirrored. Sheets slide from the logical edge, directional icons flip, document file names stay left-to-right, and the hero threads are measured from the rendered positions, so they connect correctly in both directions.

## Verified sizes

Screenshots are captured by `apps/web/scripts/visual-qa.mjs` at 390, 768 and 1440 px, and the script fails on horizontal overflow, console errors or failed requests. The landing page and the workspace (with evidence open) were also loaded at 360, 1024 and 1920 px in English and Hebrew with no horizontal overflow and no console errors; those sizes are not part of the saved screenshot set.
