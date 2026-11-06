"use client";

import { BarChart3, FileStack, History, Images, Info, Menu, ScanSearch, Settings, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "./Logo";
import { cx, ToastProvider } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/analyze", label: "Analyze Image", icon: ScanSearch },
  { href: "/bulk", label: "Bulk Analysis", icon: Images },
  { href: "/history", label: "Analysis History", icon: History },
  { href: "/reports", label: "Reports", icon: FileStack },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About PixelTrace", icon: Info },
];

function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  if (href === "/history" && path.startsWith("/report/")) return true;
  return path === href || path.startsWith(`${href}/`);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors",
              active ? "bg-[#12203d] text-fg" : "text-muted hover:bg-raised hover:text-fg",
            )}
          >
            {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan" aria-hidden />}
            <Icon className={cx("h-[18px] w-[18px]", active ? "text-cyan" : "text-faint group-hover:text-muted")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function PrivacyNote() {
  return (
    <div className="rounded-lg border border-line bg-panel2 p-3">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
        <ShieldCheck className="h-4 w-4 text-ok" aria-hidden /> Private by default
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">Images are analysed in memory and never stored. GPS and serial numbers stay hidden until you reveal them.</p>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-accent2 focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col gap-6 border-r border-line bg-[#080d19] px-4 py-5 lg:flex">
        <Link href="/" aria-label="PixelTrace home" className="px-2">
          <Brand />
        </Link>
        <div className="flex-1 overflow-y-auto scroll-thin">
          <NavList />
        </div>
        <PrivacyNote />
      </aside>

      {/* Mobile / tablet top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-[#080d19]/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="PixelTrace home">
          <Brand compact />
        </Link>
        <button type="button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation menu" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="pt-rise absolute inset-y-0 left-0 flex w-[84vw] max-w-[300px] flex-col gap-5 border-r border-line bg-[#080d19] p-4">
            <div className="flex items-center justify-between px-1">
              <Brand />
              <button type="button" aria-label="Close navigation menu" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <PrivacyNote />
          </div>
        </div>
      )}

      <main id="main" key={path} className="lg:pl-[264px]">
        <div className="pt-rise mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </ToastProvider>
  );
}
