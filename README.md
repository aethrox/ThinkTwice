# ThinkTwice

**Stop guessing. Start debating.**

ThinkTwice is an AI-powered decision tool that doesn't just give you an answer — it stages a live debate between expert advocates arguing for each option, judged by a neutral AI evaluator. Watch the arguments unfold in real-time, then get a scored verdict.

## How It Works

```
You describe your decision
        |
   AI assigns expert advocates (one per option)
        |
   Live multi-round debate begins
   ├── Judge asks a focused question
   ├── Advocates research & argue (with web search)
   ├── Judge evaluates responses
   └── Repeat until verdict
        |
   Final scored verdict with recommendation
```

## Features

- **Smart Mode** — Describe your decision in plain text. AI extracts options, assigns domain experts, and runs the debate
- **Manual Mode** — Input 2-4 options directly for quick debates
- **Live Streaming** — Watch advocates research and argue in real-time with streaming text
- **Multi-Round Debates** — Up to 12 rounds of structured argumentation with judge evaluations after each round
- **Scored Verdicts** — Final comparison scorecard rating each option across key criteria (0-10)
- **Challenge the Verdict** — Disagree? Challenge it with your reasoning and the debate continues
- **Mid-Debate Clarifications** — The judge can pause to ask you questions that sharpen the analysis
- **Auto-Pilot Mode** — Skip all clarification questions and let the debate run fully autonomously
- **13+ Languages** — English, Turkish, German, French, Spanish, Italian, Portuguese, Dutch, Japanese, Korean, Chinese, Arabic, Russian, Hindi
- **Model Selection** — Choose between Claude Opus 4.8, Sonnet 4.6, or Haiku 4.5
- **Debate History** — All debates saved locally in your browser, replayable anytime

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Styling:** Tailwind CSS 4
- **AI:** Claude via CLI with streaming JSON output
- **Real-time:** Server-Sent Events (SSE)
- **Storage:** Browser localStorage (no database needed)

## Getting Started

### Prerequisites

1. **Node.js 18+**
2. **Claude CLI** installed and authenticated:
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude  # Follow the auth prompts
   ```

### Installation

```bash
git clone https://github.com/mmd19999/ThinkTwice.git
cd ThinkTwice
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start making better decisions.

### Production Build

```bash
npm run build
npm start
```

## Example Use Cases

- "Should I take the job at a startup or stay at my corporate role?"
- "MacBook Pro vs ThinkPad for a CS student on a budget?"
- "React Native vs Flutter vs native development for our MVP?"
- "Should we rent or buy in this market?"

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Home Page  │  │  Debate  │  │   History    │ │
│  │ (input)    │→ │ (stream) │→ │ (localStorage│ │
│  └───────────┘  └────┬─────┘  └──────────────┘ │
└───────────────────────┼─────────────────────────┘
                        │ SSE
┌───────────────────────┼─────────────────────────┐
│              Next.js API Routes                  │
│  ┌────────────────────┼──────────────────────┐  │
│  │            Orchestrator                    │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────┐ │  │
│  │  │  Judge   │ │Advocates │ │  Evaluator │ │  │
│  │  │ (Claude) │ │(Claude×N)│ │  (Claude)  │ │  │
│  │  └─────────┘ └──────────┘ └────────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Notes & Limitations

- **Runs as a single process.** Active debates are tracked in an in-memory store (`debateStore` / `continuationStore`), and each debate spawns a local `claude` CLI subprocess. This means the app is designed to run as a single Node instance (local or a single long-lived server) — it is **not** suited to multi-instance or serverless deployments, where a debate started on one instance won't be visible to another and the `claude` binary may be absent. In-flight debates are also lost on restart.
- **Models are pinned** to current Claude versions: `opus → claude-opus-4-8`, `sonnet → claude-sonnet-4-6`, `haiku → claude-haiku-4-5` (see `lib/claude-runner.ts`).

## License

MIT

---

Built with Claude
