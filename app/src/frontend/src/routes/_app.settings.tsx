import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Trash2, ShieldCheck, HardDrive } from "lucide-react";
import { useSifa, formatZAR } from "@/lib/sifa/context";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { transactions, goals, bills, clearAllData } = useSifa();
  const [confirmingClear, setConfirmingClear] = useState(false);

  /** Everything the user has, as one JSON file. The data lives in this browser
   *  only, so export is their safety net — not a premium feature. */
  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      transactions,
      goals,
      bills,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sifa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup downloaded.");
  }

  function exportCsv() {
    const header = "Date,Description,Category,Type,Amount\n";
    const rows = transactions
      .map(
        (t) =>
          `${t.date},"${t.description.replace(/"/g, '""')}",${t.category},${t.type},${t.amount}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sifa-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Transactions exported.");
  }

  const totalTracked = transactions.reduce(
    (s, t) => s + (t.type === "expense" ? t.amount : 0),
    0,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your data, and what happens to it.</p>
      </header>

      {/* Where the data lives — the thing people actually want to know */}
      <section className="rounded-3xl border border-hair bg-card p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald" />
          <div>
            <h2 className="font-display text-xl font-semibold">
              Your data stays on this device
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Statements are read inside your browser. Your name, account number, address
              and balances are never uploaded anywhere.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              That also means{" "}
              <strong className="text-ink">clearing your browser data will erase it</strong>.
              Download a backup now and again.
            </p>
          </div>
        </div>
      </section>

      {/* Storage summary */}
      <section className="rounded-3xl border border-hair bg-card p-6">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted" />
          <h2 className="font-display text-xl font-semibold">What Sifa is tracking</h2>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">Transactions</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums">{transactions.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">Bills</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums">{bills.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted">Goals</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums">{goals.length}</dd>
          </div>
        </dl>
        {transactions.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            {formatZAR(totalTracked)} of spending recorded.
          </p>
        )}
      </section>

      {/* Export */}
      <section className="rounded-3xl border border-hair bg-card p-6">
        <h2 className="font-display text-xl font-semibold">Export your data</h2>
        <p className="mt-1 text-sm text-muted">Yours to take, any time. No lock-in.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={exportData}
            disabled={transactions.length === 0}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-hair bg-paper px-5 text-sm font-semibold text-ink transition hover:border-emerald disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Full backup (JSON)
          </button>
          <button
            onClick={exportCsv}
            disabled={transactions.length === 0}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-hair bg-paper px-5 text-sm font-semibold text-ink transition hover:border-emerald disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Transactions (CSV)
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-3xl border border-brick/30 bg-brick/5 p-6">
        <h2 className="font-display text-xl font-semibold text-brick">Delete everything</h2>
        <p className="mt-1 text-sm text-muted">
          Wipes every transaction, bill and goal from this device. Can't be undone.
        </p>
        {confirmingClear ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                clearAllData();
                setConfirmingClear(false);
                toast("All data deleted.");
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brick px-5 text-sm font-semibold text-paper transition hover:brightness-95"
            >
              <Trash2 className="h-4 w-4" /> Yes, delete everything
            </button>
            <button
              onClick={() => setConfirmingClear(false)}
              className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-paper px-5 text-sm font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingClear(true)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-brick/40 bg-paper px-5 text-sm font-semibold text-brick transition hover:bg-brick/10"
          >
            <Trash2 className="h-4 w-4" /> Delete all my data
          </button>
        )}
      </section>
    </div>
  );
}
