# Sifa

A South African personal finance app. You drop in a bank statement; it reads it,
sorts every transaction, and tells you what actually happened to your money.

No manual data entry. No spreadsheet. Nothing uploaded.

---

## How someone actually uses it

1. Download a statement from their banking app (CSV preferred, PDF works)
2. Drag it onto the import screen
3. Sifa parses and categorises it **in the browser**, then shows a review table
4. They fix anything wrong — Sifa remembers those corrections permanently
5. The dashboard tells them what stands out

Step 4 is the compounding bit. People shop at the same twenty places, so after
a couple of imports the categoriser is effectively tuned to that person and
corrections stop being necessary.

## Structure

```
app/src/frontend/   TanStack Start + React 19 + Tailwind v4   (port 5174)
app/src/backend/    Express — one endpoint, the AI coach       (port 3001)
```

The backend does one job: turn a sheet of pre-computed figures into a
paragraph of prose. Everything else — parsing, categorising, every metric —
runs client-side.

### Commands

```bash
# frontend
cd app/src/frontend
npm install && npm run dev      # http://localhost:5174
npm run build                   # production build
npx tsc --noEmit                # typecheck

# backend
cd app/src/backend
npm install && npm run dev      # http://localhost:3001
npm run typecheck
```

### Tests

Dependency-free smoke suites, runnable with `tsx`:

```bash
cd app/src/frontend/src/lib/sifa
npx tsx import/parse.smoke.ts        # date/amount/CSV parsing
npx tsx categorize/smoke.ts          # merchant matching + correction learning
npx tsx coach/facts.smoke.ts         # metric correctness + privacy assertions
npx tsx insights.smoke.ts            # deterministic insight rules

cd app/src/backend/src/routes
npx tsx coach.smoke.ts               # anti-hallucination guard
```

## The two things that make this trustworthy

### Statements never leave the device

`pdfjs-dist` and PapaParse run in the browser. The file is never uploaded, so
account numbers, addresses and balances physically cannot reach a server.
This is a real claim the UI makes, and it has to stay true — don't add a
server-side upload path.

### The AI cannot state a wrong number

Financial advice built on a hallucinated figure is worse than none. Two
defences, both necessary — during development the model produced *"You're
overspending by R11 001"* for a month with R7 101 **left over**:

1. **The verdict is pre-computed.** `facts.ts` decides surplus vs deficit and
   passes it in. The model is never asked to work that out.
2. **Every number is verified.** `coach.ts` extracts each figure from the
   response and checks it against the fact sheet. Invented figures fail the
   request, and the dashboard falls back to deterministic insights that are
   correct by construction.

The model also only ever receives **aggregates** — never transactions, merchant
names or dates. That keeps the promise above intact and makes the prompt a few
hundred tokens instead of a few thousand.

## Deploying

### Frontend — Vercel / Netlify

- Root: `app/src/frontend`
- Build: `npm run build`
- Env: `VITE_API_URL=https://your-api-host`

### Backend — Render / Railway / Fly

- Root: `app/src/backend`
- Start: `npm start`
- Env: copy `.env.example`, then set at minimum:
  - `FRONTEND_ORIGIN` — your real frontend origin. **Never a wildcard.**
  - `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`
  - `LLM_DAILY_CALL_LIMIT` — global daily ceiling

Health check: `GET /api/health` reports provider, model and calls used today.

### Before going live

- [ ] `FRONTEND_ORIGIN` set to the real domain
- [ ] Billing alerts on the LLM provider
- [ ] Privacy policy + POPIA notice (financial data, even client-side)
- [ ] Analytics (Plausible/Umami) — the point of a free launch is learning
      whether people return; without it you learn nothing

## Cost and the path to R20k/month

Running cost is dominated by hosting, not inference, because the coach is
cached against a fingerprint of the figures — a call only fires when the
numbers actually move, roughly 2–5 times per user per month.

At Groq `llama-3.1-8b-instant` prices a ~700-token call is a fraction of a
cent, so 200 users is a rounding error. Realistic fixed cost is hosting:
roughly R300–500/month.

To clear **R20 000/month recurring**:

| Price/month | Subscribers needed |
|---|---|
| R79  | 253 |
| R99  | 202 |
| R149 | 135 |

R99 × ~200 subscribers is the most plausible target. At a 3–5% free-to-paid
conversion that implies roughly 4 000–6 500 active free users, so the free
period needs to be measured properly — track activation (imported ≥1
statement), D7/D30 return rate, and imports per user.

Gross margin is well above 90%, so the constraint is distribution, not cost.

### What to charge for later

The tier scaffolding was deliberately removed rather than left half-wired.
When monetising, the natural paid line is **multi-device sync and history** —
things that need a server and that people feel the absence of — not the
categorisation or insights, which are what make the app worth returning to.

Note that everything currently lives in `localStorage`. That's fine for a free
test, but it means no cross-device access and a cleared browser wipes the
data. Settings has prominent export for exactly that reason. Server-side sync
(Supabase schema is drafted in `supabase/migrations/`) is the natural next
build and the obvious first paid feature.
