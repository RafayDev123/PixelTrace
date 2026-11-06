"use client";

import { AlertTriangle, CheckCircle2, Copy, Info, Loader2, X, XCircle } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Severity } from "@/lib/types";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Buttons */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-[#4a93ff] to-[#2a6df4] text-white shadow-[0_6px_16px_-6px_rgba(61,139,255,0.7)] hover:from-[#5b9eff] hover:to-[#3a7aff] disabled:from-line2 disabled:to-line2 disabled:text-faint disabled:shadow-none",
  secondary: "bg-raised text-fg border border-line2 hover:bg-[#1d2a47] hover:border-[#3b4f79] disabled:text-faint disabled:hover:bg-raised",
  ghost: "text-muted hover:text-fg hover:bg-raised disabled:text-faint",
  danger: "bg-[#2a1216] text-[#fda4a4] border border-[#5b2229] hover:bg-[#3a171c] disabled:text-faint",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", loading, icon, children, className, disabled, ...rest }: ButtonProps) {
  const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2.5" };
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        sizes[size],
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="pt-spin h-4 w-4" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  icon,
  children,
  className,
  download,
  external,
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  download?: boolean;
  external?: boolean;
}) {
  const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2.5" };
  const cls = cx("inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors", sizes[size], VARIANTS[variant], className);
  if (download || external)
    return (
      <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {icon}
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls}>
      {icon}
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ Surfaces */

export function Card({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; "aria-label"?: string; "aria-labelledby"?: string }) {
  return (
    <Tag {...rest} className={cx("rounded-[12px] border border-line bg-panel shadow-[var(--shadow-panel)]", className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-fg">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="relative mb-6 overflow-hidden rounded-[14px] border border-line bg-panel px-5 py-6 sm:px-7 sm:py-7">
      <div className="trace-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          {eyebrow && <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-cyan">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
          {description && <p className="mt-2 text-[14px] leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="marks mb-4 grid h-16 w-16 place-items-center text-cyan">{icon}</div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-14 text-sm text-muted">
      <Loader2 className="pt-spin h-4 w-4 text-cyan" aria-hidden />
      {label}…
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <XCircle className="h-8 w-8 text-bad" aria-hidden />
      <p className="max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "info", children, title }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; title?: string }) {
  const map = {
    info: { cls: "border-[#24406f] bg-[#0f1c36] text-[#b6cdf5]", Icon: Info },
    warn: { cls: "border-[#5a4513] bg-[#241c0a] text-[#f3d98b]", Icon: AlertTriangle },
    error: { cls: "border-[#5b2229] bg-[#2a1216] text-[#fbb6b6]", Icon: XCircle },
    ok: { cls: "border-[#1d5a45] bg-[#0c2219] text-[#9de8c7]", Icon: CheckCircle2 },
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cx("flex gap-3 rounded-lg border px-4 py-3 text-[13.5px] leading-relaxed", map.cls)}>
      <map.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Badges */

const TONES = {
  neutral: "border-line2 bg-raised text-muted",
  blue: "border-[#25447a] bg-[#0f2040] text-[#9fc2ff]",
  cyan: "border-[#17586a] bg-[#0b2530] text-[#7ee3f5]",
  ok: "border-[#1d5a45] bg-[#0c2219] text-[#7fe2b8]",
  warn: "border-[#5a4513] bg-[#241c0a] text-[#f3cf6a]",
  bad: "border-[#5b2229] bg-[#2a1216] text-[#f9a1a1]",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11.5px] font-medium", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const SEV: Record<Severity, { label: string; tone: Tone }> = {
  informational: { label: "Informational", tone: "blue" },
  low: { label: "Low", tone: "cyan" },
  medium: { label: "Medium", tone: "warn" },
  high: { label: "High", tone: "bad" },
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEV[severity].tone}>{SEV[severity].label}</Badge>;
}
export const severityLabel = (s: Severity) => SEV[s].label;

/* ------------------------------------------------------------------ Form controls */

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50", checked ? "border-accent bg-accent2" : "border-line2 bg-raised")}
      >
        <span className={cx("absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} style={{ height: 18, width: 18 }} />
      </button>
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-lg border border-line2 bg-canvas px-3 text-sm text-fg placeholder:text-faint transition-colors hover:border-[#3b4f79] focus-visible:border-cyan";

export function Select({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-faint">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, "appearance-none pr-8")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProgressBar({ value, label, tone = "accent" }: { value: number; label: string; tone?: "accent" | "ok" | "bad" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const color = tone === "ok" ? "bg-ok" : tone === "bad" ? "bg-bad" : "bg-gradient-to-r from-accent to-cyan";
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={cx("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; icon?: ReactNode; badge?: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, i: number) {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = tabs.length - 1;
    if (n >= 0) {
      e.preventDefault();
      onChange(tabs[n].id);
      refs.current[n]?.focus();
    }
  }
  return (
    <div role="tablist" aria-label={label} className="scroll-thin -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.id)}
            className={cx(
              "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-3 text-[13.5px] font-medium transition-colors",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.icon}
            {t.label}
            {t.badge}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-accent to-cyan" />}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="pt-rise pt-5 outline-offset-4">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Toasts */

type ToastTone = "ok" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
const ToastCtx = createContext<(message: string, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className="pt-rise pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-line2 bg-raised px-4 py-3 text-sm shadow-xl">
            {t.tone === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden /> : t.tone === "error" ? <XCircle className="h-4 w-4 shrink-0 text-bad" aria-hidden /> : <Info className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss notification" className="text-faint hover:text-fg" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ Dialog */

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
      aria-labelledby="dlg-title"
      className="m-auto w-[min(92vw,30rem)] rounded-xl border border-line2 bg-panel p-0 text-fg shadow-2xl"
    >
      <div className="p-6">
        <h2 id="dlg-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-[14px] leading-relaxed text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ Misc */

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast("Copy is not available in this browser context.", "error");
        }
      }}
      className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-raised hover:text-fg", className)}
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function StatCard({ label, value, hint, icon, tone = "blue" }: { label: string; value: ReactNode; hint?: string; icon: ReactNode; tone?: "blue" | "cyan" | "ok" | "warn" }) {
  const color = { blue: "text-accent", cyan: "text-cyan", ok: "text-ok", warn: "text-warn" }[tone];
  return (
    <Card as="div" className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium uppercase tracking-wide text-faint">{label}</p>
        <span className={cx("grid h-8 w-8 place-items-center rounded-lg bg-raised", color)}>{icon}</span>
      </div>
      <p className="mt-3 font-mono text-[30px] font-semibold leading-none tracking-tight text-fg">{value}</p>
      {hint && <p className="mt-2 text-[12.5px] text-muted">{hint}</p>}
    </Card>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMemoValue<T>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
}
