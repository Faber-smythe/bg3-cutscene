# En chasse de soi-même — Dialogue cutscene UI

This is a small vanilla HTML/CSS/JS project implementing a fullscreen dialogue cutscene renderer inspired by Baldur's Gate 3.

Files
- [index.html](index.html): Single-page UI shell and DOM elements.
- [styles.css](styles.css): All styling and animations.
- [script.js](script.js): Renderer, game state, effects and history handling.
- [story.json](story.json): Content data (do not edit).
- [schema.d.ts](schema.d.ts): Reference schema for the data format (do not edit).

How to run
- Open `index.html` in a browser (double-click or serve via a local static server).

Notes
- All logic is client-side and uses the `story.json` file as source. The start node is `GameFile.start`.
- If assets referenced in `story.json` are not present locally, the renderer will warn in the console and continue without them (TODO: add placeholder art/audio).

Implementation details
- A `GameState` object tracks `currentNodeId`, `flags`, and `history`.
- `text` and `textVariants[].text` support strings or arrays; arrays render as separate paragraphs with staggered fade-in.
- Effects supported: `background` (fade), `soundtrack` (crossfade loop), `portraitLeft`/`portraitRight` (fade-in).
- Choices update `GameState.flags` when they include a `set` block.
- The history panel (toggle bottom-left) slides down from the top and shows past nodes.

