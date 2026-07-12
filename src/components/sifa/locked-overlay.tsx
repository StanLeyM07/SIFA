import { Lock } from "lucide-react";

export function LockedOverlay({ title, body }: { title: string; body?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-ink/70 p-6 text-center backdrop-blur-sm">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/20 text-gold">
        <Lock className="h-5 w-5" />
      </span>
      <p className="font-display text-lg text-paper">{title}</p>
      {body ? <p className="max-w-xs text-sm text-paper/70">{body}</p> : null}
      <a
        href="/#pricing"
        className="mt-1 inline-flex min-h-[40px] items-center rounded-full bg-gold px-5 text-sm font-semibold text-ink transition hover:brightness-95"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}
