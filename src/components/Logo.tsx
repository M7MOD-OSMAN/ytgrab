export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      {/* Play chevron feeding into a download arrow — an original mark, not a copy of any brand's play icon. */}
      <path
        d="M10 8.5c0-1.1 1.2-1.77 2.15-1.2l9.2 5.5a1.4 1.4 0 0 1 0 2.4l-3.8 2.27V22a1 1 0 0 1-1.55.83l-5.4-3.6A1 1 0 0 1 10 18.4V8.5Z"
        fill="white"
      />
      <path
        d="M21.5 16.5v3.6a1.4 1.4 0 0 1-1.4 1.4h-1.2a1.4 1.4 0 0 1-1.4-1.4v-3.6"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.2 18.3 19 20.1l1.8-1.8"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold tracking-tight text-text">StreamPull</span>
    </div>
  );
}
