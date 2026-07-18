import { createFileRoute, redirect } from "@tanstack/react-router";

// The app has no landing page of its own; the marketing site lives in `website/`.
// Root simply drops you into the dashboard. Activation is skipped for now, and
// SifaProvider seeds a preview license, so the dashboard is always reachable.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
