/** Original PixelTrace brand mark: viewfinder brackets with a metadata trace path ending in a node. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="pt-g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3d8bff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#0d1424" stroke="#2d3e61" />
      <path d="M8 15V10a2 2 0 0 1 2-2h5M25 8h5a2 2 0 0 1 2 2v5M32 25v5a2 2 0 0 1-2 2h-5M15 32h-5a2 2 0 0 1-2-2v-5" stroke="url(#pt-g)" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 26l5-6 4 3 6-8" stroke="url(#pt-g)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27.5" cy="15" r="2.6" fill="#22d3ee" />
      <circle cx="12" cy="26" r="1.6" fill="#3d8bff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      Pixel<span className="text-cyan">Trace</span>
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={compact ? 28 : 34} />
      <span className="flex flex-col leading-none">
        <Wordmark className={compact ? "text-base" : "text-[17px]"} />
        {!compact && <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">Image Intelligence</span>}
      </span>
    </span>
  );
}
