import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import coachRoutes from "./routes/coach.js";
import { getModelInfo, budgetStatus } from "./lib/llm.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

/**
 * Allowed browser origins. Defaults to local dev; set FRONTEND_ORIGIN to a
 * comma-separated list in production. A wildcard here would leave the only
 * paid endpoint open to the whole internet.
 */
const ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.set("trust proxy", 1);

class OriginNotAllowedError extends Error {
  constructor() {
    super("Origin not allowed");
    this.name = "OriginNotAllowedError";
  }
}

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin/curl requests have no Origin header; allow those through
      // so health checks work, but browsers are held to the allow-list.
      if (!origin || ORIGINS.includes(origin)) return cb(null, true);
      cb(new OriginNotAllowedError());
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);

// Fact sheets are small; anything larger is not a fact sheet.
app.use(express.json({ limit: "64kb" }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Rate limiting ───────────────────────────────────────────
// The coach is the only endpoint that costs money per call, so it gets a
// tighter budget than the rest of the surface.
const coachLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again in a bit." },
});

app.use("/api/coach", coachLimiter, coachRoutes);

// ── Health ──────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const llm = getModelInfo();
  const budget = budgetStatus();
  res.json({
    status: "ok",
    service: "sifa-backend",
    llmProvider: llm.provider,
    llmModel: llm.model,
    callsToday: budget.used,
    dailyLimit: budget.limit,
    timestamp: new Date().toISOString(),
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // A blocked origin is a client error, not a server fault. Answering 403
  // quietly also keeps the logs readable once bots start probing the host.
  if (err instanceof OriginNotAllowedError) {
    res.status(403).json({ error: "Origin not allowed." });
    return;
  }
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () => {
  const llm = getModelInfo();
  console.log(`
┌─────────────────────────────────────────┐
│  SIFA Backend                           │
│  Port:     ${String(PORT).padEnd(28)}│
│  Origins:  ${ORIGINS.join(",").slice(0, 28).padEnd(28)}│
│  LLM:      ${llm.provider.padEnd(28)}│
│  Model:    ${llm.model.slice(0, 28).padEnd(28)}│
└─────────────────────────────────────────┘
  `);
});
