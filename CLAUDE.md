# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The live code lives in `app/src/`, split into two independently-installed npm packages:

- `app/src/frontend/` — TanStack Start (React 19 + Vite) SPA/SSR app, port **5174**
- `app/src/backend/` — Express 5 API, port **3001**

`app/` is fully tracked (74 files). The old flat Lovable-era layout at the root is gone. Work in `app/src/`.

## Commands

Run from `app/src/frontend/` or `app/src/backend/` respectively — there is no root workspace or shared install. See each package's `package.json` for its scripts.

**There are seven smoke suites.** `npm test` in `app/src/frontend` runs six; `npm test` in `app/src/backend` runs the anti-hallucination guard. Both run in CI (`.github/workflows/ci.yml`) on every push and PR, alongside `npm run typecheck` and a production build. Run them before pushing. They are plain `tsx` scripts that assert and exit non-zero, with no framework.

Both packages need env files (copy `app/src/backend/.env.example` → `.env`): backend needs `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`; frontend needs `VITE_API_URL` (defaults to `http://localhost:3001`). **The app works with the backend absent** — the dashboard falls back to deterministic insights — so a missing key degrades the coach, it does not break the build or the flow.

## Architecture

**All user data is client-side.** Transactions, goals, bills and widgets live in `localStorage` via `frontend/src/lib/sifa/storage.ts`. The backend is stateless — it holds no user data and no database. Don't add server-side persistence without discussing it.

**Data flow:** route component → `useSifa()` (`lib/sifa/context.tsx`) → `lib/sifa/services/*.service.ts` → `storage.ts` and/or `fetch(VITE_API_URL)`.

`context.tsx` is the single source of truth for app state: it hydrates from storage on mount, holds every entity array, and exposes all mutators. Routes should never touch `storage` directly — go through the context. The `hydrated` flag gates rendering because storage is unavailable during SSR (`safeGet` returns fallbacks when `window` is undefined).

**Service layer resilience pattern:** every service that calls the backend falls back to a local stub when the backend is unreachable (`insights.service.ts` → `askSifaStub`). Keep this pattern when adding services — the app must stay usable offline, and Render's free tier sleeps after ~15 minutes idle, so an unreachable backend is the normal case rather than the exception. The live services are `bills`, `categorize`, `goals`, `insights` and `transactions`.

**There is no tier gating, no licence and no auth.** The `FEATURES` map, `<LockedOverlay>`, `auth.service.ts` and `backend/data/keys.json` were all removed rather than left half-wired, and nothing in the tree references them. The app is entirely free and unauthenticated. Do not reintroduce gating without discussing it; the README records why it was pulled and what the natural first paid feature would be instead.

**LLM access** is provider-agnostic: `backend/src/lib/llm.ts` wraps the OpenAI SDK pointed at any OpenAI-compatible `LLM_BASE_URL` (OpenAI/OpenRouter/Groq/Ollama/NVIDIA NIM all work by swapping the three env vars). `chat()` retries with backoff.

**Every number the model emits is verified before it reaches the user.** `routes/coach.ts` extracts each figure from the response and checks it against the pre-computed fact sheet; invented figures fail the request and the UI falls back to deterministic insights. This is the single most important invariant in the codebase — see the README. Do not weaken it.

**API surface is two endpoints:** `POST /` (the coach) and `GET /api/health`. That is the whole backend. Parsing, categorising and every metric run client-side — the backend only turns a sheet of pre-computed figures into prose, and receives aggregates only, never transactions, merchant names or dates.

### The category list is no longer duplicated

`CATEGORIES` lives in **one** place, `frontend/src/lib/sifa/types.ts`. This section used to say it was mirrored into `backend/src/routes/ai.ts` and that both must be edited. **That file no longer exists** — the backend never sees a category now, because categorisation moved fully client-side and the coach receives only aggregates. Do not go looking for a second copy.

## Frontend conventions

- Routing is TanStack Router **file-based**: `src/routes/_app.*.tsx` are the app tabs under the `_app` layout (dashboard, transactions, trends, bills, goals, import, settings). There is no auth gate and no `/activate` route. `routeTree.gen.ts` is generated — never edit it.
- shadcn/ui (new-york style) in `src/components/ui/`; app-specific components in `src/components/sifa/`. Import via the `@/` alias.
- Tailwind v4 with a custom palette defined in `src/styles.css` `@theme`: use the semantic tokens (`bg-paper`, `text-ink`, `border-hair`, `text-emerald`, `gold`, `brick`) and `font-display` (Fraunces) / `font-sans` (IBM Plex Sans) rather than raw Tailwind colors.
- Product voice is South African: Rands (R), local merchant names, "Sifa" as a warm companion rather than an advisor. The LLM system prompts in `backend/src/routes/ai.ts` encode this — keep copy consistent with them.

## Lovable

This project is connected to [Lovable](https://lovable.dev). Don't rewrite published git history (no force-push, rebase, amend, or squash of pushed commits) — it desyncs Lovable's copy and can lose project history. Pushed commits sync back into the Lovable editor, so keep the branch working.
