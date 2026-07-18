import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Target,
  Settings,
  Receipt,
  LineChart,
  CalendarDays,
  Upload,
} from "lucide-react";
import { SifaProvider, useSifa } from "@/lib/sifa/context";
import { LogoMark } from "@/components/sifa/logo";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const TABS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/transactions", label: "Spending", icon: Receipt },
  { to: "/trends", label: "Trends", icon: LineChart },
  { to: "/bills", label: "Bills", icon: CalendarDays },
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
  const { hydrated } = useSifa();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-muted">
        <span className="font-display italic">Loading Sifa…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-hair/60 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-display text-lg font-semibold text-ink">Sifa</span>
          </Link>

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

          {/* Import is an action, not a destination — keep it always reachable. */}
          <Link
            to="/import"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-emerald px-4 text-sm font-semibold text-paper transition hover:brightness-95 active:scale-[0.98]"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import statement</span>
            <span className="sm:hidden">Import</span>
          </Link>
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
        <div className="flex">
          {TABS.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition ${
                  active ? "text-emerald" : "text-paper/60"
                }`}
              >
                <t.icon className="h-5 w-5 shrink-0" />
                <span className="truncate max-w-full">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
