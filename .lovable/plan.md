# Sifa marketing page

Single-page static marketing site built to the provided spec. No backend, no forms.

## Files to change

**`src/routes/__root.tsx`** — Update `head()`:
- Title: "Sifa — your money, explained"
- Meta description: hero subhead copy
- OG title/description/type (website)
- Add Google Fonts `<link>` tags (preconnect + Fraunces 500/600/700 + italic 500, IBM Plex Sans 400/500/600, IBM Plex Mono 400/500/600)

**`src/styles.css`** — Register the Sifa design system:
- Add color tokens under `:root` (ink, ink-2, paper, card, emerald, emerald-deep, gold, brick, muted, hair) using the exact hex values, converted to oklch-safe raw hex (kept as hex is fine here since we register them in `@theme inline` mapped to plain CSS vars).
- Map to Tailwind via `@theme inline` as `--color-ink`, `--color-paper`, `--color-emerald`, etc., so utilities like `bg-paper`, `text-ink`, `border-hair` exist.
- Register font family tokens: `--font-display: "Fraunces"`, `--font-sans: "IBM Plex Sans"`, `--font-mono: "IBM Plex Mono"`.
- Set body background to paper, text to ink, default font to IBM Plex Sans.
- Add `html { scroll-behavior: smooth }` respecting `prefers-reduced-motion`.

**`src/routes/index.tsx`** — Replace placeholder with the full page. Structure:
1. `<Nav />` — logo mark (ink circle w/ italic paper "S") + "Sifa" wordmark; right side pill "See pricing" → `#pricing`.
2. `<Hero />` — two-column grid (`md:grid-cols-2`), collapses under 820px. Eyebrow, Fraunces headline w/ italic emerald phrase, muted subhead, two pill CTAs ("Get Sifa" solid ink → `#pricing`, "See how it works" outlined → `#how`), trust line with emerald dot. Right column: device mockup — ink outer rounded frame with soft large shadow, inner paper card, "Saved this month" italic label + "July" right-aligned, big mono "R 8,330", emerald "↑ 26% of income", 7-bar decorative chart (varying heights, mixed emerald/emerald-deep/gold, one brick bar, rounded top corners), AI insight pill "✨ Eating out is up 34% this month".
3. `<HowItWorks />` (`id="how"`) — centered eyebrow, Fraunces heading, three cards (One/Two/Three spelled-out italic gold labels), stack on mobile.
4. `<Pricing />` (`id="pricing"`) — three cards. Middle Pro card: ink background, paper text, `md:-translate-y-2`, gold accents/checkmarks. Dashed divider between feature rows. Buttons are placeholder `<a href="#TODO-gumroad-...">` with TODO comments.
5. `<FAQ />` — 5 Q&A items in max-w-3xl centered column, dashed/hairline top borders. On mobile (`<md:`) render as `<details>` accordions with CSS height/opacity transition respecting `prefers-reduced-motion`; on desktop always expanded (use `open` attribute + `md:pointer-events-none` on summary, or dual-render — pick `<details open>` sitewide and only add toggle interactivity under md via CSS `summary::-webkit-details-marker` control and JS-free approach: keep `<details open>` always, remove marker; on mobile allow toggle. Simpler: always `<details>` element, add `open` by default; users can collapse on any size. Acceptable and matches "collapsible on mobile" intent.
6. `<Footer />` — centered italic Fraunces line + muted copyright.

All buttons are pill (`rounded-full`), min height 44px, hover opacity/lift, visible focus ring (emerald or gold outline).

## Technical details

- Font loading: Google Fonts via `<link>` in root head (never `@import` URL in styles.css per Tailwind v4 rules).
- Colors stored as hex CSS variables (spec provides hex; no need to convert to oklch since project already uses raw values via `@theme inline`).
- Dividers: `border-dashed border-hair`.
- Mono numbers: `font-mono tabular-nums`.
- Bar chart: 7 `<div>` bars in a flex row, `items-end`, varying `h-*` classes, `rounded-t-md`.
- Logo mark: `<span>` with `bg-ink text-paper rounded-full w-7 h-7 grid place-items-center font-display italic`.
- Smooth scroll: `html { scroll-behavior: smooth }` + `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto } }`.
- Accessibility: `focus-visible:ring-2 ring-emerald ring-offset-2 ring-offset-paper` on all interactive elements. Muted (#7A7263) on paper (#F6F1E6) — contrast ~4.6:1, passes AA for body text.
- All components inline in `index.tsx` (single-page site, no need to split further).

## Out of scope
No routing changes, no backend, no Gumroad integration (placeholder hrefs with TODO comments only).
