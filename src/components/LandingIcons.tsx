/** Line icons for the landing page's feature bar and How It Works steps. */

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ScooterIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <circle cx="5.5" cy="17.5" r="2.5" />
      <circle cx="18.5" cy="17.5" r="2.5" />
      <path d="M8 17.5h8M18.5 15V7h-2.2M16.3 7 14 12H8l-2 5.5" />
      <path d="M4 7h5" />
    </svg>
  );
}

export function BagOutlineIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function ShieldIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3 5 6v6c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function HeadsetIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.6" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.6" />
      <path d="M20 19v.5a2.5 2.5 0 0 1-2.5 2.5H13" />
    </svg>
  );
}

export function PinOutlineIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function StorefrontIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 10v10h16V10" />
      <path d="M3 6h18l1 4a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0l1-4Z" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
