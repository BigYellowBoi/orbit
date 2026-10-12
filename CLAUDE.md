# Orbit – working notes

Training log for Louis (BigYellowBoi): a rotating split (Push 1, Pull, Push 2, Legs; optional Upper/Lower/Push/Pull/Legs), WHOOP and MacroFactor imports, maintenance goal (no progressive overload). Single-file vanilla JS app, dark theme, Geist fonts. No framework, no bundler.

User preferences: short answers, never use em dashes (in replies or UI copy).

## Two targets, one source
- **claude.ai artifact (beta, still Louis's main data)**: https://claude.ai/artifact/XAN6MufDsut3PVWobwYvgh, capabilities `{db:{}, user:{}, downloads:true}`. Publish `dist/artifact.html` to that URL (read it first). Also save it to the claude.ai Project "Gym stuff" as `claude/Orbit.html`.
- **GitHub Pages**: https://bigyellowboi.github.io/orbit/ serves `index.html`, `manifest.webmanifest` and the icons from the root of `main`. Syncs to the private repo `BigYellowBoi/orbit-data` via `src/gh.js`.
- The two keep separate data. Louis moves data by backup (.json) in one and restore in the other. He is still beta testing on the artifact.

Any feature change goes into `src/`, then `tools/build.sh` rebuilds both. Ship to both targets unless told otherwise.

## Layout
- `src/head.html` CSS tokens and styles; `src/body.html` shell (header ring, 5 tabs, toast); `src/gh-head.html` the Pages-only document head (meta, icons, safe-area status-bar backdrop).
- JS, concatenated in this order: `core.js` (helpers, exercise library, presets, STATE, ui), `engine.js` (rotation, e1RM/PRs, maintenance check, HRV band, cardio auto-log from WHOOP), `imports.js` (WHOOP zip/CSV via JSZip 3.10.1, MacroFactor xlsx via SheetJS 0.18.5, both lazy-loaded from cdnjs), `charts.js` (hand-built SVG), `explorer.js` (Trends metric explorer), `notes.js`, `views.js` (Today, Log, History, Trends, Plan, Data), `boot.js` (persistence, render, actions, boot). `gh.js` is appended for Pages only.
- `tools/build.sh` builds; `tools/icons.js` renders `tools/icon.html` to the PNG icons.
- `test/` Playwright scripts: `gh.js` (GitHub sync against a mocked API: two devices, conflicts, offline, delete, restore), `sync.js` (artifact cloud sync with a mocked `window.claude`), `notes.js`. Run with `PLAYWRIGHT=/path/to/playwright node test/gh.js` after building.

## Data
- localStorage key `rotation-logbook-v1` holds `{settings, w, d}` (kept for continuity).
- `STATE.w[date]` workouts `{s, ex:[{id, sets:[{w,r,done}], note}], cardio, rest, note}`; `STATE.d[date]` WHOOP + MacroFactor day fields.
- Artifact cloud: `data/users/<uid>/settings` and month docs `.../log/{wk|dy}/YYYY-MM`.
- GitHub: `orbit/settings.json`, `orbit/{wk|dy}/YYYY-MM.json` in `orbit-data`. Token lives only in each device's localStorage (`orbit-gh-cfg`); never ask for it, log it or commit it. Sync = read head, fetch changed blobs, merge (dates edited locally and unpushed win), one commit via the Git Data API, retry on non-fast-forward.

## Don't commit
This repo is public. Never add Louis's WHOOP/MacroFactor exports, backups or screenshots of real data.
