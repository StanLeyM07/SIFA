import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutDashboard, Target, Settings } from "lucide-react";
import { SifaProvider, useSifa } from "@/lib/sifa/context";
import { LogoMark } from "@/components/sifa/logo";
import { TierBadge } from "@/components/sifa/tier-badge";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const TABS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AppLayout() {
  return (
    <SifaProvider>
      <AppShell />
    </SifaProvider>
  );
}

function AppShell() {
  const { hydrated, license } = useSifa();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (hydrated && !license) {
      navigate({ to: "/activate" });
    }
  }, [hydrated, license, navigate]);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-muted">
        <span className="font-display italic">Loading Sifa…</span>
      </div>
    );
  }
  if (!license) return null;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-hair/60 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-display text-lg font-semibold text-ink">Sifa</span>
            <TierBadge tier={license.tier} />
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => {
              const active = pathname === t.to;
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-medium transition ${
                    active ? "bg-ink text-paper" : "text-muted hover:text-ink"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-8 md:pb-10">
        <Outlet />
      </main>

      {/* Bottom tabs (mobile) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-2/30 bg-ink text-paper md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                  active ? "text-emerald" : "text-paper/60"
                }`}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
