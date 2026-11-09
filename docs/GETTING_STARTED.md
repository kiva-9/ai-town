# Run AI Town Enhanced

## Requirements

Node.js 20 or 22, npm, and a normal local environment that permits a local Convex backend. No OpenAI account or API key is needed for Mock. Keep the original MIT license and credits.

```sh
git clone https://github.com/kiva-9/ai-town.git
cd ai-town
git checkout feature/hybrid-npc-intelligence
npm ci
```

## Cost-free, real Convex-backed game

In terminal 1, start an account-free local development backend. This downloads the official Convex binary, deploys your functions, and writes local-only configuration:

```sh
CI=1 CONVEX_AGENT_MODE=anonymous npx convex dev
```

Keep it running. After functions are ready, in terminal 2:

```sh
npx convex env set NPC_DECISION_MODE mock
npx convex env set NPC_DIALOGUE_MOCK true
npx convex env set NPC_LANGUAGE zh-CN
npx convex env set NPC_ALLOW_MODE_CONTROL true
npx convex run init '{"numAgents":12}'
npm run dev:frontend
```

Open the URL Vite prints, normally **http://localhost:5173/ai-town/**. Select a resident to see the expandable NPC Intelligence panel. The map and conversation controls are the original game. Mock dialogue is visibly prefixed `【模拟对话】` by default (`[Mock dialogue]` with `NPC_LANGUAGE=en`); it is intentionally a fixture, not an LLM simulation.

`NPC_ALLOW_MODE_CONTROL=true` allows anyone with access to that deployment to switch its global policy. Use it only on a trusted local deployment. Turn it off on public deployments unless you add owner-only authentication. Classic retains original behavior, but dialogue fixtures are controlled independently by `NPC_DIALOGUE_MOCK`.

The frontend needs `VITE_CONVEX_URL`. The Convex setup normally writes it to `.env.local`; if using self-hosted Convex, set it to your backend URL. Never put API keys in any `VITE_` variable.

### Alternative backend

Use the original README's Docker Compose/self-hosted Convex instructions if your local CLI cannot start a backend. A managed cloud Convex project is also supported, but is optional and may have usage charges. No cloud service is provisioned by this repository.

In the development sandbox used for validation, automatic port detection was unavailable. An official self-hosted backend with explicit ports and the standard Convex action runtime was successfully used instead. This is an environment limitation, not a requirement to use a third-party fork. Details are in `VALIDATION.md`.

## Enable actual Decisions

1. Keep `NPC_DIALOGUE_MOCK=true` initially to isolate decision costs from full dialogue costs.
2. Set a server-side `OPENAI_API_KEY` in Convex's environment-variable UI or secure local CLI prompt. Never commit credentials.
3. Verify current [official Decisions pricing](https://developers.openai.com/api/docs/guides/decisions), then configure all four token rate variables from `.env.example`. Blank or invalid prices disable calls. Output may be free, but enter an explicit verified zero rather than leaving it blank.
4. Set `DECISIONS_MODEL=gpt-6-luna`, conservative request/budget settings, and `NPC_DECISION_MODE=hybrid`. If a persisted mode already exists, use the local guarded selector to change it. `NPC_DECISION_ENABLED=false` is the server kill switch.
5. Observe `source=decisions`, response probabilities and usage in the inspector. Missing key, refusal, insufficient confidence, timeout, quota and invalid responses fall back safely.

The monetary budget is a conservative admission estimate. Configure an OpenAI project spending limit as an additional control. Pausing stops new decisions, but cannot refund requests already sent.

### Optional live smoke test

This is skipped unless explicitly opted in. Export the server key and verified pricing only into your private shell environment, then run:

```sh
NPC_LIVE_SMOKE=1 npm run smoke:decisions
```

It makes one small request with Choice, Predicate and Score, no retries, and prints structured results/usage without the key. Missing credentials exit with a clearly labeled skip. It is not part of CI.

### Real dialogue and vector memory

Disable `NPC_DIALOGUE_MOCK` only after configuring the original LLM/embedding provider following the upstream README. Decisions and dialogue have separate responsibilities and costs. If you use Ollama for dialogue while supplying an OpenAI decision key, explicitly set `LLM_PROVIDER=ollama` so the original auto-detection does not switch providers. For original OpenAI dialogue, follow upstream's embedding-dimension instructions **before initializing vector data**; do not silently change dimensions in an existing database.

## Verify and compare

```sh
npm test -- --runInBand
npm run build
npm run lint
npm run evaluate:npcs -- --seed 42 --steps 120 --out evaluation-output
```

The last command writes JSON and Markdown with repeatable initial state/events. Its Hybrid strategy is explicitly labeled utility fallback when no live provider is supplied. It does not claim to prove subjective naturalness or emulate the full rendered world. See `EVALUATION.md`.

## Pause, resume and preserve data

Use upstream `npx convex run testing:stop` and `npx convex run testing:resume` commands for your selected deployment. Never use wipe functions on data you want to retain. Existing worlds load new optional fields lazily; `init` does not replace existing residents. Fresh worlds receive twelve residents.

All local backend databases, generated credentials and `.env.local` are ignored by Git. Do not upload them. Share only repository code and explicitly reviewed non-sensitive reports.
