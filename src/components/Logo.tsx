/**
 * The Mobile Dinners mark.
 *
 * Redrawn from the horizontal brand logo: charcoal phone, red cloche over a
 * serving hand, charcoal takeaway bag with cutlery, and the speed lines to the
 * left in alternating charcoal and red. Two colours only — the brand does not
 * use a third, so neither does this.
 *
 * It is vector rather than an image file so it stays crisp at 28px in a header
 * and 40px in a footer, and inherits the theme in dark mode.
 */
export function LogoMark({ className = "h-11 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 70 52"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {/* Motion lines. Three, not four — at header size a fourth is just noise. */}
      <rect x="0" y="16" width="15" height="4" rx="2" fill="var(--ink)" />
      <rect x="3" y="24" width="12" height="4" rx="2" fill="var(--brand)" />
      <rect x="0" y="32" width="15" height="4" rx="2" fill="var(--ink)" />

      {/* Takeaway bag. A solid silhouette with two simple cut-outs standing in
          for the cutlery — the detailed fork and knife turn to mud below 60px. */}
      <path d="M50 18h16a1.5 1.5 0 0 1 1.5 1.7l-2 26A2.5 2.5 0 0 1 63 48h-10a2.5 2.5 0 0 1-2.5-2.3l-2-26A1.5 1.5 0 0 1 50 18Z" fill="var(--ink)" />
      <path d="M54.5 18v-3.5a3.5 3.5 0 0 1 7 0V18" fill="none" stroke="var(--ink)" strokeWidth="2.8" />
      <rect x="55" y="26" width="2.6" height="14" rx="1.3" fill="var(--bg)" />
      <rect x="60" y="26" width="2.6" height="14" rx="1.3" fill="var(--bg)" />

      {/* Phone. Bigger and squarer than the reference so the screen reads. */}
      <rect x="17" y="2" width="30" height="48" rx="7" fill="var(--ink)" />
      <rect x="21" y="8" width="22" height="37" rx="3.5" fill="var(--bg)" />
      <rect x="28" y="4.4" width="8" height="1.8" rx="0.9" fill="var(--bg)" />

      {/* Cloche: handle, dome, tray. The single most identifying element, so it
          gets the most room. */}
      <circle cx="32" cy="15" r="2.8" fill="var(--brand)" />
      <path d="M20 30a12 12 0 0 1 24 0Z" fill="var(--brand)" />
      <path
        d="M24.5 28a8.5 8.5 0 0 1 5-6.4"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="17" y="29.5" width="30" height="4.2" rx="2.1" fill="var(--ink)" />

      {/* Serving hand — one thick stroke, which is all that survives at 44px. */}
      <path
        d="M22 44c2.6-3.6 6-5.6 9.6-5.6h3.2a2 2 0 0 1 0 4h-3.4c3.2 0 5.6-.7 7.4-2"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Wordmark. "Mobile" in charcoal over "Dinners" in red, stacked, with the red
 * location pin sitting in the bowl of the "o" the way the brand logo sets it.
 */
export function LogoType({
  className = "text-[20px]",
  stacked = true,
  onDark = false,
}: {
  className?: string;
  stacked?: boolean;
  onDark?: boolean;
}) {
  const top = onDark ? "text-chrome-ink" : "text-ink";

  const mobile = (
    <span className="relative">
      M
      <span className="relative inline-block">
        o
        <PinGlyph />
      </span>
      bile
    </span>
  );

  if (!stacked) {
    return (
      <span className={`font-extrabold tracking-[-0.03em] ${className}`}>
        <span className={top}>{mobile}</span>{" "}
        <span className="text-brand">Dinners</span>
      </span>
    );
  }

  return (
    <span className={`grid font-extrabold leading-[1.02] tracking-[-0.03em] ${className}`}>
      <span className={top}>{mobile}</span>
      <span className="text-brand">Dinners</span>
    </span>
  );
}

/**
 * The pin that sits inside the bowl of the "o" in Mobile, sized to the counter
 * rather than the whole letter — at full width it reads as a red blob and the
 * word stops being legible.
 */
function PinGlyph() {
  return (
    <svg
      viewBox="0 0 12 16"
      aria-hidden="true"
      className="absolute left-1/2 top-[46%] h-[0.6em] w-[0.42em] -translate-x-1/2 -translate-y-1/2"
    >
      <path d="M6 16s6-6.6 6-10A6 6 0 0 0 0 6c0 3.4 6 10 6 10Z" fill="var(--brand)" />
      <circle cx="6" cy="6" r="2.4" fill="var(--bg)" />
    </svg>
  );
}

/** Header/footer lockup: mark plus stacked wordmark, as the brand sets it. */
export function LogoLockup({
  className = "",
  markClass = "h-11 w-auto",
  typeClass = "text-[20px]",
  onDark = false,
}: {
  className?: string;
  /** Height only — the mark is wider than it is tall and sets its own width. */
  markClass?: string;
  typeClass?: string;
  onDark?: boolean;
}) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <LogoMark className={`shrink-0 ${markClass}`} />
      <LogoType className={typeClass} onDark={onDark} />
    </span>
  );
}
