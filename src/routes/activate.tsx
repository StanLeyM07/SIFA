import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SifaProvider, useSifa } from "@/lib/sifa/context";
import { LogoMark } from "@/components/sifa/logo";

export const Route = createFileRoute("/activate")({
  component: () => (
    <SifaProvider>
      <ActivatePage />
    </SifaProvider>
  ),
});

function ActivatePage() {
  const { hydrated, license, activate } = useSifa();
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && license) navigate({ to: "/dashboard" });
  }, [hydrated, license, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!key.trim()) {
      setErr("Enter your license key to continue.");
      return;
    }
    const l = activate(key);
    if (!l) {
      setErr("That key doesn't look right. Try pasting it from your purchase email.");
      return;
    }
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark size={36} />
          <span className="font-display text-2xl font-semibold">Sifa</span>
        </div>

        <div className="w-full rounded-3xl border border-hair bg-card p-6 shadow-[0_20px_60px_-30px_rgba(22,35,28,0.35)] sm:p-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Activate <em className="text-emerald">Sifa</em>
          </h1>
          <p className="mt-2 text-sm text-muted">
            Enter the license key from your purchase email.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="rounded-2xl border border-dashed border-hair bg-paper/60 px-4 py-3">
              <label htmlFor="key" className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                License key
              </label>
              <input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full bg-transparent font-mono text-lg tracking-wider text-ink placeholder:text-muted/60 focus:outline-none"
              />
            </div>
            {err ? <p className="text-sm text-brick">{err}</p> : null}
            <button
              type="submit"
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-ink px-6 text-sm font-semibold text-paper transition hover:opacity-90"
            >
              Activate
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Don't have a key yet?{" "}
            <a href="/#pricing" className="text-emerald underline underline-offset-2">
              See plans
            </a>
          </p>
        </div>

        <p className="mt-6 max-w-xs text-center text-xs text-muted">
          Sifa never asks for your bank login or card details.
        </p>
      </div>
    </div>
  );
}
