"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import type { EventType, LanguageCode } from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Button (minimum height 48px, warm tactile variants)
// ---------------------------------------------------------------------------

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "md" | "sm";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const sizes =
    size === "sm" ? "min-h-[40px] px-3.5 text-sm" : "min-h-[48px] px-5 text-base";
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-hover shadow-sm",
    secondary:
      "bg-surface text-ink border border-border hover:bg-surface-2 shadow-sm",
    ghost: "bg-transparent text-ink hover:bg-surface-2",
    danger: "bg-danger text-white hover:opacity-90 shadow-sm",
    accent: "bg-accent text-ink hover:brightness-95 shadow-sm",
  };

  return (
    <button
      disabled={disabled || loading}
      className={clsx(base, sizes, variants[variant], className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card & StatCard
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-card border border-border bg-surface p-5 shadow-soft",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const valueTone = {
    neutral: "text-ink",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      <div className={clsx("mt-1 text-xl font-bold tabular-nums", valueTone)}>
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusChip (always icon + text + color, never color alone)
// ---------------------------------------------------------------------------

export type ChipTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

export function StatusChip({
  label,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  tone?: ChipTone;
  icon?: React.ReactNode;
  className?: string;
}) {
  const styles: Record<ChipTone, string> = {
    success: "bg-emerald-50 text-success border-emerald-200",
    warning: "bg-amber-50 text-warning border-amber-200",
    danger: "bg-red-50 text-danger border-red-200",
    info: "bg-blue-50 text-info border-blue-200",
    neutral: "bg-surface-2 text-ink border-border",
    accent: "bg-accent-soft text-ink border-amber-300",
  };

  const defaultIcon: Record<ChipTone, React.ReactNode> = {
    success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
    warning: <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
    danger: <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
    info: <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
    neutral: <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
    accent: <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        styles[tone],
        className
      )}
    >
      {icon ?? defaultIcon[tone]}
      <span>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProgressRing (hand-built SVG, animates cleanly)
// ---------------------------------------------------------------------------

export function ProgressRing({
  value,
  max,
  size = 112,
  strokeWidth = 10,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(1.2, Math.max(0, value / max)) : 0;
  const displayPct = max > 0 ? Math.round((value / max) * 100) : 0;
  const clamped = Math.min(1, pct);
  const offset = circumference * (1 - clamped);
  const over = max > 0 && value > max;
  const near = !over && max > 0 && value / max >= 0.85;

  const strokeColor = over
    ? "var(--danger)"
    : near
    ? "var(--warning)"
    : "var(--primary)";

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${displayPct}% of budget committed`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-bold tabular-nums text-ink">
          {displayPct}%
        </span>
        {label ? (
          <span className="text-[11px] font-medium text-ink-muted">{label}</span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryBar
// ---------------------------------------------------------------------------

export function CategoryBar({
  name,
  committedLabel,
  allocatedLabel,
  ratio,
  overAllocated,
  nearLimit,
  priceUnknownCount,
}: {
  name: string;
  committedLabel: string;
  allocatedLabel: string;
  ratio: number;
  overAllocated: boolean;
  nearLimit: boolean;
  priceUnknownCount?: number;
}) {
  const widthPct = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const barColor = overAllocated
    ? "bg-danger"
    : nearLimit
    ? "bg-warning"
    : "bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">{name}</span>
          {overAllocated ? (
            <StatusChip label="Over allocation" tone="danger" />
          ) : nearLimit ? (
            <StatusChip label="Near limit" tone="warning" />
          ) : null}
          {priceUnknownCount && priceUnknownCount > 0 ? (
            <StatusChip
              label={`${priceUnknownCount} price unknown`}
              tone="info"
            />
          ) : null}
        </div>
        <div className="text-sm tabular-nums text-ink-muted">
          <strong className="text-ink">{committedLabel}</strong> of {allocatedLabel}
        </div>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2 border border-border">
        <div
          className={clsx("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton & EmptyState
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-control bg-surface-2",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-ink">
        {icon ?? <Sparkles className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog (accessible modal; bottom sheet on mobile, centered on desktop)
// ---------------------------------------------------------------------------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[1px]" />
        <RadixDialog.Content className="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-card border border-border bg-surface p-6 shadow-soft sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="font-display text-xl font-semibold text-ink">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Close dialog"
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </RadixDialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Toast Context
// ---------------------------------------------------------------------------

interface ToastItem {
  id: string;
  message: string;
  tone: "success" | "error" | "info";
}

const ToastCtx = createContext<{
  pushToast: (message: string, tone?: ToastItem["tone"]) => void;
}>({ pushToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (message: string, tone: ToastItem["tone"] = "info") => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, 4000);
    },
    []
  );

  return (
    <ToastCtx.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 right-4 z-[60] flex max-w-sm flex-col gap-2 sm:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={clsx(
              "flex items-center gap-2 rounded-control border px-4 py-3 text-sm font-medium shadow-soft",
              item.tone === "success" && "border-emerald-200 bg-emerald-50 text-success",
              item.tone === "error" && "border-red-200 bg-red-50 text-danger",
              item.tone === "info" && "border-border bg-surface text-ink"
            )}
          >
            {item.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : item.tone === "error" ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Info className="h-4 w-4 shrink-0" />
            )}
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------------------------------------------------------------------------
// EventIllustration (inline tasteful SVG per event type)
// ---------------------------------------------------------------------------

export function EventIllustration({
  type,
  className,
}: {
  type: EventType;
  className?: string;
}) {
  if (type === "wedding" || type === "engagement") {
    return (
      <svg
        viewBox="0 0 64 64"
        className={clsx("h-12 w-12", className)}
        aria-hidden="true"
      >
        <path
          d="M12 54V28c0-11 9-20 20-20s20 9 20 20v26"
          fill="none"
          stroke="#0F5C5C"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M18 26c4 6 24 6 28 0"
          fill="none"
          stroke="#F2A81D"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="32" cy="18" r="4" fill="#F2A81D" />
        <path d="M8 54h48" stroke="#2A2118" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "birthday") {
    return (
      <svg
        viewBox="0 0 64 64"
        className={clsx("h-12 w-12", className)}
        aria-hidden="true"
      >
        <rect x="14" y="32" width="36" height="20" rx="5" fill="#FFE8B3" stroke="#0F5C5C" strokeWidth="2.5" />
        <path d="M14 40c6 4 12-4 18 0s12-4 18 0" fill="none" stroke="#F2A81D" strokeWidth="2.5" />
        <line x1="32" y1="20" x2="32" y2="32" stroke="#0F5C5C" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 10c3 4 3 8 0 10-3-2-3-6 0-10z" fill="#F2A81D" />
      </svg>
    );
  }
  if (type === "festival") {
    return (
      <svg
        viewBox="0 0 64 64"
        className={clsx("h-12 w-12", className)}
        aria-hidden="true"
      >
        <path d="M12 38c0 10 9 16 20 16s20-6 20-16H12z" fill="#FFE8B3" stroke="#0F5C5C" strokeWidth="2.5" />
        <path d="M32 12c6 8 6 16 0 22-6-6-6-14 0-22z" fill="#F2A81D" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 64 64"
      className={clsx("h-12 w-12", className)}
      aria-hidden="true"
    >
      <path d="M12 18c6 6 14 6 20 0 6 6 14 6 20 0" fill="none" stroke="#1F7A4D" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="40" r="12" fill="#FFE8B3" stroke="#0F5C5C" strokeWidth="2.5" />
      <path d="M26 28h12" stroke="#F2A81D" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Badges, Language Toggle & Usage Meter
// ---------------------------------------------------------------------------

export function PlanBadge({ plan }: { plan: "free" | "pass" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold",
        plan === "pass"
          ? "bg-accent text-ink"
          : "border border-border bg-surface-2 text-ink"
      )}
    >
      {plan === "pass" ? "Event Pass" : "Free Plan"}
    </span>
  );
}

export function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const near = limit > 0 && used / limit >= 0.8;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium text-ink-muted">
        <span>{label}</span>
        <span className={clsx("tabular-nums font-semibold", near ? "text-warning" : "text-ink")}>
          {used} of {limit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2 border border-border">
        <div
          className={clsx(
            "h-full rounded-full transition-all",
            near ? "bg-warning" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function LanguageToggle({
  value,
  onChange,
}: {
  value: LanguageCode;
  onChange: (lang: LanguageCode) => void;
}) {
  const options: Array<{ code: LanguageCode; label: string }> = [
    { code: "en-IN", label: "EN" },
    { code: "kn-IN", label: "ಕನ್ನಡ" },
    { code: "hi-IN", label: "हिन्दी" },
  ];
  return (
    <div
      className="inline-flex rounded-full border border-border bg-surface p-0.5"
      role="group"
      aria-label="Language"
    >
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => onChange(opt.code)}
          className={clsx(
            "min-h-[34px] rounded-full px-2.5 text-xs font-semibold transition-colors",
            value === opt.code
              ? "bg-primary text-white"
              : "text-ink-muted hover:text-ink"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function FlagChip({
  source,
  refreshedAt,
  onRefresh,
  loading,
}: {
  source: "flagsmith" | "defaults";
  refreshedAt: string;
  onRefresh: () => void;
  loading?: boolean;
}) {
  const timeStr = refreshedAt
    ? new Date(refreshedAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "--:--:--";

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-muted">
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          source === "flagsmith" ? "bg-success" : "bg-warning"
        )}
        aria-hidden="true"
      />
      <span>
        {source === "flagsmith"
          ? `Flags refreshed ${timeStr}, from Flagsmith`
          : `Flagsmith unreachable: using defaults (${timeStr})`}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover disabled:opacity-50"
      >
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );
}
