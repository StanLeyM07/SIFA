import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  FileSpreadsheet,
  ArrowRight,
} from "lucide-react";
import { formatZAR, useSifa } from "@/lib/sifa/context";
import { parseStatement, type ParsedRow } from "@/lib/sifa/import/parse-statement";
import { categorizeAll, type CategorizedRow } from "@/lib/sifa/categorize/engine";
import { recordCorrections } from "@/lib/sifa/services/categorize.service";
import { storage } from "@/lib/sifa/storage";
import { CATEGORIES } from "@/lib/sifa/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/import")({
  component: ImportPage,
});

type Stage = "idle" | "reading" | "review" | "done";

/** A row already in the ledger with the same date, amount and description is
 *  almost certainly a re-import — but two identical coffees on one day are
 *  real, so this flags rather than blocks. */
function duplicateKey(r: { date: string; description: string; amount: number }) {
  return `${r.date}|${Math.round(r.amount * 100)}|${r.description.trim().toUpperCase()}`;
}

function ImportPage() {
  const { addTransactions, transactions } = useSifa();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<CategorizedRow[]>([]);
  const [originals, setOriginals] = useState<CategorizedRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const existingKeys = useMemo(
    () => new Set(transactions.map(duplicateKey)),
    [transactions],
  );

  const duplicateCount = useMemo(
    () => rows.filter((r) => existingKeys.has(duplicateKey(r))).length,
    [rows, existingKeys],
  );

  const totals = useMemo(() => {
    const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
    const expenses = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    const needsReview = rows.filter((r) => r.confidence < 0.9).length;
    return { income, expenses, needsReview };
  }, [rows]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setWarning(null);
      setFileName(file.name);
      setStage("reading");

      try {
        const result = await parseStatement(file);

        if (result.warning) setWarning(result.warning);

        if (result.rows.length === 0) {
          setError(
            result.warning ??
              "No transactions found in that file. If it's a PDF, try downloading the CSV version from your banking app.",
          );
          setStage("idle");
          return;
        }

        const corrections = storage.getMerchantRules() as Record<string, never>;
        const summary = categorizeAll(result.rows as ParsedRow[], corrections);

        // Unrecognised rows first — the ones a human actually needs to look at.
        const sorted = [...summary.rows].sort((a, b) => a.confidence - b.confidence);

        setRows(sorted);
        setOriginals(sorted);
        setSkipped(result.skipped);
        setStage("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read that file.");
        setStage("idle");
      }
    },
    [],
  );

  const updateRow = (index: number, patch: Partial<CategorizedRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  function confirmImport() {
    const toImport = skipDuplicates
      ? rows.filter((r) => !existingKeys.has(duplicateKey(r)))
      : rows;

    recordCorrections(rows, originals);
    addTransactions(
      toImport.map((r) => ({
        date: r.date,
        description: r.description,
        category: r.category,
        amount: r.amount,
        type: r.type,
      })),
    );
    storage.setOnboarded(true);
    setStage("done");
    toast(`${toImport.length} transactions imported.`);
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  function reset() {
    setStage("idle");
    setRows([]);
    setOriginals([]);
    setFileName("");
    setError(null);
    setWarning(null);
    setSkipped(0);
  }

  // ── Done ───────────────────────────────────────────────────
  if (stage === "done") {
    const imported = skipDuplicates
      ? rows.filter((r) => !existingKeys.has(duplicateKey(r))).length
      : rows.length;
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald/10">
          <CheckCircle2 className="h-8 w-8 text-emerald" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-semibold">
          {imported} transactions in
        </h1>
        <p className="mt-2 text-muted">
          Sifa has read your statement and sorted everything into categories.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-emerald px-7 text-sm font-semibold text-paper transition hover:brightness-95 active:scale-[0.98]"
          >
            See what Sifa noticed <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={reset}
            className="min-h-[44px] text-sm font-medium text-muted underline-offset-4 hover:underline"
          >
            Import another statement
          </button>
        </div>
      </div>
    );
  }

  // ── Review ─────────────────────────────────────────────────
  if (stage === "review") {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-3xl font-semibold">Check this looks right</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} transactions from {fileName}. Change anything Sifa got wrong —
            it remembers your corrections for next time.
          </p>
        </header>

        {/* Reconciliation — lets the user verify nothing was dropped */}
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-hair bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Money in</p>
            <p className="mt-1 font-mono text-xl tabular-nums text-emerald">
              {formatZAR(totals.income)}
            </p>
          </div>
          <div className="rounded-2xl border border-hair bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Money out</p>
            <p className="mt-1 font-mono text-xl tabular-nums text-brick">
              {formatZAR(totals.expenses)}
            </p>
          </div>
          <div className="rounded-2xl border border-hair bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Need a look</p>
            <p className="mt-1 font-mono text-xl tabular-nums">{totals.needsReview}</p>
          </div>
        </section>

        {(skipped > 0 || warning) && (
          <div className="flex items-start gap-2 rounded-xl bg-gold/10 p-4 text-sm text-gold">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {warning}
              {skipped > 0 &&
                ` ${skipped} line${skipped === 1 ? "" : "s"} couldn't be read and ${skipped === 1 ? "was" : "were"} left out. Compare the totals above against your statement.`}
            </p>
          </div>
        )}

        {duplicateCount > 0 && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-hair bg-card p-4 text-sm">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald"
            />
            <span>
              <strong className="text-ink">
                {duplicateCount} of these look like transactions you already have.
              </strong>
              <span className="block text-muted">
                Skip them to avoid double-counting. Uncheck if they're genuinely separate.
              </span>
            </span>
          </label>
        )}

        <div className="overflow-hidden rounded-2xl border border-hair">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-paper">
                <tr className="border-b border-hair">
                  <th className="p-3 font-semibold text-muted">Date</th>
                  <th className="p-3 font-semibold text-muted">Description</th>
                  <th className="p-3 font-semibold text-muted">Category</th>
                  <th className="p-3 font-semibold text-muted">Type</th>
                  <th className="p-3 text-right font-semibold text-muted">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair bg-card">
                {rows.map((r, i) => {
                  const isDupe = existingKeys.has(duplicateKey(r));
                  return (
                    <tr key={i} className={isDupe && skipDuplicates ? "opacity-40" : ""}>
                      <td className="whitespace-nowrap p-3 text-muted">{r.date}</td>
                      <td className="max-w-[220px] truncate p-3" title={r.description}>
                        {r.description}
                        {r.merchant && (
                          <span className="ml-1.5 text-xs text-muted">· {r.merchant}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <select
                          value={r.category}
                          onChange={(e) => updateRow(i, { category: e.target.value as never })}
                          className={`cursor-pointer appearance-none rounded-full border px-2.5 py-1 text-xs font-medium transition focus:outline-none ${
                            r.confidence < 0.9
                              ? "border-gold bg-gold/10 text-gold"
                              : "border-hair bg-paper hover:border-emerald"
                          }`}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() =>
                            updateRow(i, { type: r.type === "expense" ? "income" : "expense" })
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                            r.type === "expense"
                              ? "bg-brick/10 text-brick hover:bg-brick/20"
                              : "bg-emerald/10 text-emerald hover:bg-emerald/20"
                          }`}
                        >
                          {r.type === "expense" ? "Out" : "In"}
                        </button>
                      </td>
                      <td
                        className={`p-3 text-right font-mono tabular-nums ${
                          r.type === "expense" ? "text-brick" : "text-emerald"
                        }`}
                      >
                        {r.type === "expense" ? "−" : "+"}
                        {formatZAR(r.amount).replace("-", "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={confirmImport}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-emerald px-7 text-sm font-semibold text-paper transition hover:brightness-95 active:scale-[0.98]"
          >
            Import{" "}
            {skipDuplicates && duplicateCount > 0
              ? rows.length - duplicateCount
              : rows.length}{" "}
            transactions
          </button>
          <button
            onClick={reset}
            className="min-h-[44px] text-sm font-medium text-muted underline-offset-4 hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / reading ─────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold">Import your statement</h1>
        <p className="mt-2 text-muted">
          Drop in a bank statement and Sifa sorts every transaction into categories.
          No typing.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
        className={`relative flex min-h-[260px] flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragging ? "border-emerald bg-emerald/5" : "border-hair bg-card hover:bg-paper/40"
        } ${stage === "reading" ? "pointer-events-none" : "cursor-pointer"}`}
      >
        {stage === "reading" ? (
          <>
            <Loader2 className="h-9 w-9 animate-spin text-emerald" />
            <p className="mt-4 font-display text-lg font-semibold">Reading {fileName}</p>
            <p className="mt-1 text-sm text-muted">
              Happening in your browser — the file isn't being uploaded.
            </p>
          </>
        ) : (
          <>
            <input
              type="file"
              accept=".csv,.pdf,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              title="Choose a statement"
            />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-paper">
              <UploadCloud className={`h-8 w-8 ${isDragging ? "text-emerald" : "text-muted"}`} />
            </div>
            <p className="mt-4 font-display text-lg font-semibold">
              {isDragging ? "Drop it here" : "Drag your statement in"}
            </p>
            <p className="mt-1 text-sm text-muted">or click to choose a file · PDF or CSV</p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-brick/10 p-4 text-sm text-brick">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-hair bg-card p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald" />
        <p className="text-sm leading-relaxed text-muted">
          <strong className="text-ink">Your statement never leaves this device.</strong> Sifa
          reads it inside your browser — your name, account number, address and balances are
          never uploaded anywhere.
        </p>
      </div>

      <details className="rounded-2xl border border-hair bg-card p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <FileSpreadsheet className="h-4 w-4 text-muted" />
          Where do I find my statement?
        </summary>
        <div className="mt-3 space-y-2 text-sm text-muted">
          <p>
            CSV works best — it's the most accurate. Most banking apps have it under
            statements or transaction history:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong className="text-ink">FNB</strong> — Accounts → Statements → Download (CSV)</li>
            <li><strong className="text-ink">Capitec</strong> — Transact → Statements → Email/Download</li>
            <li><strong className="text-ink">Standard Bank</strong> — Account → Transaction History → Export</li>
            <li><strong className="text-ink">Absa</strong> — Statements → Download → CSV</li>
            <li><strong className="text-ink">Nedbank</strong> — Account → Statements → Download</li>
          </ul>
          <p>PDF statements work too — Sifa reads the table directly.</p>
        </div>
      </details>
    </div>
  );
}
