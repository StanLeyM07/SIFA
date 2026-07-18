import OpenAI from "openai";

/**
 * Provider-agnostic LLM client.
 *
 * Swap providers by changing three env vars:
 *   LLM_BASE_URL — the OpenAI-compatible endpoint
 *   LLM_API_KEY  — the API key for that provider
 *   LLM_MODEL    — the model identifier
 *
 * Works with NVIDIA NIM, OpenAI, OpenRouter, Groq and Ollama unchanged.
 */

const BASE_URL = process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const API_KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "meta/llama-3.1-70b-instruct";

/** Hard ceiling on calls per UTC day, across all users. */
const DAILY_CALL_LIMIT = parseInt(process.env.LLM_DAILY_CALL_LIMIT || "500", 10);

if (!API_KEY) {
  console.warn("[llm] LLM_API_KEY is not set — the coach will be unavailable.");
}

export const llmClient = new OpenAI({
  baseURL: BASE_URL,
  apiKey: API_KEY,
  fetch: globalThis.fetch,
  defaultHeaders: { "Accept-Encoding": "identity" },
});

export class BudgetExceededError extends Error {
  constructor() {
    super("Daily LLM call budget exhausted.");
    this.name = "BudgetExceededError";
  }
}

// In-memory budget. Resets on restart, which is fine for a single instance —
// the point is catching a runaway loop or a scraper, not exact accounting.
let budgetDay = new Date().toISOString().slice(0, 10);
let callsToday = 0;

function consumeBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) {
    budgetDay = today;
    callsToday = 0;
  }
  if (callsToday >= DAILY_CALL_LIMIT) throw new BudgetExceededError();
  callsToday++;
}

export function budgetStatus() {
  return { used: callsToday, limit: DAILY_CALL_LIMIT, day: budgetDay };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

/** Transient transport and provider-side faults are worth retrying; a 400 is not. */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === undefined) return true; // network-level failure
  return status === 408 || status === 429 || status >= 500;
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  if (!API_KEY) throw new Error("LLM_API_KEY is not configured.");
  consumeBudget();

  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await llmClient.chat.completions.create({
        model: MODEL,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 800,
        stream: false,
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === maxAttempts) break;
      console.warn(`[llm] attempt ${attempt} failed, retrying:`, (err as Error).message);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastError;
}

export function getModelInfo() {
  return {
    baseUrl: BASE_URL,
    model: MODEL,
    provider: BASE_URL.includes("nvidia")
      ? "NVIDIA NIM"
      : BASE_URL.includes("openai.com")
        ? "OpenAI"
        : BASE_URL.includes("openrouter")
          ? "OpenRouter"
          : BASE_URL.includes("groq")
            ? "Groq"
            : BASE_URL.includes("localhost")
              ? "Local (Ollama)"
              : "Custom",
  };
}
