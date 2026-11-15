# Promo video (cinematic cut)

Source for the HilaTech Knowledge Studio promo. The film is a single HTML page drawn in code
(CSS 3D + SVG + canvas) and captured frame by frame with headless Chrome. 1920x1080, 30 fps.

- `index.html` — stage, styles, overlay (letterbox, captions, sample-content notice, end card)
- `timeline.js` — scene start times and caption text; retime here to fit the narration
- `film.js` — scenes, drawings, camera; `renderAt(t)` draws the frame at time `t`
- `render.py` — `python3 render.py frames 3.3 16.8` for stills, `python3 render.py video` for the silent film

Screens come from `artifacts/screenshots` (sample-preview `workspace-*` screens for the answer scenes)
and fonts from `apps/web/src/fonts`; nothing is copied. All answers shown are sample content for the
fictional Northstar company, and the notice stays on screen for the whole film.

Status: picture is at frame-approval stage. Narration, music and sound effects are not added yet.
