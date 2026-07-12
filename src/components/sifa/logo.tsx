export function LogoMark({ size = 28 }: { size?: number }) {
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
