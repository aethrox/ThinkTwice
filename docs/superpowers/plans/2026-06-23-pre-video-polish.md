# Pre-Video Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ThinkTwice demo-ready for a YouTube recording by fixing the four viewer-facing / live-gremlin issues: the unrendered Geist font, leaked judge-evaluation markers, EventSource reconnect death, and English-only winner detection in multilingual debates.

**Architecture:** Surgical edits to the existing Next.js 16 / React 19 app. Two small pure helpers are extracted into `lib/verdict-utils.ts` so verdict logic lives in one tested-ready place. Reconnect resilience is implemented with the standard SSE `Last-Event-ID` resume mechanism (server emits `id:` per event; browser auto-reconnect resumes from the last id) rather than the cursor-based assumption in the spec, which was incorrect.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Tailwind 4, Server-Sent Events, `claude` CLI subprocess.

## Global Constraints

- **PC-focused** — no mobile/responsive work in this pass.
- **No new runtime dependencies.** (No test runner either — A0 verification is manual via the browser preview + typecheck; the Vitest suite is deferred to the post-video Sub-project A.)
- **Keep control markers in English literal form** (`QUESTION:`, `VERDICT:`, `CONTINUE:`, `SCORES:`) — this is the model↔parser contract for the CLI/text-format architecture. Do not change the marker words or switch to structured/JSON output.
- **Parsers stay language-agnostic** — detection must not depend on English prose.
- **Work on branch `polish/pre-video`** (already created off the WIP snapshot on `main`). Commit after each task.
- **Typecheck command:** `npx tsc --noEmit` (authoritative fallback if it misbehaves under the Next plugin: `npm run build`).

## Spec correction (reconnect)

The spec (`docs/superpowers/specs/2026-06-23-pre-video-polish-design.md`, §3) assumed the SSE server "replays only from the client's unread cursor." It does not: `app/api/debate/stream/route.ts` starts `cursor = 0` on every new connection and replays the entire buffered event list. A naive "don't close on error" change would therefore duplicate rounds and double-append streamed text on reconnect. **Task 6 implements the correct fix:** the server emits an `id:` (the event index) on each SSE message and honors the `Last-Event-ID` request header that browsers send automatically on auto-reconnect, resuming after the last delivered event. The client then simply stops closing the stream on transient errors.

## File Structure

- `app/globals.css` — **modify**: body font-family uses the Geist variable (Task 1).
- `lib/verdict-utils.ts` — **create**: `extractWinner()` and `stripEvaluationMarkers()` pure helpers (Task 2).
- `app/components/JudgeNotesCard.tsx` — **modify**: clean evaluation text before render (Task 3).
- `app/history/page.tsx` — **modify**: use shared `extractWinner()` with scorecard (Task 4).
- `app/history/[id]/page.tsx` — **modify**: use shared `extractWinner()` with scorecard (Task 4).
- `lib/prompts.ts` — **modify**: add marker-language hardening to the judge prompts (Task 5).
- `app/api/debate/stream/route.ts` — **modify**: emit SSE `id:` + honor `Last-Event-ID` (Task 6).
- `app/debate/page.tsx` — **modify**: don't close EventSource on transient error (Task 6).

---

### Task 1: Render the Geist font

**Files:**
- Modify: `app/globals.css:22-26`

**Interfaces:**
- Consumes: the `--font-geist-sans` CSS variable already set on `<body>` by `app/layout.tsx` (`geistSans.variable`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the hardcoded Arial body font**

In `app/globals.css`, change the `body` rule from:

```css
body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

to:

```css
body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
```

- [ ] **Step 2: Typecheck (CSS change is harmless, confirm nothing else broke)**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify in the browser preview**

Start the dev server (`preview_start` if not running), open `http://localhost:3000`, then `preview_inspect` the `<h1>` "Think Twice" heading.
Expected: computed `font-family` begins with a Geist font (e.g. `"Geist", ...` / the `__Geist_*` Next font alias), **not** Arial.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "Render Geist font instead of Arial fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Verdict utility helpers

**Files:**
- Create: `lib/verdict-utils.ts`

**Interfaces:**
- Consumes: `Scorecard` type from `lib/scorecard-parser.ts` (`{ options: string[]; categories: string[]; scores: number[][] }`).
- Produces:
  - `extractWinner(verdict: string, scorecard?: Scorecard | null): string | null`
  - `stripEvaluationMarkers(text: string): string`

- [ ] **Step 1: Create the file with both helpers**

Create `lib/verdict-utils.ts`:

```ts
import type { Scorecard } from './scorecard-parser';

/**
 * Derive the winning option from a verdict.
 *
 * Language-agnostic: prefers the parsed scorecard (highest score in the last
 * numeric column — the "Overall" column by convention). The scorecard is
 * detected structurally by parseScorecard, so this works in any language.
 * Falls back to the English "**Winner: X**" marker only when no scorecard is
 * available (e.g. a verdict without a table).
 */
export function extractWinner(
  verdict: string,
  scorecard?: Scorecard | null
): string | null {
  if (scorecard && scorecard.options.length > 0 && scorecard.scores.length > 0) {
    const overallIdx = scorecard.categories.length - 1;
    let bestOption: string | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < scorecard.options.length; i++) {
      const score = scorecard.scores[i]?.[overallIdx];
      if (typeof score === 'number' && score > bestScore) {
        bestScore = score;
        bestOption = scorecard.options[i];
      }
    }
    if (bestOption) return bestOption;
  }

  // Fallback: English marker (kept for verdicts without a scorecard table).
  const bold = verdict.match(/\*\*Winner:\s*(.+?)\*\*/i);
  if (bold) return bold[1].trim();
  const plain = verdict.match(/Winner:\s*(.+?)[\n\r*]/i);
  if (plain) return plain[1].trim();
  return null;
}

/**
 * Remove leaked judge-evaluation control markers from text meant for display.
 * A "continue" evaluation streams as "CONTINUE: <reason>" followed by a
 * "SCORES: [A]=7/10, ..." line. Those are control tokens for the parsers, not
 * prose — strip them before rendering. Scores are still parsed separately from
 * the raw text by parseConfidenceScores for the sparkline, so this is
 * display-only.
 *
 * Tolerant of leading markdown/emphasis (e.g. "**CONTINUE:**", "> SCORES:"),
 * matching the parser regexes in lib/orchestrator.ts and lib/confidence-parser.ts.
 */
export function stripEvaluationMarkers(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const cleaned = line.trim().replace(/^[>#*_\s-]+/, '');
      return !/^SCORES:/i.test(cleaned);
    })
    .join('\n')
    .replace(/^[\s>#*_-]*CONTINUE:[ \t]*/im, '')
    .trim();
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the `Scorecard` import resolves, both functions typecheck).

- [ ] **Step 3: Commit**

```bash
git add lib/verdict-utils.ts
git commit -m "Add verdict-utils: language-agnostic winner + marker stripping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Behavioral verification of these helpers happens end-to-end in Tasks 3, 4, and the Capstone (clean judge notes + winner crown in a non-English debate). The functions are written test-ready for the deferred Vitest suite.

---

### Task 3: Strip leaked markers in the judge notes

**Files:**
- Modify: `app/components/JudgeNotesCard.tsx`

**Interfaces:**
- Consumes: `stripEvaluationMarkers` from `lib/verdict-utils.ts` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the helper**

In `app/components/JudgeNotesCard.tsx`, add below the existing `MarkdownContent` import (line 3):

```ts
import { stripEvaluationMarkers } from '@/lib/verdict-utils';
```

- [ ] **Step 2: Clean the text before rendering**

Replace the content block (currently lines 35-37):

```tsx
        {text && (
          <MarkdownContent content={text} className="text-xs [&_p]:text-xs [&_p]:text-zinc-400 [&_strong]:text-zinc-300" />
        )}
```

with:

```tsx
        {text && (
          <MarkdownContent content={stripEvaluationMarkers(text)} className="text-xs [&_p]:text-xs [&_p]:text-zinc-400 [&_strong]:text-zinc-300" />
        )}
```

(The `{!text && isStreaming && ...}` placeholder above it is unchanged. Stripping is idempotent and safe to run on partial text during streaming.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/JudgeNotesCard.tsx
git commit -m "Strip leaked CONTINUE:/SCORES: markers from judge notes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Language-agnostic winner in History

**Files:**
- Modify: `app/history/page.tsx:22-28` (remove local `extractWinner`, import shared, parse scorecard)
- Modify: `app/history/[id]/page.tsx:10-14` (remove local `extractWinner`, import shared)

**Interfaces:**
- Consumes: `extractWinner` from `lib/verdict-utils.ts` (Task 2); `parseScorecard` from `lib/scorecard-parser.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the history list page**

In `app/history/page.tsx`, remove the local helper (lines 22-28):

```ts
function extractWinner(verdict: string): string | null {
  const match = verdict.match(/\*\*Winner:\s*(.+?)\*\*/);
  if (match) return match[1].trim();
  const match2 = verdict.match(/Winner:\s*(.+?)[\n\r*]/);
  if (match2) return match2[1].trim();
  return null;
}
```

Add these imports near the top (after the existing `import type { SavedDebate }...` line):

```ts
import { parseScorecard } from '@/lib/scorecard-parser';
import { extractWinner } from '@/lib/verdict-utils';
```

Then change the per-debate winner derivation (currently `const winner = extractWinner(debate.verdict);` inside the `.map`) to:

```ts
            const winner = extractWinner(debate.verdict, parseScorecard(debate.verdict));
```

- [ ] **Step 2: Update the saved-debate detail page**

In `app/history/[id]/page.tsx`, remove the local helper (lines 10-14):

```ts
function extractWinner(verdict: string): string | null {
  const match = verdict.match(/\*\*Winner:\s*(.+?)\*\*/);
  if (match) return match[1].trim();
  return null;
}
```

Add the import next to the existing `parseScorecard` import:

```ts
import { extractWinner } from '@/lib/verdict-utils';
```

The existing code already computes `const scorecard = parseScorecard(debate.verdict);` then `const winner = extractWinner(debate.verdict);`. Change the winner line to pass the scorecard:

```ts
  const winner = extractWinner(debate.verdict, scorecard);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors; no remaining local `extractWinner` definitions (the imported one is used in both files).

- [ ] **Step 4: Commit**

```bash
git add app/history/page.tsx app/history/[id]/page.tsx
git commit -m "Derive History winner from scorecard (language-agnostic)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Harden control markers for non-English debates

**Files:**
- Modify: `lib/prompts.ts` (add `markerInstruction` helper; append to the 3 judge-question returns and the 2 judge-evaluation returns)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (prompt text only).

- [ ] **Step 1: Add the helper**

In `lib/prompts.ts`, directly below the existing `languageInstruction` helper (lines 5-8), add:

```ts
// ── Helper: keep control markers in English even when writing in another language ─

function markerInstruction(language: string): string {
  if (!language || language.toLowerCase() === 'english') return '';
  return `\n\nIMPORTANT: Write the control labels exactly in English — "QUESTION:", "VERDICT:", "CONTINUE:", and "SCORES:" — even though the rest of your response is written in ${language}. Only these label words stay in English; the text after each label is in ${language}.`;
}
```

- [ ] **Step 2: Append it to every judge prompt return**

In `lib/prompts.ts`, each judge prompt currently ends its returned template with `${languageInstruction(language)}`. Append `${markerInstruction(language)}` immediately after it in these five `return` templates:

1. `judgeQuestionPrompt` — the continuation-challenge branch (ends `...Just the question.${languageInstruction(language)}`)
2. `judgeQuestionPrompt` — the first-round branch (ends `...Just the question.${languageInstruction(language)}`)
3. `judgeQuestionPrompt` — the follow-up branch (ends `...Just the question.${languageInstruction(language)}`)
4. `judgeEvaluationPrompt` — the last-round branch (ends `...for that option.${languageInstruction(language)}`)
5. `judgeEvaluationPrompt` — the normal branch (ends `...continue the debate.${languageInstruction(language)}`)

In each, change the trailing `${languageInstruction(language)}` to:

```
${languageInstruction(language)}${markerInstruction(language)}
```

Do **not** add it to the advocate prompt — advocates don't emit control markers.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/prompts.ts
git commit -m "Instruct judge to keep control markers in English in any language

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: EventSource reconnect resilience (SSE Last-Event-ID resume)

**Files:**
- Modify: `app/api/debate/stream/route.ts` (emit `id:` per event; honor `Last-Event-ID`)
- Modify: `app/debate/page.tsx` (track completion; don't close on transient error)

**Interfaces:**
- Consumes: `NextRequest` (already imported in the stream route) for header access.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Server — resume from Last-Event-ID and tag events with ids**

In `app/api/debate/stream/route.ts`, inside `start(controller)`, replace the not-found block, the `let cursor = 0;` line, and the drain/done enqueues. Specifically:

Replace the not-found handler:

```ts
      const entry = debateStore.get(id);
      if (!entry) {
        controller.enqueue(encoder.encode('data: {"type":"error","error":"Debate not found"}\n\n'));
        controller.close();
        return;
      }
```

with:

```ts
      const entry = debateStore.get(id);
      if (!entry) {
        controller.enqueue(encoder.encode('id: -1\ndata: {"type":"error","error":"Debate not found"}\n\n'));
        controller.close();
        return;
      }
```

Replace `let cursor = 0;` with the resume-aware cursor (place it after the abort-timer clear):

```ts
      // Resume support: browsers auto-reconnect and send Last-Event-ID (the index
      // of the last event they received). Resume after it so events are never
      // resent — otherwise a reconnect would duplicate rounds and streamed text.
      const lastEventId = req.headers.get('last-event-id');
      const parsedId = lastEventId ? parseInt(lastEventId, 10) : NaN;
      let cursor = Number.isFinite(parsedId)
        ? Math.min(Math.max(parsedId + 1, 0), entry.events.length)
        : 0;
```

Replace the drain enqueue:

```ts
        while (cursor < entry.events.length) {
          controller.enqueue(encoder.encode(entry.events[cursor]));
          cursor++;
        }
```

with (prefix each event with its index as the SSE id):

```ts
        while (cursor < entry.events.length) {
          controller.enqueue(encoder.encode('id: ' + cursor + '\n' + entry.events[cursor]));
          cursor++;
        }
```

Replace the done sentinel enqueue:

```ts
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
```

with:

```ts
          controller.enqueue(encoder.encode('id: ' + cursor + '\ndata: {"type":"done"}\n\n'));
```

(Each `entry.events[i]` is already a full `data: ...\n\n` block, so prepending `id: N\n` yields a valid `id: N\ndata: ...\n\n` SSE message.)

- [ ] **Step 2: Client — track completion and stop closing on transient errors**

In `app/debate/page.tsx`:

(a) Add a completion ref alongside the other refs (near `const verdictRef = useRef<HTMLDivElement>(null);`):

```ts
  const doneRef = useRef(false);
```

(b) In the `EventSource` effect, in the `'done'` case, set the ref before closing:

```ts
        case 'done':
          doneRef.current = true;
          setDone(true);
          setPhase('complete');
          setVerdictStreaming(false);
          es.close();
          break;
```

(c) In the `'error'` case, set the ref before closing:

```ts
        case 'error':
          doneRef.current = true;
          setDone(true);
          es.close();
          break;
```

(d) Replace the `es.onerror` handler:

```ts
    es.onerror = () => {
      es.close();
    };
```

with:

```ts
    es.onerror = () => {
      // Transient drop: let EventSource auto-reconnect. It resends Last-Event-ID
      // and the server resumes after the last delivered event, so no duplication.
      // Only stop retrying once the debate has actually finished.
      if (doneRef.current) es.close();
    };
```

(e) Update the cleanup to also mark done so an in-flight reconnect attempt is suppressed on unmount:

```ts
    return () => {
      doneRef.current = true;
      es.close();
    };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify reconnect survives an interruption (browser preview)**

Start a debate (Manual mode, 2 short options, model **Haiku** for speed, Auto-pilot ON). Once the first round is streaming:
- Interrupt the stream: in a terminal run `pkill -f "next dev"` then restart `npm run dev` — OR toggle the network in the preview. (Restarting the server drops the SSE connection.)
- Observe: after the server is back, the debate continues to a verdict. Use `preview_console_logs` to confirm no duplicate `round_start` and no doubled judge-question text in the UI (`preview_snapshot`).
Expected: the debate resumes and reaches a verdict; rounds are not duplicated.

- [ ] **Step 5: Commit**

```bash
git add app/api/debate/stream/route.ts app/debate/page.tsx
git commit -m "Survive transient stream drops via SSE Last-Event-ID resume

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Capstone verification (after all tasks)

Run one **non-English** debate end-to-end to confirm the multilingual + display fixes together:

- [ ] Home page → Manual mode → 2–3 options → **Language: Turkish** (or German) → model **Sonnet** or **Haiku** → **Auto-pilot ON** → Start.
- [ ] During rounds: judge notes read as clean prose — **no** `CONTINUE:` or `SCORES:` lines (`preview_snapshot`).
- [ ] At the verdict: a scorecard renders and the winner is highlighted.
- [ ] Open History → the debate appears with the 👑 crown on the winning option (`preview_snapshot`).
- [ ] Open the History detail page → crown shows there too, scorecard renders.
- [ ] `preview_inspect` body text → Geist font.
- [ ] (Reconnect already verified in Task 6 Step 4.)

If all pass, the branch is demo-ready. Final state lives on `polish/pre-video`; merging to `main` before recording is a separate step to confirm with the user.

## Self-review notes

- **Spec coverage:** font (T1), marker leak (T2+T3), winner detection (T2+T4), marker hardening (T5), reconnect (T6) — all four spec items covered; reconnect approach corrected and documented above.
- **Out-of-scope honored:** no tests/CI/lint, no concurrency cap, no context persistence, no Stop button, no dynamic rounds, no mobile — all deferred per spec.
- **Type consistency:** `extractWinner(verdict, scorecard?)` signature is identical in T2 (definition) and T4 (call sites); `stripEvaluationMarkers(text)` identical in T2 and T3; `Scorecard` shape matches `lib/scorecard-parser.ts`.
- **No new deps**, no marker-word changes — constraints respected.
