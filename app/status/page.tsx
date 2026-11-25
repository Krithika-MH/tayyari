"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Database,
  Flag,
  MapPin,
  Mic,
  RefreshCw,
  Workflow,
} from "lucide-react";
import {
  Button,
  Card,
  Skeleton,
  StatusChip,
  type ChipTone,
} from "@/components/ui/primitives";
import { PageGuide } from "@/components/ui/PageGuide";

type HealthStatus = "green" | "amber" | "red";

interface HealthCheckItem {
  name: string;
  status: HealthStatus;
  detail: string;
}

interface HealthResponse {
  checkedAt: string;
  checks: HealthCheckItem[];
}

const SERVICE_META: Record<
  string,
  { purpose: string; icon: React.ReactNode }
> = {
  Supabase: {
    purpose: "Event, budget, decision, and audit persistence",
    icon: <Database className="h-5 w-5 text-primary" aria-hidden="true" />,
  },
  "Sarvam AI": {
    purpose: "Indic speech-to-text, intent extraction, drafting, and TTS",
    icon: <Mic className="h-5 w-5 text-primary" aria-hidden="true" />,
  },
  Flagsmith: {
    purpose: "Live feature flags, card layout variants, and plan limits",
    icon: <Flag className="h-5 w-5 text-primary" aria-hidden="true" />,
  },
  NudgeBee: {
    purpose: "Family approval workflows and idempotent webhook callbacks",
    icon: <Workflow className="h-5 w-5 text-primary" aria-hidden="true" />,
  },
  "Google Places": {
    purpose: "Local vendor discovery and nearby NGO food-outreach search",
    icon: <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />,
  },
};

function mapStatusToChip(status: HealthStatus): {
  label: string;
  tone: ChipTone;
} {
  switch (status) {
    case "green":
      return { label: "Healthy", tone: "success" };
    case "amber":
      return { label: "Fallback / Partial", tone: "warning" };
    case "red":
      return { label: "Unavailable", tone: "danger" };
  }
}

export default function StatusPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [returnHref, setReturnHref] = useState("/");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const rt = new URLSearchParams(window.location.search).get("returnTo");
      if (rt && rt.startsWith("/")) {
        setReturnHref(rt);
      }
    }
  }, []);

  const loadHealth = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Health endpoint returned HTTP ${res.status}`);
      }
      const json = (await res.json()) as HealthResponse;
      setData(json);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not load integration health status."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth(false);
  }, [loadHealth]);

  const checkedLabel = data?.checkedAt
    ? new Date(data.checkedAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "medium",
      })
    : "—";

  return (
    <div className="min-h-screen bg-bg">
      <div className="kolam-pattern border-b border-border bg-surface/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div className="space-y-2">
            <div>
              <Link
                href={returnHref}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {returnHref === "/" ? "Back to Tayyari" : "Back to Event Room"}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="marigold-underline font-display text-2xl font-bold text-ink sm:text-3xl">
                Integration Status
              </h1>
              <PageGuide
                title="Integration Status"
                summary="Live server-side health checks for Supabase, Sarvam AI, Flagsmith, NudgeBee, and Google Places."
                steps={[
                  "Green means configured and responding normally.",
                  "Amber means an optional key is missing and safe fallback mode is active.",
                  "Click 'Refresh checks' anytime after updating environment variables.",
                ]}
                note="NudgeBee check verifies configuration only and never triggers an approval run."
              />
            </div>
            <p className="pt-1 text-sm text-ink-muted">
              Live server-side checks for Tayyari&apos;s connected services. No
              secrets are exposed and no approval workflows are triggered.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button
              type="button"
              variant="primary"
              loading={refreshing}
              onClick={() => void loadHealth(true)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh checks
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Last checked: {checkedLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {errorMsg ? (
          <Card className="mb-6 border-red-200 bg-red-50 text-sm text-danger">
            {errorMsg}
          </Card>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(data?.checks ?? []).map((item) => {
              const meta = SERVICE_META[item.name] ?? {
                purpose: "Connected platform service",
                icon: (
                  <Activity
                    className="h-5 w-5 text-primary"
                    aria-hidden="true"
                  />
                ),
              };
              const chip = mapStatusToChip(item.status);
              return (
                <Card key={item.name} className="flex flex-col justify-between gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-2">
                        {meta.icon}
                      </div>
                      <div>
                        <h2 className="font-display text-lg font-semibold text-ink">
                          {item.name}
                        </h2>
                        <p className="text-xs text-ink-muted">{meta.purpose}</p>
                      </div>
                    </div>
                    <StatusChip label={chip.label} tone={chip.tone} />
                  </div>

                  <p className="rounded-control border border-border bg-bg p-3 text-sm text-ink">
                    {item.detail}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
