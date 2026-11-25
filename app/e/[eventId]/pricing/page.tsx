"use client";

import React, { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  Dialog,
  PlanBadge,
  StatusChip,
  useToast,
} from "@/components/ui/primitives";
import { PageGuide } from "@/components/ui/PageGuide";
import { formatINR } from "@/lib/domain/budget";

export default function PricingPage() {
  const { pushToast } = useToast();
  const {
    eventId,
    token,
    event,
    member,
    flags,
    refreshEvent,
    refreshFlags,
  } = useEventContext();

  const [selectedDuration, setSelectedDuration] = useState<30 | 60>(60);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDuration, setConfirmDuration] = useState<30 | 60>(60);
  const [activating, setActivating] = useState(false);

  if (!event || !member) return null;

  const isOrganizer = member.role === "organizer";
  const limits = flags.plan_limits;

  const openActivateDialog = (duration: 30 | 60) => {
    setConfirmDuration(duration);
    setConfirmOpen(true);
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      const res = await fetch(
        `/api/pricing/activate?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationDays: confirmDuration }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(data?.error ?? "Could not activate Event Pass.", "error");
        return;
      }
      setConfirmOpen(false);
      pushToast(
        `${confirmDuration}-day Event Pass activated in demo mode.`,
        "success"
      );
      await Promise.all([refreshEvent(), refreshFlags()]);
    } catch {
      pushToast("Network error activating Event Pass.", "error");
    } finally {
      setActivating(false);
    }
  };

  const comparisonRows = [
    {
      feature: "Family members in room",
      free: `${limits.free.members}`,
      p30: `${limits.pass_30.members}`,
      p60: `${limits.pass_60.members}`,
    },
    {
      feature: "Sarvam voice requests (EN / KN / HI)",
      free: `${flags.free_voice_requests_limit || limits.free.voice_requests}`,
      p30: `${limits.pass_30.voice_requests}`,
      p60: `${limits.pass_60.voice_requests}`,
    },
    {
      feature: "Planning agent messages",
      free: `${flags.free_agent_messages_limit || limits.free.agent_messages}`,
      p30: `${limits.pass_30.agent_messages}`,
      p60: `${limits.pass_60.agent_messages}`,
    },
    {
      feature: "Google Places vendor searches",
      free: `${limits.free.vendor_searches}`,
      p30: `${limits.pass_30.vendor_searches}`,
      p60: `${limits.pass_60.vendor_searches}`,
    },
    {
      feature: "Leftover food NGO outreach runs",
      free: `${limits.free.leftover_outreach}`,
      p30: `${limits.pass_30.leftover_outreach}`,
      p60: `${limits.pass_60.leftover_outreach}`,
    },
    {
      feature: "NudgeBee family approval workflows",
      free: "Included",
      p30: "Included",
      p60: "Included",
    },
    {
      feature: "Role-based server amount hiding",
      free: "Included",
      p30: "Included",
      p60: "Included",
    },
  ];

  const faqs = [
    {
      q: "Why an Event Pass instead of a monthly subscription?",
      a: "Families plan an engagement or wedding for a few weeks, then celebrate. You should never have to remember to cancel a recurring subscription after the event.",
    },
    {
      q: "What happens if our event finishes on the Free Plan?",
      a: "You still keep full access to your budget, tasks, NudgeBee approvals, and role-based links. Event Pass simply raises voice, agent, vendor search, and member allowances.",
    },
    {
      q: "Is any real money charged if I click Activate pass?",
      a: "No. Prices shown are for testing. No payment is taken in this demo; activating switches the event plan to Event Pass and syncs the Flagsmith plan trait immediately.",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PlanBadge plan={event.plan} />
          {event.pass_expires_at ? (
            <span className="text-xs text-ink-muted tabular-nums">
              Pass active until {event.pass_expires_at.slice(0, 10)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-ink max-w-3xl leading-tight">
            Plan your event like you hired a planner. Pay only for the weeks you
            need.
          </h1>
          <PageGuide
            title="Pricing & Event Pass"
            summary="Compare Free vs 30-day and 60-day Event Passes — all allowances are served live from Flagsmith remote config."
            steps={[
              "Toggle between 30-day and 60-day pass durations based on your event timeline.",
              "Click 'Activate pass' (Organizer only) to test Flagsmith trait switching — no payment is taken.",
              "Core safety, budget tracking, NudgeBee approvals, and run-sheet sharing always stay free.",
            ]}
            note="Prices shown are illustrative test prices only."
          />
        </div>
        <p className="text-sm text-ink-muted max-w-2xl">
          One pass covers your whole household room. Switch between 30-day and
          60-day pass options below — allowances update live from Flagsmith.
        </p>

        {/* Honest Demo Pricing Note */}
        <div className="rounded-control border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-warning">
          Prices shown are for testing. No payment is taken in this demo.
        </div>
      </div>

      {/* 30 / 60 Day Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-ink">Pass window:</span>
        <div
          className="inline-flex rounded-full border border-border bg-surface p-1"
          role="group"
          aria-label="Pass duration"
        >
          {([30, 60] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setSelectedDuration(days)}
              className={clsx(
                "min-h-[48px] rounded-full px-5 text-sm font-semibold transition-colors",
                selectedDuration === days
                  ? "bg-primary text-white"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              {days}-day pass
            </button>
          ))}
        </div>
      </div>

      {/* 3 Plan Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Free Plan */}
        <Card className="flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-ink">
                Free Plan
              </h2>
              {event.plan === "free" ? (
                <StatusChip label="Current plan" tone="info" />
              ) : null}
            </div>
            <div className="font-display text-3xl font-bold text-ink tabular-nums">
              {formatINR(0)}
            </div>
            <p className="text-sm text-ink-muted">
              Calm planning for small gatherings and trying Tayyari with family.
            </p>
            <ul className="space-y-2 pt-2 text-sm text-ink">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>Up to {limits.free.members} family members</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>
                  {flags.free_voice_requests_limit || limits.free.voice_requests}{" "}
                  voice change requests
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>
                  {flags.free_agent_messages_limit || limits.free.agent_messages}{" "}
                  planning agent messages
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>{limits.free.vendor_searches} vendor searches</span>
              </li>
            </ul>
          </div>
          <Button variant="secondary" disabled className="w-full">
            {event.plan === "free" ? "Active" : "Included by default"}
          </Button>
        </Card>

        {/* 30-day Event Pass */}
        <Card
          className={clsx(
            "flex flex-col justify-between space-y-5",
            selectedDuration === 30 && "ring-2 ring-primary"
          )}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-ink">
                30-day Event Pass
              </h2>
              <StatusChip label="Birthdays & Pujas" tone="neutral" />
            </div>
            <div className="font-display text-3xl font-bold text-ink tabular-nums">
              {formatINR(299)}{" "}
              <span className="text-sm font-normal text-ink-muted">
                / 30 days
              </span>
            </div>
            <p className="text-sm text-ink-muted">
              Ideal for engagements, milestone birthdays, and housewarmings.
            </p>
            <ul className="space-y-2 pt-2 text-sm text-ink">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>Up to {limits.pass_30.members} family members</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>{limits.pass_30.voice_requests} voice requests</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>{limits.pass_30.agent_messages} planning agent messages</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>{limits.pass_30.vendor_searches} vendor searches</span>
              </li>
            </ul>
          </div>

          <Button
            variant={selectedDuration === 30 ? "primary" : "secondary"}
            disabled={!isOrganizer}
            onClick={() => openActivateDialog(30)}
            className="w-full"
          >
            {isOrganizer ? "Activate 30-day pass" : "Ask organizer to activate"}
          </Button>
        </Card>

        {/* 60-day Event Pass */}
        <Card
          className={clsx(
            "relative flex flex-col justify-between space-y-5 overflow-hidden",
            selectedDuration === 60
              ? "border-accent ring-2 ring-accent"
              : "border-amber-300"
          )}
        >
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-bold text-ink">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Best for weddings</span>
          </div>

          <div className="space-y-3 pt-4">
            <h2 className="font-display text-xl font-bold text-ink">
              60-day Event Pass
            </h2>
            <div className="font-display text-3xl font-bold text-ink tabular-nums">
              {formatINR(499)}{" "}
              <span className="text-sm font-normal text-ink-muted">
                / 60 days
              </span>
            </div>
            <p className="text-sm text-ink-muted">
              Two full months of multi-household coordination and vendor quotes.
            </p>
            <ul className="space-y-2 pt-2 text-sm text-ink">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>Up to {limits.pass_60.members} family members</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>{limits.pass_60.voice_requests} voice requests</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>{limits.pass_60.agent_messages} planning agent messages</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <span>{limits.pass_60.vendor_searches} vendor searches</span>
              </li>
            </ul>
          </div>

          <Button
            variant="accent"
            disabled={!isOrganizer}
            onClick={() => openActivateDialog(60)}
            className="w-full"
          >
            {isOrganizer ? "Activate 60-day pass" : "Ask organizer to activate"}
          </Button>
        </Card>
      </div>

      {/* Responsive Comparison: Cards on Mobile, Table on Desktop */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-ink marigold-underline">
          Compare allowances
        </h2>

        {/* Mobile Cards (<768px) */}
        <div className="space-y-3 md:hidden pt-1">
          {comparisonRows.map((row) => (
            <Card key={row.feature} className="space-y-2 p-4">
              <div className="font-semibold text-ink">{row.feature}</div>
              <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                <div className="rounded-control bg-bg p-2">
                  <div className="text-ink-muted">Free</div>
                  <div className="font-bold text-ink">{row.free}</div>
                </div>
                <div className="rounded-control bg-bg p-2">
                  <div className="text-ink-muted">30-day</div>
                  <div className="font-bold text-ink">{row.p30}</div>
                </div>
                <div className="rounded-control bg-accent-soft/50 p-2">
                  <div className="text-ink-muted">60-day</div>
                  <div className="font-bold text-ink">{row.p60}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Desktop Table (>=768px) */}
        <Card className="hidden md:block overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-2/60">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-ink">Feature</th>
                <th className="px-5 py-3.5 font-semibold text-ink tabular-nums">
                  Free ({formatINR(0)})
                </th>
                <th className="px-5 py-3.5 font-semibold text-ink tabular-nums">
                  30-day ({formatINR(299)})
                </th>
                <th className="px-5 py-3.5 font-semibold text-ink tabular-nums">
                  60-day ({formatINR(499)})
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {comparisonRows.map((row) => (
                <tr key={row.feature}>
                  <td className="px-5 py-3 font-medium text-ink">
                    {row.feature}
                  </td>
                  <td className="px-5 py-3 text-ink-muted tabular-nums">
                    {row.free}
                  </td>
                  <td className="px-5 py-3 text-ink-muted tabular-nums">
                    {row.p30}
                  </td>
                  <td className="px-5 py-3 font-semibold text-ink tabular-nums">
                    {row.p60}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-ink marigold-underline">
          Frequently asked questions
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 pt-1">
          {faqs.map((item) => (
            <Card key={item.q} className="space-y-2">
              <h3 className="font-display text-base font-bold text-ink">
                {item.q}
              </h3>
              <p className="text-sm text-ink-muted">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Activate Pass Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Activate ${confirmDuration}-day Event Pass?`}
        description="Prices shown are for testing. No payment is taken in this demo."
      >
        <div className="space-y-4">
          <div className="rounded-control border border-border bg-bg p-4 text-sm text-ink space-y-1 tabular-nums">
            <div>
              Plan: <strong>{confirmDuration}-day Event Pass</strong> (
              {formatINR(confirmDuration === 30 ? 299 : 499)} test display price)
            </div>
            <div>
              Event: <strong>{event.name}</strong>
            </div>
            <div>
              Updates Flagsmith trait <code className="font-mono">plan=pass</code>{" "}
              and unlocks higher voice, agent, and vendor allowances immediately.
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={activating}
              onClick={handleActivate}
            >
              Confirm &amp; Activate Pass
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
