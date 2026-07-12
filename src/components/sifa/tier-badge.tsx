import type { Tier } from "@/lib/sifa/types";
import { FEATURES } from "@/lib/sifa/types";

export function TierBadge({ tier }: { tier: Tier }) {
  const label = FEATURES[tier].label.toUpperCase();
  if (tier === "starter") {
    return (
      <span className="inline-flex items-center rounded-full bg-hair px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-gold">
      {label}
    </span>
  );
}
