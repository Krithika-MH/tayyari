"use client";

import React, { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { clsx } from "clsx";

export interface PageGuideProps {
  title: string;
  summary: string;
  steps: string[];
  note?: string;
  align?: "left" | "right";
}

export function PageGuide({
  title,
  summary,
  steps,
  note,
  align = "left",
}: PageGuideProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if (pinned) return;
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 150);
  };

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        aria-label={`How to use ${title}`}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          setPinned(next);
        }}
        onFocus={() => setOpen(true)}
        className={clsx(
          "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          open
            ? "border-primary bg-primary text-white shadow-sm"
            : "border-border bg-surface-2 text-primary hover:border-primary hover:bg-primary hover:text-white"
        )}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={`${title} guide`}
          className={clsx(
            "fixed left-4 right-4 top-20 z-50 rounded-card border border-border bg-surface p-4 text-left shadow-soft sm:absolute sm:top-full sm:mt-2 sm:w-80",
            align === "right"
              ? "sm:right-0 sm:left-auto"
              : "sm:left-0 sm:right-auto"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                How to use this page
              </div>
              <h3 className="font-display text-base font-bold text-ink">
                {title}
              </h3>
            </div>
            <button
              type="button"
              aria-label="Close page guide"
              onClick={() => {
                setOpen(false);
                setPinned(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
            {summary}
          </p>

          <ul className="mt-3 space-y-1.5 text-xs text-ink">
            {steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-ink">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ul>

          {note ? (
            <div className="mt-3 rounded-control border border-border bg-surface-2/60 px-2.5 py-2 text-[11px] font-medium text-ink-muted">
              {note}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
