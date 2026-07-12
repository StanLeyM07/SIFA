import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSifa } from "@/lib/sifa/context";
import { TierBadge } from "@/components/sifa/tier-badge";
import { FEATURES } from "@/lib/sifa/types";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { license, features, deactivate } = useSifa();
  const navigate = useNavigate();
  if (!license) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>

      {/* Plan */}
      <section className="rounded-3xl border border-hair bg-card p-6">
        <div className="flex items-center gap-2">
          <TierBadge tier={license.tier} />
          <span className="font-display text-lg font-semibold">{FEATURES[license.tier].label} plan</span>
        </div>
        <p className="mt-2 font-mono text-xs tabular-nums text-muted">
          Key: {license.key}
        </p>
        <a href="/#pricing" className="mt-3 inline-block text-sm text-emerald underline underline-offset-2">
          Manage your plan →
        </a>
      </section>

      {/* Devices */}
      <section className="rounded-3xl border border-hair bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Devices</h2>
        {license.tier === "starter" ? (
          <p className="mt-2 text-sm text-muted">This plan works on 1 device.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">Devices: 1 of {features.deviceLimit} used</p>
            <ul className="mt-3 divide-y divide-dashed divide-hair">
              <li className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">This device</p>
                  <p className="text-xs text-muted">Active now</p>
                </div>
                <button
                  onClick={() => toast("Device removal will be available once cloud sync ships.")}
                  className="text-xs text-muted hover:text-brick"
                >
                  Remove
                </button>
              </li>
            </ul>
          </>
        )}
      </section>

      {/* Business only */}
      {features.profiles ? (
        <section className="rounded-3xl border border-hair bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Profiles</h2>
          <p className="mt-2 text-sm text-muted">Switch between named budget profiles.</p>
          <ul className="mt-3 divide-y divide-dashed divide-hair">
            <li className="flex items-center justify-between py-3 text-sm">
              <span>Default</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald">Active</span>
            </li>
          </ul>
        </section>
      ) : null}

      {features.export ? (
        <section className="rounded-3xl border border-hair bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Export data</h2>
          <p className="mt-2 text-sm text-muted">Download your transactions and goals for your records.</p>
          <div className="mt-3 flex gap-2">
            {/* TODO: implement real CSV/PDF export from local + server data. */}
            <button
              onClick={() => toast("Export as CSV — coming soon.")}
              className="min-h-[40px] rounded-full border border-hair bg-paper px-4 text-sm font-medium hover:bg-hair/40"
            >
              CSV
            </button>
            <button
              onClick={() => toast("Export as PDF — coming soon.")}
              className="min-h-[40px] rounded-full border border-hair bg-paper px-4 text-sm font-medium hover:bg-hair/40"
            >
              PDF
            </button>
          </div>
        </section>
      ) : null}

      {/* Deactivate */}
      <section className="rounded-3xl border border-hair bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Deactivate this device</h2>
        <p className="mt-2 text-sm text-muted">
          Removes your license from this device. You can reactivate any time with your key.
        </p>
        <button
          onClick={() => {
            deactivate();
            navigate({ to: "/activate" });
          }}
          className="mt-4 min-h-[44px] rounded-full border border-brick px-5 text-sm font-semibold text-brick hover:bg-brick hover:text-paper"
        >
          Deactivate
        </button>
      </section>

      <p className="text-center text-xs text-muted">
        Sifa never asks for your bank login or card details. Your figures are stored against your license key only.
      </p>
    </div>
  );
}
