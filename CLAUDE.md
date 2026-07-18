# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The live code lives in `app/src/`, split into two independently-installed npm packages:

- `app/src/frontend/` — TanStack Start (React 19 + Vite) SPA/SSR app, port **5174**
- `app/src/backend/` — Express 5 API, port **3001**

Note: `app/` is currently untracked while the repo restructures — the git-tracked tree still holds the old flat Lovable-era layout at the root. Work in `app/src/`, not the tracked root files.

## Commands

Run from `app/src/frontend/` or `app/src/backend/` respectively — there is no root workspace or shared install.

```bash
# frontend
npm run dev        # vite dev on :5174
npm run build      # vite build (SSR + client into dist/)
npm run lint       # eslint
npm run format     # prettier --write .

# backend
npm run dev        # tsx watch src/index.ts on :3001
npm run typecheck  # tsc --noEmit
npm run build      # tsc
```

There is no test suite. Verify changes by running both dev servers and driving the flow in the browser.

Both packages need env files (copy `app/src/backend/.env.example` → `.env`): backend needs `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`; frontend needs `VITE_API_URL` (defaults to `http://localhost:3001`).

## Architecture

**All user data is client-side.** Transactions, goals, bills, invoices, widgets, and the license live in `localStorage` via `frontend/src/lib/sifa/storage.ts`. The backend is stateless — it holds no user data and no database. Don't add server-side persistence without discussing it.

**Data flow:** route component → `useSifa()` (`lib/sifa/context.tsx`) → `lib/sifa/services/*.service.ts` → `storage.ts` and/or `fetch(VITE_API_URL)`.

`context.tsx` is the single source of truth for app state: it hydrates from storage on mount, holds every entity array, and exposes all mutators. Routes should never touch `storage` directly — go through the context. The `hydrated` flag gates rendering because storage is unavailable during SSR (`safeGet` returns fallbacks when `window` is undefined).

**Service layer resilience pattern:** every service that calls the backend falls back to a local stub when the backend is unreachable (`auth.service.ts` → `localActivateLicense`, `insights.service.ts` → `askSifaStub`). Keep this pattern when adding services — the app must stay usable offline. Note the deliberate asymmetry in `auth.service.ts`: a backend response saying *invalid* returns null, only a network failure falls back.

**Tier gating** is driven by `FEATURES` in `frontend/src/lib/sifa/types.ts` (starter / pro / business). Gate UI with `features.<flag>` from the context, wrapped in `<LockedOverlay>` rather than hiding it. Licenses are validated by the backend against the flat file `backend/data/keys.json` — no user accounts exist.

**LLM access** is provider-agnostic: `backend/src/lib/llm.ts` wraps the OpenAI SDK pointed at any OpenAI-compatible `LLM_BASE_URL` (NVIDIA NIM by default; OpenAI/OpenRouter/Groq/Ollama all work by swapping the three env vars). `chat()` retries 3× with a 2s backoff; `chatStream()` backs the SSE `/api/ai/ask` endpoint.

**API surface:** `POST /api/auth/activate`, `POST /api/ai/upload-statement` (PDF/CSV multipart, 5MB cap), `POST /api/ai/categorize`, `POST /api/ai/ask` (SSE), plus `/api/health` on each router.

### Category list is duplicated on purpose

`CATEGORIES` appears in both `frontend/src/lib/sifa/types.ts` and `backend/src/routes/ai.ts` (where it's interpolated into the LLM prompts). The packages share no code — **edit both** or the AI will emit categories the UI can't render.

## Frontend conventions

- Routing is TanStack Router **file-based**: `src/routes/_app.*.tsx` are the authenticated tabs under the `_app` layout, which redirects to `/activate` when no license is present. `routeTree.gen.ts` is generated — never edit it.
- shadcn/ui (new-york style) in `src/components/ui/`; app-specific components in `src/components/sifa/`. Import via the `@/` alias.
- Tailwind v4 with a custom palette defined in `src/styles.css` `@theme`: use the semantic tokens (`bg-paper`, `text-ink`, `border-hair`, `text-emerald`, `gold`, `brick`) and `font-display` (Fraunces) / `font-sans` (IBM Plex Sans) rather than raw Tailwind colors.
- Product voice is South African: Rands (R), local merchant names, "Sifa" as a warm companion rather than an advisor. The LLM system prompts in `backend/src/routes/ai.ts` encode this — keep copy consistent with them.

## Lovable

This project is connected to [Lovable](https://lovable.dev). Don't rewrite published git history (no force-push, rebase, amend, or squash of pushed commits) — it desyncs Lovable's copy and can lose project history. Pushed commits sync back into the Lovable editor, so keep the branch working.
