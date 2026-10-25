# Orbit update list

Running list of small fixes to batch-apply in one go. Line numbers were noted on 21 Oct 2026 and may have shifted; find code by function name.

## Pending

(none)

## Done

1. **Session note vs exercise notes** (v1.67): confirmed the Notes tab (`noteEntries`) filed each session note under every muscle trained; it now files it once under General.
2. **Exercises list: tap row to open** (v1.67): the whole row opens the editor; Edit still works.
3. **Exercises list: scroll opened editor into view** (v1.67): opening scrolls the editor fully into view, or keeps Save at the bottom edge when the editor is taller than the screen.
4. **Volume graph: projected sets** (v1.67): Volume is now Mon to Sun with done/half/planned bars, numbers, "+N Mon", a Planned caption, soft band, and tap-a-bar breakdown with day and direct/half (`volWeek` in engine.js). Per-muscle weights not done (out of scope).
6. **Volume window: rolling, no week end** (v1.68): Volume is now the last 3 days, today and the next 3, so tomorrow's session always counts (on a Sunday the Mon to Sun week hid Monday's Pull); the "+N Mon" note is gone.
5. **Workout stays in progress until filled and Done** (v1.67): Save until every set has weight and reps (reps only for bodyweight), Done sets `fin`; History shows finished sessions only, older logs (before `FIN_FROM`) count as finished.
