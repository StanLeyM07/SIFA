import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { chat } from "../lib/llm.js";

/**
 * The coach turns a pre-computed fact sheet into a short read on someone's
 * month. It never sees a transaction, a merchant name, or anything
 * identifying — only aggregates the frontend already calculated.
 *
 * Two defences, because a small model will confidently state a wrong figure
 * no matter how firmly the prompt forbids it:
 *
 *  1. The surplus/deficit call is computed upstream and handed over as
 *     `verdict`. The model is never asked to work out whether someone
 *     overspent — it gets told, and writes prose around it.
 *  2. Every number in the response is checked against the fact sheet before
 *     it is returned. Invented figures fail the request, and the dashboard
 *     falls back to its deterministic insights, which are always correct.
 */

const FactSheet = z.object({
  month: z.string().max(40),
  verdict: z.enum(["surplus", "deficit", "breakeven", "no-income-recorded"]),
  income: z.number(),
  expenses: z.number(),
  net: z.number(),
  savingsRatePct: z.number().nullable(),
  transactionCount: z.number(),
  topCategories: z
    .array(
      z.object({
        category: z.string().max(40),
        amount: z.number(),
        pctOfSpend: z.number(),
      }),
    )
    .max(5),
  movers: z
    .array(
      z.object({
        category: z.string().max(40),
        amount: z.number(),
        average: z.number(),
        changePct: z.number(),
      }),
    )
    .max(3),
  previousMonth: z
    .object({ income: z.number(), expenses: z.number(), net: z.number() })
    .nullable(),
  bills: z
    .object({
      pendingCount: z.number(),
      pendingTotal: z.number(),
      overdueCount: z.number(),
    })
    .nullable(),
  goals: z
    .array(
      z.object({
        name: z.string().max(60),
        target: z.number(),
        current: z.number(),
        monthly: z.number(),
        monthsLeft: z.number().nullable(),
      }),
    )
    .max(3),
});

type Facts = z.infer<typeof FactSheet>;

const VERDICT_LINE: Record<Facts["verdict"], string> = {
  surplus:
    'This person spent LESS than they earned. They have money left over. Do NOT say they overspent, are short, or are spending more than they earn — that would be false.',
  deficit:
    'This person spent MORE than they earned. They are short this month. Say so directly.',
  breakeven:
    'This person spent almost exactly what they earned. Nothing left over, but not short either.',
  "no-income-recorded":
    'No income is recorded this month. Do NOT mention savings rate, percentage of income, or whether they overspent — there is nothing to compare against. Talk about where the money went instead.',
};

const COACH_SYSTEM = `You are Sifa, a financial coach inside a South African money app. You read one person's month and tell them what actually matters in it.

## What you receive
A DATA block of figures ALREADY calculated from the user's transactions, and a VERDICT stating whether they came out ahead or behind. Every number is final.

## Rules about numbers — these are absolute
- Use ONLY numbers that appear verbatim in DATA. Copy them exactly.
- NEVER add, subtract, calculate, estimate, project, or round any number.
- NEVER state a target, saving, or shortfall amount that is not already in DATA.
- If a point would need a number that isn't in DATA, make the point without a number.
- Your response is automatically rejected if it contains a number that is not in DATA. Say less rather than risk it.

## Rules about the verdict
- The VERDICT is the truth. Never contradict it, and never restate it backwards.
- Never invent merchants, shops, dates or transactions — you are given none.

## How to write
- Address them as "you". No greeting, no sign-off, never mention being an AI.
- Rands, written like R1 250 or R18 400. Never $ or "ZAR".
- Plain words. No "budget optimisation", "discretionary spend", "financial wellness", "runway".
- Be concrete. "Eating out went from R750 to R3 200" beats "spending increased notably".
- Don't moralise, lecture or over-congratulate. Don't tell them to make a budget.
- One doable action at the end, tied to a real figure from DATA.

## Lead with whichever applies first
1. Overdue bills
2. A deficit month
3. A category that moved sharply against its own average
4. Goal progress
5. Otherwise: say the month looks steady and name the largest category

## Output
Return ONLY this JSON object, no markdown fence, no commentary:
{"headline":"...","body":"...","action":"..."}

- headline: max 60 characters, the single most important thing
- body: 2-3 sentences
- action: one sentence`;

/**
 * Every figure the model is allowed to say, with the rounded variants a
 * writer might reasonably produce.
 */
function allowedNumbers(f: Facts): Set<number> {
  const out = new Set<number>();
  const add = (n: number | null | undefined) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return;
    const abs = Math.abs(n);
    out.add(abs);
    out.add(Math.round(abs));
  };

  add(f.income);
  add(f.expenses);
  add(f.net);
  add(f.savingsRatePct);
  add(f.transactionCount);
  for (const c of f.topCategories) {
    add(c.amount);
    add(c.pctOfSpend);
  }
  for (const m of f.movers) {
    add(m.amount);
    add(m.average);
    add(m.changePct);
  }
  if (f.previousMonth) {
    add(f.previousMonth.income);
    add(f.previousMonth.expenses);
    add(f.previousMonth.net);
  }
  if (f.bills) {
    add(f.bills.pendingCount);
    add(f.bills.pendingTotal);
    add(f.bills.overdueCount);
  }
  for (const g of f.goals) {
    add(g.target);
    add(g.current);
    add(g.monthly);
    add(g.monthsLeft);
  }
  return out;
}

/** Pull every numeric token out of prose, handling "R41 000" and "1 234,56". */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d\s,.]*/g) ?? [];
  const out: number[] = [];
  for (const raw of matches) {
    const cleaned = raw.trim().replace(/[\s,]/g, "");
    const n = Number(cleaned.replace(/\.$/, ""));
    if (Number.isFinite(n)) out.push(Math.abs(n));
  }
  return out;
}

/**
 * Reject any response containing a figure that isn't in the fact sheet.
 * Values of 12 or under are let through — they're months, counts and ordinals
 * rather than money, and being strict there produces false rejections.
 */
function findInventedNumber(text: string, allowed: Set<number>): number | null {
  for (const n of extractNumbers(text)) {
    if (n <= 12) continue;
    let ok = false;
    for (const a of allowed) {
      if (Math.abs(a - n) <= 1) {
        ok = true;
        break;
      }
    }
    if (!ok) return n;
  }
  return null;
}

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const parsed = FactSheet.safeParse(req.body?.facts);
  if (!parsed.success) {
    console.warn(
      "[ai/coach] rejected fact sheet:",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
    res.status(400).json({ error: "Invalid fact sheet." });
    return;
  }

  const facts = parsed.data;

  if (facts.transactionCount < 3) {
    res.json({
      headline: "Not enough data yet",
      body: "Import a statement or add a few more transactions and Sifa will start reading your month properly.",
      action: "Import your latest bank statement to get started.",
    });
    return;
  }

  const allowed = allowedNumbers(facts);
  const userPrompt = `VERDICT: ${VERDICT_LINE[facts.verdict]}\n\nDATA:\n${JSON.stringify(facts, null, 2)}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await chat(
        [
          { role: "system", content: COACH_SYSTEM },
          {
            role: "user",
            content:
              attempt === 1
                ? userPrompt
                : `${userPrompt}\n\nYour previous answer contained a number that was not in DATA, or contradicted the VERDICT. Rewrite it using only figures copied from DATA.`,
          },
        ],
        { temperature: attempt === 1 ? 0.4 : 0.1, maxTokens: 400 },
      );

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const out = JSON.parse(match[0]) as {
        headline?: string;
        body?: string;
        action?: string;
      };
      if (!out.headline || !out.body) continue;

      const combined = `${out.headline} ${out.body} ${out.action ?? ""}`;
      const invented = findInventedNumber(combined, allowed);
      if (invented !== null) {
        console.warn(
          `[ai/coach] attempt ${attempt} rejected — invented figure ${invented}`,
        );
        continue;
      }

      res.json({
        headline: String(out.headline).slice(0, 120),
        body: String(out.body).slice(0, 600),
        action: out.action ? String(out.action).slice(0, 200) : "",
      });
      return;
    } catch (err) {
      console.error(`[ai/coach] attempt ${attempt} failed:`, err);
      break;
    }
  }

  // Verification failed. The dashboard's computed insights are correct by
  // construction, so falling back is strictly better than shipping a wrong number.
  res.status(503).json({ error: "Coach unavailable." });
});

export default router;
