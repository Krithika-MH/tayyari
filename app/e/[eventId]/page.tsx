"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Mic,
  Scale,
  ShieldAlert,
  Store,
  Trash2,
  Users,
  Utensils,
} from "lucide-react";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  EventIllustration,
  ProgressRing,
  StatCard,
  StatusChip,
  UsageMeter,
  useToast,
} from "@/components/ui/primitives";
import { daysUntilIST, formatINR } from "@/lib/domain/budget";
import { tr } from "@/lib/i18n";
import { getActivePlanTier } from "@/lib/rate-limit";

function todayISTISO(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

export default function EventHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  const { pushToast } = useToast();
  const {
    eventId,
    token,
    event,
    member,
    members,
    tasks,
    proposals,
    activity,
    budgetSummary,
    flags,
    usage,
    lang,
    setAgentOpen,
  } = useEventContext();

  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const todayISO = useMemo(() => todayISTISO(), []);

  if (!event || !member) return null;

  const qs = `?t=${encodeURIComponent(token)}`;
  const daysLeft = daysUntilIST(event.event_date);

  const pendingDecisions = proposals.filter(
    (p) => p.status === "pending_approval" || p.status === "draft"
  );
  const staleProposals = proposals.filter((p) => p.status === "stale");
  const overdueTasks = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "declined" &&
      t.due_date < todayISO
  );
  const nextFiveTasks = tasks
    .filter((t) => t.status !== "completed" && t.status !== "declined")
    .slice(0, 5);

  const memberNameById = new Map(members.map((m) => [m.id, m.display_name]));

  const tierKey = getActivePlanTier(event);
  const limits = flags.plan_limits[tierKey];
  const voiceLimit =
    tierKey === "free"
      ? Math.min(limits.voice_requests, flags.free_voice_requests_limit || limits.voice_requests)
      : limits.voice_requests;
  const agentLimit =
    tierKey === "free"
      ? Math.min(limits.agent_messages, flags.free_agent_messages_limit || limits.agent_messages)
      : limits.agent_messages;

  const handleCopyLink = async (memberId: string, memberToken: string) => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/e/${eventId}?t=${encodeURIComponent(memberToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(memberId);
      pushToast("Family member link copied.", "success");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      pushToast("Could not copy link automatically.", "error");
    }
  };

  const handleDeleteEvent = async () => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}?t=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        pushToast(data?.error ?? "Could not delete event.", "error");
        setDeleting(false);
        return;
      }
      pushToast("Event deleted permanently.", "success");
      router.push("/");
    } catch {
      pushToast("Network error deleting event.", "error");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {isWelcome ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-success">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Your plan is ready. Welcome to the {event.name} room!</span>
          </div>
          <span className="text-xs">Role: {member.role.replace("_", " ")}</span>
        </div>
      ) : null}

      {event.is_demo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-warning">
          <span>
            Demo event active — sample Bengaluru engagement numbers are for
            walkthroughs only (Demo data, not a local market quote).
          </span>
          <StatusChip label="Demo data" tone="accent" />
        </div>
      ) : null}

      {/* Kolam Header Card */}
      <Card className="kolam-pattern overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-surface border border-border">
              <EventIllustration type={event.type} className="h-10 w-10" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-muted">
                Namaskara, {member.display_name}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
                {event.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  {event.event_date}
                </span>
                <span>·</span>
                <span>
                  {event.city}
                  {event.area ? `, ${event.area}` : ""}
                </span>
                <span>·</span>
                <span className="tabular-nums">{event.guest_count} guests</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-card border border-border bg-surface px-5 py-3 shadow-soft">
            <div className="text-right sm:text-center">
              <div className="font-display text-3xl sm:text-4xl font-bold text-primary tabular-nums">
                {daysLeft >= 0 ? daysLeft : 0}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {daysLeft === 0
                  ? "Event day"
                  : daysLeft < 0
                  ? "Completed"
                  : tr(lang, "daysToGo")}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Hero Budget Card */}
      {member.can_see_amounts &&
      budgetSummary &&
      budgetSummary.totalBudgetINR !== null &&
      budgetSummary.committedINR !== null &&
      budgetSummary.allocatedINR !== null &&
      budgetSummary.paidINR !== null &&
      budgetSummary.remainingOverallINR !== null ? (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold text-ink marigold-underline">
                Budget overview
              </h2>
              <p className="mt-2 text-sm text-ink-muted tabular-nums">
                Total budget:{" "}
                <strong className="text-ink">
                  {formatINR(budgetSummary.totalBudgetINR)}
                </strong>
                {budgetSummary.pendingProposalsTotalINR &&
                budgetSummary.pendingProposalsTotalINR !== 0 ? (
                  <span className="ml-2 text-xs text-warning">
                    ({budgetSummary.pendingProposalsTotalINR > 0 ? "+" : ""}
                    {formatINR(budgetSummary.pendingProposalsTotalINR)} pending
                    approval)
                  </span>
                ) : null}
              </p>
            </div>
            <Link href={`/e/${eventId}/budget${qs}`}>
              <Button variant="secondary" size="sm" className="min-h-[48px]">
                Open Budget
              </Button>
            </Link>
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex justify-center md:justify-start shrink-0">
              <ProgressRing
                value={budgetSummary.committedINR}
                max={budgetSummary.totalBudgetINR}
                size={128}
                strokeWidth={11}
                label="committed"
              />
            </div>

            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label={tr(lang, "allocated")}
                value={formatINR(budgetSummary.allocatedINR)}
              />
              <StatCard
                label={tr(lang, "committed")}
                value={formatINR(budgetSummary.committedINR)}
                tone={budgetSummary.overBudget ? "danger" : "neutral"}
              />
              <StatCard
                label={tr(lang, "paid")}
                value={formatINR(budgetSummary.paidINR)}
                tone="success"
              />
              <StatCard
                label={tr(lang, "remaining")}
                value={formatINR(budgetSummary.remainingOverallINR)}
                tone={
                  budgetSummary.remainingOverallINR < 0 ? "danger" : "success"
                }
              />
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center gap-3 bg-surface-2/50">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <div className="text-sm font-medium text-ink">
            {tr(lang, "amountsHiddenNotice")} You have full access to tasks,
            run-sheet timelines, guest logistics, and family coordination.
          </div>
        </Card>
      )}

      {/* Quick Actions 2x2 Grid */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-ink marigold-underline">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
          <Link
            href={`/e/${eventId}/decisions${qs}`}
            className="flex min-h-[72px] items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-surface-2"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-primary text-white">
              <Mic className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="font-semibold text-ink">
                {tr(lang, "speakChange")}
              </div>
              <div className="text-xs text-ink-muted">
                Record English, Kannada or Hindi request
              </div>
            </div>
          </Link>

          {flags.module_vendor_finder ? (
            <Link
              href={`/e/${eventId}/vendors${qs}`}
              className="flex min-h-[72px] items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-surface-2"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent text-ink">
                <Store className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="font-semibold text-ink">
                  {tr(lang, "findVendors")}
                </div>
                <div className="text-xs text-ink-muted">
                  Search near {event.area || event.city} &amp; compare quotes
                </div>
              </div>
            </Link>
          ) : null}

          {flags.module_leftover_food ? (
            <Link
              href={`/e/${eventId}/leftovers${qs}`}
              className="flex min-h-[72px] items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-surface-2"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-emerald-100 text-success">
                <Utensils className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="font-semibold text-ink">
                  {tr(lang, "logLeftovers")}
                </div>
                <div className="text-xs text-ink-muted">
                  Find nearby shelters &amp; coordinate safe pickup
                </div>
              </div>
            </Link>
          ) : null}

          {flags.module_planning_agent ? (
            <button
              type="button"
              onClick={() => setAgentOpen(true)}
              className="flex min-h-[72px] items-center gap-3 rounded-card border border-border bg-surface p-4 text-left shadow-soft transition-colors hover:bg-surface-2"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent-soft text-ink">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="font-semibold text-ink">
                  {tr(lang, "askTayyari")}
                </div>
                <div className="text-xs text-ink-muted">
                  Ask for run-sheets, tasks or budget check
                </div>
              </div>
            </button>
          ) : null}
        </div>
      </section>

      {/* Needs Your Attention + Next 5 Tasks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Needs Your Attention */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink marigold-underline">
              {tr(lang, "needsAttention")}
            </h2>
            <Link
              href={`/e/${eventId}/decisions${qs}`}
              className="inline-flex min-h-[48px] items-center text-xs font-semibold text-primary hover:underline"
            >
              Review decisions
            </Link>
          </div>

          {pendingDecisions.length === 0 &&
          staleProposals.length === 0 &&
          overdueTasks.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6 text-success" />}
              title="All calm right now"
              description="No overdue tasks, stale quotes, or pending family decisions."
            />
          ) : (
            <div className="space-y-2.5 pt-1">
              {pendingDecisions.map((p) => (
                <Link
                  key={p.id}
                  href={`/e/${eventId}/decisions${qs}`}
                  className="flex items-center justify-between gap-3 rounded-control border border-amber-200 bg-amber-50/70 p-3 hover:bg-amber-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {p.source_text}
                    </div>
                    <div className="text-xs text-ink-muted">
                      Quantity {p.previous_value} → {p.requested_value}
                      {member.can_see_amounts && p.impact.deltaINR !== null
                        ? ` (${p.impact.deltaINR >= 0 ? "+" : ""}${formatINR(
                            p.impact.deltaINR
                          )})`
                        : ""}
                    </div>
                  </div>
                  <StatusChip label="Pending approval" tone="warning" />
                </Link>
              ))}

              {staleProposals.map((p) => (
                <Link
                  key={p.id}
                  href={`/e/${eventId}/decisions${qs}`}
                  className="flex items-center justify-between gap-3 rounded-control border border-red-200 bg-red-50/70 p-3 hover:bg-red-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {p.source_text}
                    </div>
                    <div className="text-xs text-danger">
                      Quote changed while waiting — needs review
                    </div>
                  </div>
                  <StatusChip label="Stale" tone="danger" />
                </Link>
              ))}

              {overdueTasks.slice(0, 4).map((t) => (
                <Link
                  key={t.id}
                  href={`/e/${eventId}/plan${qs}`}
                  className="flex items-center justify-between gap-3 rounded-control border border-border bg-bg p-3 hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {t.title}
                    </div>
                    <div className="text-xs text-danger tabular-nums">
                      Due {t.due_date}
                      {t.owner_id
                        ? ` · ${memberNameById.get(t.owner_id) ?? "Family"}`
                        : ""}
                    </div>
                  </div>
                  <StatusChip
                    label={tr(lang, "overdue")}
                    tone="danger"
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  />
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Next 5 Tasks */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink marigold-underline">
              {tr(lang, "nextTasks")}
            </h2>
            <Link
              href={`/e/${eventId}/plan${qs}`}
              className="inline-flex min-h-[48px] items-center text-xs font-semibold text-primary hover:underline"
            >
              Open full plan
            </Link>
          </div>

          {nextFiveTasks.length === 0 ? (
            <EmptyState
              title="No upcoming tasks"
              description="Everything on your current plan is completed."
            />
          ) : (
            <div className="space-y-2.5 pt-1">
              {nextFiveTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-control border border-border bg-bg p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {t.title}
                    </div>
                    <div className="text-xs text-ink-muted tabular-nums">
                      {t.due_date}
                      {t.time_label ? ` · ${t.time_label}` : ""}
                      {t.owner_id
                        ? ` · ${memberNameById.get(t.owner_id) ?? "Family"}`
                        : ""}
                    </div>
                  </div>
                  <StatusChip
                    label={t.status}
                    tone={t.status === "accepted" ? "info" : "neutral"}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Usage Meters + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink marigold-underline">
              Plan allowance ({tierKey === "free" ? "Free" : "Event Pass"})
            </h2>
            <Link
              href={`/e/${eventId}/pricing${qs}`}
              className="inline-flex min-h-[48px] items-center text-xs font-semibold text-primary hover:underline"
            >
              View plans
            </Link>
          </div>
          <div className="space-y-3 pt-1">
            <UsageMeter
              label="Voice requests"
              used={usage.speech ?? 0}
              limit={voiceLimit}
            />
            <UsageMeter
              label="Agent messages"
              used={usage.agent ?? 0}
              limit={agentLimit}
            />
            <UsageMeter
              label="Vendor searches"
              used={usage.search ?? 0}
              limit={limits.vendor_searches}
            />
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-display text-lg font-bold text-ink marigold-underline">
            {tr(lang, "recentActivity")}
          </h2>
          {activity.length === 0 ? (
            <p className="text-sm text-ink-muted">No recent updates yet.</p>
          ) : (
            <ul className="space-y-2.5 pt-1">
              {activity.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="text-ink">{item.summary}</span>
                  <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Family Share Links & Organizer Danger Zone */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="font-semibold text-ink flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Family room &amp; privacy controls</span>
          </div>
          <p className="text-xs text-ink-muted">
            {members.length} family member(s) in this room.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {member.role === "organizer" ? (
            <>
              <Button variant="secondary" onClick={() => setShareOpen(true)}>
                <Users className="h-4 w-4" aria-hidden="true" />
                <span>Share family links</span>
              </Button>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Delete this event</span>
              </Button>
            </>
          ) : (
            <StatusChip label={`Signed in as ${member.display_name}`} tone="info" />
          )}
        </div>
      </Card>

      {/* Member Share Links Modal */}
      <Dialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Share personal family links"
        description="Send each person only their own link."
      >
        <div className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-bg p-3"
            >
              <div>
                <div className="font-semibold text-ink">{m.display_name}</div>
                <div className="text-xs text-ink-muted">
                  {m.role.replace("_", " ")} ·{" "}
                  {m.can_see_amounts ? "Can see amounts" : "Amounts hidden"}
                </div>
              </div>
              {m.access_token ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-[48px]"
                  onClick={() => handleCopyLink(m.id, m.access_token!)}
                >
                  {copiedId === m.id ? (
                    <Check className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{copiedId === m.id ? "Copied" : "Copy link"}</span>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Dialog>

      {/* Delete Event Confirmation Dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this event permanently?"
        description={`This removes "${event.name}", all budget items, tasks, proposals, and guest records. This action cannot be undone.`}
      >
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleting}
            onClick={handleDeleteEvent}
          >
            Yes, delete event
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
