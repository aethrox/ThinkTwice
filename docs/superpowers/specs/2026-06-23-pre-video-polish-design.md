# Pre-Video Polish (Sub-project A0) — Design

**Date:** 2026-06-23
**Status:** Approved scope, pending spec review
**Goal:** Make ThinkTwice demo-ready for a YouTube video. PC-focused. The demo
will include debates in **non-English languages**, so multilingual correctness
matters.

This is a deliberately small, safe subset pulled to the front of Sub-project A
("Solid Ground"). It targets only what a viewer sees on camera or what could
break during a live/single-take recording. The rest of Sub-project A (tests,
ESLint/CI, concurrency cap, full context persistence, Stop button, dynamic
rounds) is **deferred until after recording**.

## Success criteria

A viewer watching a screen recording sees a polished product:
- The app renders in its intended Geist typeface, not the fallback Arial.
- The judge's evaluation notes read as clean prose — no raw `CONTINUE:` or
  `SCORES: [A]=7/10` control lines leaking into the UI.
- A transient network / dev-server blip mid-debate does **not** kill the debate;
  the stream reconnects and continues.
- In a non-English debate (e.g. Turkish, German), the winner crown appears
  correctly in History, and the judge's verdict/continue decisions are detected
  reliably.

## Scope — the changes

### 1. Geist font renders
**Problem:** `app/layout.tsx` loads Geist + Geist Mono and wires the CSS
variables, but `app/globals.css` hardcodes `font-family: Arial, Helvetica,
sans-serif` on `body`, which wins. The downloaded font is never shown.
**Change:** In `app/globals.css`, set the body font to use the loaded variable
(`var(--font-geist-sans)`) with a sensible system fallback, instead of Arial.
**Files:** `app/globals.css`.
**Verify:** Inspect computed `font-family` on body text in the browser preview —
expect Geist, not Arial.

### 2. Strip leaked control markers from judge notes
**Problem:** The verdict path strips its `VERDICT:` marker before display, but
the evaluation path does not. Users see raw lines like
`CONTINUE: needs more exploration` and `SCORES: [A]=7/10, [B]=5/10` rendered in
`JudgeNotesCard`.
**Change:** Before rendering the evaluation text, remove the leading
`CONTINUE:` marker and any standalone `SCORES:` line(s) (tolerant of leading
markdown/emphasis, matching the parser regexes). Scores are still parsed
separately for the sparkline — only the *displayed* prose is cleaned. Implement
as a small pure helper so it can be unit-tested later.
**Files:** `app/components/JudgeNotesCard.tsx` (+ a small helper, e.g. in
`lib/verdict-utils.ts`).
**Verify:** Run a debate; confirm judge notes show explanation prose only, with
no `CONTINUE:`/`SCORES:` lines.

### 3. Reconnect resilience
**Problem:** `app/debate/page.tsx` sets `es.onerror = () => es.close()`. Calling
`close()` disables EventSource's built-in auto-reconnect, defeating the server's
existing 10s reconnect grace window (`app/api/debate/stream/route.ts`). A
transient blip therefore ends the debate.
**Change:** Do **not** close the EventSource on a transient error while the
debate is unfinished — let the browser auto-reconnect (the server replays
buffered events from the client's cursor and cancels the pending abort when a
consumer reconnects). Close the connection only on:
- an explicit `done` or `error` **message** event, or
- component unmount.
Track completion via a ref so `onerror` can distinguish "still running" from
"already finished." Avoid duplicate-event problems on replay: the existing
reducer is append-based and keyed by round number, so replayed events are
idempotent for round/verdict state; confirm no double-append of streamed chunks
on reconnect (if needed, guard chunk handlers, but the server only resends from
the unread cursor so this should not occur).
**Files:** `app/debate/page.tsx` (the `EventSource` effect).
**Verify:** Start a debate, interrupt the stream (restart the dev server or drop
the connection mid-round), confirm the debate resumes and completes rather than
dying.

### 4. Language-agnostic winner detection + marker hardening
**Problem (a):** `extractWinner` uses an English-only regex
(`/\*\*Winner:\s*(.+?)\*\*/`), duplicated in both `app/history/page.tsx` and
`app/history/[id]/page.tsx`. In the 13 non-English languages the verdict is
written in-language ("Kazanan:", "Gewinner:"), so the crown never appears.
**Problem (b):** The prompts instruct the model to write entirely in the target
language while also emitting English control markers (`VERDICT:`, `CONTINUE:`,
`SCORES:`). If the model localizes those markers, `parseJudgeEvaluation`
misclassifies the decision.
**Change (a):** Add `lib/verdict-utils.ts` exporting a single
`extractWinner(verdict: string, scorecard?: Scorecard | null): string | null`
that derives the winner from the parsed scorecard (highest Overall / last
numeric column — already language-agnostic via `parseScorecard`), and falls back
to the existing marker regex only when no scorecard is present. Replace both
duplicated copies with this shared util.
**Change (b):** In `lib/prompts.ts`, add an explicit instruction to every prompt
that emits markers: *"Always write the control words `VERDICT:`, `CONTINUE:`,
and `SCORES:` in English exactly as shown, even when the rest of your response is
in another language."* Keep the markers themselves English (consistent with the
project's text-format / CLI decision). Parsers are unchanged — they already
tolerate leading markdown/emphasis.
**Files:** new `lib/verdict-utils.ts`; `app/history/page.tsx`;
`app/history/[id]/page.tsx`; `lib/prompts.ts`.
**Verify:** Run a Turkish (or German) debate to completion; confirm the winner
crown appears in both the History list and the History detail view, and the
verdict is detected without falling through to the forced-verdict path.

## Out of scope (deferred to full Sub-project A / B)

- Automated tests (Vitest), ESLint config, CI workflow.
- Global concurrency cap on `claude` subprocesses.
- Full context persistence into History and continuations.
- "Stop & wrap up" button.
- Real dynamic round extension (8 → 12). **Do not narrate "dynamic / up to 12
  rounds" in the video** — current behavior is a fixed 8 (4 for continuations).
- Mobile/responsive layout (PC-focused by decision).
- Full UI-chrome localization (button/label strings remain English).

## Risks & notes

- **Reconnect change is the most delicate.** It must not introduce duplicate
  streamed text on reconnect. Mitigation: the server replays only from the
  client's unread cursor, and round/verdict reducers are keyed by round number.
  Verify explicitly during testing.
- **Marker hardening is prompt-only** and low-risk; worst case the model ignores
  it and behavior is no worse than today.
- No new runtime dependencies are introduced by A0.
- Verification for A0 is primarily manual (browser preview) since the test
  harness lands in the later, deferred part of Sub-project A. The new pure
  helpers (`extractWinner`, marker-strip) are written test-ready for that pass.

## Follow-up after recording

Resume the full Sub-project A ("Solid Ground"): dynamic rounds, full context
persistence, Stop button, concurrency cap, Vitest parser suite (multilingual
fixtures), ESLint + CI. Then Sub-project B ("Trust Pack"): fact-checker agent
and user-weighted scorecard.
