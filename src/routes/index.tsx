import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: SifaLanding,
});

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid place-items-center rounded-full bg-ink text-paper"
      style={{ width: size, height: size }}
    >
      <span
        className="italic font-display font-semibold leading-none"
        style={{ fontSize: size * 0.6 }}
      >
        S
      </span>
    </span>
  );
}

function Nav() {
  return (
    <header className="w-full border-b border-hair/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-display text-xl font-semibold text-ink">Sifa</span>
        </a>
        <a
          href="#pricing"
          className="inline-flex min-h-[44px] items-center rounded-full bg-emerald px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
        >
          See pricing
        </a>
      </div>
    </header>
  );
}

function BarChart() {
  // heights in %, colors from palette; one brick bar for contrast
  const bars = [
    { h: 42, c: "bg-emerald" },
    { h: 65, c: "bg-emerald-deep" },
    { h: 38, c: "bg-gold" },
    { h: 78, c: "bg-emerald" },
    { h: 30, c: "bg-brick" },
    { h: 88, c: "bg-emerald-deep" },
    { h: 55, c: "bg-emerald" },
  ];
  return (
    <div
      className="flex h-32 items-end gap-2"
      role="img"
      aria-label="Illustrative weekly spending chart"
    >
      {bars.map((b, i) => (
        <div
          key={i}
          className={`${b.c} flex-1 rounded-t-md`}
          style={{ height: `${b.h}%` }}
        />
      ))}
    </div>
  );
}

function DeviceMockup() {
  return (
    <div className="relative">
      <div
        className="rounded-[28px] bg-ink p-4 sm:p-5"
        style={{ boxShadow: "0 40px 80px -30px rgba(22,35,28,0.35)" }}
      >
        <div className="rounded-[18px] bg-card p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <span className="font-display italic text-muted">Saved this month</span>
            <span className="text-xs text-muted">July</span>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-[26px] font-bold tabular-nums text-ink">
              R 8,330
            </span>
          </div>
          <div className="mt-1 text-sm font-medium text-emerald">↑ 26% of income</div>

          <div className="mt-5">
            <BarChart />
          </div>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-hair bg-paper px-3.5 py-2 text-sm text-ink">
            <span aria-hidden>✨</span>
            <span>Eating out is up 34% this month</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="grid items-center gap-12 md:grid-cols-2 md:gap-14">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-emerald">
            Personal finance, plainly explained
          </p>
          <h1 className="mt-4 font-display font-semibold leading-[1.05] text-ink text-[32px] md:text-[46px]">
            See where your money goes, and{" "}
            <em className="not-italic">
              <span className="italic text-emerald">keep more of it.</span>
            </em>
          </h1>
          <p className="mt-5 max-w-[440px] text-[16px] leading-relaxed text-muted">
            Sifa tracks your income and spending, shows you exactly where it's going,
            and tells you in plain language what to do about it. No bank connection
            required.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#pricing"
              className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition hover:-translate-y-px hover:opacity-95"
            >
              Get Sifa
            </a>
            <a
              href="#how"
              className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-transparent px-6 py-3 text-sm font-medium text-ink transition hover:-translate-y-px hover:bg-card"
            >
              See how it works
            </a>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-emerald"
            />
            Your figures stay yours. No bank login, no card details, ever.
          </p>
        </div>

        <div className="order-first md:order-last">
          <DeviceMockup />
        </div>
      </div>
    </section>
  );
}

function EyebrowHeading({
  eyebrow,
  title,
  subtext,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtext?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-emerald">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
        {title}
      </h2>
      {subtext && <p className="mt-4 text-[16px] leading-relaxed text-muted">{subtext}</p>}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "One",
      title: "Get your key",
      body:
        "Pay once, your key and download link land in your inbox immediately.",
    },
    {
      n: "Two",
      title: "Open it",
      body:
        "Starter opens straight in Excel or Google Sheets. Pro and Business open as a link you add to your home screen, like an app.",
    },
    {
      n: "Three",
      title: "Log a few figures",
      body:
        "Type what you earned and spent. Sifa sorts it, budgets it, and tells you what's worth changing.",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <EyebrowHeading
        eyebrow="How it works"
        title="Three steps, no setup"
        subtext="No bank sync, no app store, no terminal. Buy it, open it, use it."
      />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="rounded-[20px] border border-hair bg-card p-7"
          >
            <span className="font-display italic text-gold">{s.n}</span>
            <h3 className="mt-3 font-display text-2xl font-semibold text-ink">
              {s.title}
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Check({ gold = false }: { gold?: boolean }) {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 20 20"
      className={`mt-0.5 shrink-0 ${gold ? "text-gold" : "text-emerald"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function PricingCard({
  name,
  tagline,
  price,
  note,
  features,
  cta,
  href,
  featured = false,
}: {
  name: string;
  tagline: string;
  price: string;
  note: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
}) {
  const base = featured
    ? "bg-ink text-paper border-ink"
    : "bg-card text-ink border-hair";
  const raise = featured ? "md:-translate-y-2" : "";
  const muted = featured ? "text-paper/70" : "text-muted";
  const tag = featured ? "text-gold" : "text-emerald";
  const btn = featured
    ? "bg-gold text-ink hover:opacity-90"
    : "bg-ink text-paper hover:opacity-90";

  return (
    <div
      className={`relative flex flex-col rounded-[22px] border p-7 ${base} ${raise}`}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
          Most popular
        </span>
      )}
      <div>
        <h3 className="font-display text-2xl font-semibold">{name}</h3>
        <p className={`mt-1 text-sm ${muted}`}>{tagline}</p>
      </div>
      <div className="mt-6">
        <div className="font-mono text-4xl font-semibold tabular-nums">
          {price}
        </div>
        <div className={`mt-1 text-xs ${muted}`}>{note}</div>
      </div>
      <ul className="mt-6 flex-1 space-y-0">
        {features.map((f, i) => (
          <li
            key={f}
            className={`flex items-start gap-3 py-3 text-[15px] leading-snug ${
              i > 0 ? "border-t border-dashed" : ""
            } ${featured ? "border-paper/20" : "border-hair"}`}
          >
            <Check gold={featured} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {/* TODO: replace with real Gumroad checkout URL */}
      <a
        href={href}
        className={`mt-7 inline-flex min-h-[44px] items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition hover:-translate-y-px ${btn}`}
      >
        {cta}
      </a>
    </div>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <EyebrowHeading
        eyebrow="Pricing"
        title="One payment. Yours for good."
        subtext="No subscriptions on Starter or Pro. Pick the level of automation you want."
      />
      <div className="mt-14 grid items-start gap-5 md:grid-cols-3">
        <PricingCard
          name="Starter"
          tagline="The spreadsheet, done properly"
          price="R 197"
          note="once-off · Excel & Google Sheets"
          features={[
            "Income, budgets & savings goals",
            "Automatic category suggestions",
            "Built-in spending charts",
            "Works fully offline, forever",
            "No key, no account, no lock-in",
          ]}
          cta="Buy Starter"
          href="#TODO-gumroad-starter"
        />
        <PricingCard
          featured
          name="Pro"
          tagline="The app, with an AI that reads your numbers"
          price="R 497"
          note="once-off · use on 2 devices"
          features={[
            "Everything in Starter",
            "Install as an app, phone + desktop",
            "History syncs automatically between them",
            "AI monthly summary, in plain language",
            "Ask Sifa anything about your spending",
          ]}
          cta="Buy Pro"
          href="#TODO-gumroad-pro"
        />
        <PricingCard
          name="Business"
          tagline="For freelancers & small households"
          price="R 997"
          note="once-off · use on 2 devices"
          features={[
            "Everything in Pro",
            "Multiple budgets or profiles",
            "Exportable monthly reports (CSV/PDF)",
            "Priority email support",
          ]}
          cta="Buy Business"
          href="#TODO-gumroad-business"
        />
      </div>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details open className="sifa-accordion border-t border-hair py-5">
      <summary className="flex items-start justify-between gap-6">
        <h3 className="font-display text-lg font-semibold text-ink sm:text-xl">
          {q}
        </h3>
        <span
          aria-hidden
          className="sifa-chev mt-1 inline-block text-muted"
          style={{ fontSize: 20, lineHeight: 1 }}
        >
          +
        </span>
      </summary>
      <div className="sifa-accordion-body mt-3 text-[15px] leading-relaxed text-muted">
        {a}
      </div>
    </details>
  );
}

function FAQ() {
  const items = [
    {
      q: "Do you store my name or bank details?",
      a: "No. Sifa never asks for your bank login, card number, or ID. You only ever type figures, an amount and a category. Pro and Business store those figures against your license key, nothing else, and email is optional and only used to recover a lost key.",
    },
    {
      q: "How many devices can I use it on?",
      a: "Starter has no device limit, it's your spreadsheet, keep it wherever you like. Pro and Business licenses work on up to 2 devices at a time, you can free one up from Settings any time you switch phones or laptops.",
    },
    {
      q: "Does it work without internet?",
      a: "Starter is fully offline. Pro and Business work offline too, and quietly sync any new entries once you're back online.",
    },
    {
      q: "What if I lose my key?",
      a: "If you added a recovery email at setup, we can resend it. Without one, we can't recover it, that's the tradeoff for not asking you for personal details up front.",
    },
    {
      q: "Can I get a refund?",
      a: "Yes, within 7 days of purchase if the product doesn't work as described. Reach out through the link in your receipt.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <EyebrowHeading eyebrow="Questions" title="Before you buy" />
      <div className="mx-auto mt-10 max-w-[720px]">
        {items.map((it) => (
          <FaqItem key={it.q} q={it.q} a={it.a} />
        ))}
        <div className="border-t border-hair" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-5 pb-16 pt-8 text-center sm:px-8">
      <p className="font-display text-lg italic text-ink">
        Sifa — your money, explained.
      </p>
      <p className="mt-2 text-sm text-muted">
        © 2026 Sifa. Built for people who'd rather not open a banking app to feel bad.
      </p>
    </footer>
  );
}

function SifaLanding() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
