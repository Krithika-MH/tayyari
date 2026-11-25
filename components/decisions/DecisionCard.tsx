"use client";

import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  Send,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import type {
  ExpenseRecord,
  LanguageCode,
  MemberRecord,
  ProposalRecord,
  ProposalStatus,
} from "@/lib/contracts";
import type {
  PublicMember,
  SanitizedExpense,
  SanitizedProposal,
} from "@/components/shell/EventContext";
import { formatINR, formatSignedINR } from "@/lib/domain/budget";
import { tr } from "@/lib/i18n";
import { Button, Card, StatusChip, type ChipTone } from "@/components/ui/primitives";

export interface DecisionCardProps {
  proposal: ProposalRecord | SanitizedProposal;
  expense?: ExpenseRecord | SanitizedExpense;
  members: Array<MemberRecord | PublicMember>;
  canSeeAmounts: boolean;
  cardStyle: "impact_first" | "compact";
  eventId: string;
  token: string;
  languageCode: LanguageCode;
  currentMember: MemberRecord | PublicMember;
  devCallbackEnabled: boolean;
  onUpdated: () => Promise<void> | void;
  highlighted?: boolean;
}

function getStatusChipProps(
  status: ProposalStatus,
  vendorConfirmed: boolean,
  lang: LanguageCode
): { label: string; tone: ChipTone } {
  switch (status) {
    case "draft":
      return { label: "Draft (not sent yet)", tone: "neutral" };
    case "pending_approval":
      return { label: tr(lang, "waitingApproval"), tone: "warning" };
    case "approved":
      return vendorConfirmed
        ? { label: tr(lang, "vendorAcknowledged"), tone: "success" }
        : { label: tr(lang, "vendorPending"), tone: "info" };
    case "rejected":
      return { label: "Declined in NudgeBee", tone: "danger" };
    case "stale":
      return { label: "Stale (expense changed)", tone: "warning" };
    case "failed_to_dispatch":
      return { label: "Could not reach NudgeBee", tone: "danger" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "needs_discussion":
      return { label: "Needs family discussion", tone: "accent" };
  }
}

function StatusTimeline({
  status,
  vendorConfirmed,
}: {
  status: ProposalStatus;
  vendorConfirmed: boolean;
}) {
  const steps = [
    {
      key: "proposed",
      label: "Proposed",
      state: "done" as const,
    },
    {
      key: "nudgebee",
      label:
        status === "failed_to_dispatch"
          ? "NudgeBee failed"
          : "Waiting in NudgeBee",
      state:
        status === "failed_to_dispatch"
          ? ("error" as const)
          : status === "pending_approval"
          ? ("active" as const)
          : status === "approved" || status === "rejected"
          ? ("done" as const)
          : ("upcoming" as const),
    },
    {
      key: "family",
      label:
        status === "rejected"
          ? "Family declined"
          : status === "stale"
          ? "Marked stale"
          : "Family approved",
      state:
        status === "rejected"
          ? ("error" as const)
          : status === "stale"
          ? ("error" as const)
          : status === "approved"
          ? ("done" as const)
          : ("upcoming" as const),
    },
    {
      key: "vendor_pending",
      label: "Vendor confirmation pending",
      state:
        status === "approved"
          ? vendorConfirmed
            ? ("done" as const)
            : ("active" as const)
          : ("upcoming" as const),
    },
    {
      key: "vendor_ack",
      label: "Vendor acknowledged",
      state:
        status === "approved" && vendorConfirmed
          ? ("done" as const)
          : ("upcoming" as const),
    },
  ];

  return (
    <ol
      className="grid gap-2 sm:grid-cols-5"
      aria-label="Decision progress timeline"
    >
      {steps.map((step, idx) => (
        <li
          key={step.key}
          className={clsx(
            "flex items-center gap-2 rounded-control border px-2.5 py-2 text-xs font-medium",
            step.state === "done" &&
              "border-emerald-200 bg-emerald-50 text-success",
            step.state === "active" &&
              "border-amber-300 bg-accent-soft text-ink",
            step.state === "error" && "border-red-200 bg-red-50 text-danger",
            step.state === "upcoming" &&
              "border-border bg-surface-2/40 text-ink-muted"
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
            {step.state === "done" ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : step.state === "error" ? (
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : step.state === "active" ? (
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              idx + 1
            )}
          </span>
          <span className="leading-tight">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function DecisionCard({
  proposal,
  expense,
  members,
  canSeeAmounts,
  cardStyle,
  eventId,
  token,
  languageCode,
  currentMember,
  devCallbackEnabled,
  onUpdated,
  highlighted = false,
}: DecisionCardProps) {
  const [expanded, setExpanded] = useState(cardStyle === "impact_first");
  const [submitting, setSubmitting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [vendorBusy, setVendorBusy] = useState(false);
  const [vendorNote, setVendorNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ttsHidden, setTtsHidden] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const expenseTitle = expense?.title ?? "Expense item";
  const vendorConfirmed = expense?.vendor_confirmation === "acknowledged";
  const chip = getStatusChipProps(proposal.status, vendorConfirmed, languageCode);

  const decisionOwner = members.find(
    (m) => m.id === proposal.decision_owner_id
  );
  const taskOwner = members.find((m) => m.id === proposal.task_owner_id);

  const deltaINR = proposal.impact?.deltaINR ?? null;
  const projectedINR = proposal.impact?.projectedCommittedINR ?? null;
  const overUnderINR = proposal.impact?.overUnderBudgetINR ?? null;
  const altSample = proposal.impact?.alternativeSample ?? null;
  const hasAmounts =
    canSeeAmounts && deltaINR !== null && projectedINR !== null;

  const canSubmit =
    (proposal.status === "draft" || proposal.status === "failed_to_dispatch") &&
    (currentMember.role === "organizer" ||
      currentMember.role === "decision_owner" ||
      proposal.requested_by === currentMember.id);

  const canRecordVendorResponse =
    proposal.status === "approved" &&
    !vendorConfirmed &&
    (currentMember.role === "organizer" ||
      currentMember.role === "decision_owner" ||
      currentMember.role === "helper");

  const canDevSimulate =
    devCallbackEnabled &&
    proposal.status === "pending_approval" &&
    (currentMember.role === "organizer" ||
      currentMember.role === "decision_owner");

  const baselineUnchanged = proposal.status !== "approved";

  async function handleSubmitToNudgeBee() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/decisions/${encodeURIComponent(proposal.id)}/submit?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(
          data.error || "Could not send to NudgeBee. Please try again."
        );
      }
      await onUpdated();
    } catch {
      setErrorMsg("Network error while contacting NudgeBee. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVendorAcknowledged() {
    setVendorBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/decisions/${encodeURIComponent(proposal.id)}/vendor-response?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acknowledged: true,
            note: vendorNote.trim() || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Could not record vendor response.");
        return;
      }
      setVendorNote("");
      await onUpdated();
    } catch {
      setErrorMsg("Could not save vendor response. Please try again.");
    } finally {
      setVendorBusy(false);
    }
  }

  async function handleDevSimulate(decision: "approved" | "rejected") {
    setSimulating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/decisions/${encodeURIComponent(proposal.id)}/dev-simulate?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Dev simulation failed.");
        return;
      }
      await onUpdated();
    } catch {
      setErrorMsg("Dev simulation request failed.");
    } finally {
      setSimulating(false);
    }
  }

  async function handleListen() {
    if (ttsPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setTtsPlaying(false);
      return;
    }

    setTtsLoading(true);
    try {
      const impactSentence =
        hasAmounts && deltaINR !== null && projectedINR !== null
          ? `Budget change is ${formatSignedINR(deltaINR)}, making total committed ${formatINR(projectedINR)}.`
          : "";
      const summaryText =
        `${expenseTitle}: change quantity from ${proposal.previous_value} to ${proposal.requested_value}. ${impactSentence} Current status: ${chip.label}.`.slice(
          0,
          480
        );

      const res = await fetch(
        `/api/tts?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: summaryText,
            language_code: languageCode,
          }),
        }
      );
      if (!res.ok) {
        setTtsHidden(true);
        return;
      }
      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!data.audioBase64) {
        setTtsHidden(true);
        return;
      }
      const audio = new Audio(
        `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`
      );
      audioRef.current = audio;
      audio.onended = () => setTtsPlaying(false);
      audio.onerror = () => setTtsPlaying(false);
      setTtsPlaying(true);
      await audio.play();
    } catch {
      setTtsHidden(true);
    } finally {
      setTtsLoading(false);
    }
  }

  const overUnderText =
    hasAmounts && overUnderINR !== null
      ? overUnderINR > 0
        ? `Over budget by ${formatINR(overUnderINR)}`
        : overUnderINR < 0
        ? `Under budget by ${formatINR(Math.abs(overUnderINR))}`
        : "Right on total budget"
      : null;

  const isCompact = cardStyle === "compact";

  return (
    <Card
      id={`proposal-${proposal.id}`}
      className={clsx(
        "space-y-4 transition-shadow",
        highlighted && "ring-2 ring-accent"
      )}
    >
      {/* Header / Variant Top */}
      {isCompact ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-semibold text-ink">
                {expenseTitle}: {proposal.previous_value} →{" "}
                {proposal.requested_value}
              </h3>
              <StatusChip label={chip.label} tone={chip.tone} />
              {baselineUnchanged ? (
                <StatusChip label="Baseline unchanged" tone="neutral" />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
              {hasAmounts && deltaINR !== null ? (
                <span className="font-semibold tabular-nums text-ink">
                  {formatSignedINR(deltaINR)}
                </span>
              ) : (
                <span>{tr(languageCode, "amountsHiddenNotice")}</span>
              )}
              {overUnderText ? (
                <span
                  className={clsx(
                    "font-medium tabular-nums",
                    overUnderINR && overUnderINR > 0
                      ? "text-danger"
                      : "text-success"
                  )}
                >
                  {overUnderText}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!ttsHidden ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={ttsLoading}
                onClick={handleListen}
                aria-label={ttsPlaying ? "Stop audio" : "Listen to summary"}
              >
                {ttsPlaying ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
                {ttsPlaying ? "Stop" : "Listen"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide impact
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  View impact
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip label={chip.label} tone={chip.tone} />
                {baselineUnchanged ? (
                  <StatusChip label="Baseline unchanged" tone="neutral" />
                ) : null}
              </div>
              <h3 className="font-display text-xl font-semibold text-ink">
                {expenseTitle}: {proposal.previous_value} →{" "}
                {proposal.requested_value}
              </h3>
            </div>

            {!ttsHidden ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={ttsLoading}
                onClick={handleListen}
              >
                {ttsPlaying ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
                {ttsPlaying ? "Stop" : "Listen"}
              </Button>
            ) : null}
          </div>

          {/* Big Impact Banner (Impact-First Layout) */}
          <div className="rounded-control border border-border bg-surface-2/60 p-4">
            {hasAmounts && deltaINR !== null && projectedINR !== null ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Cost difference
                  </div>
                  <div
                    className={clsx(
                      "mt-0.5 text-2xl font-bold tabular-nums",
                      deltaINR > 0 ? "text-warning" : "text-success"
                    )}
                  >
                    {formatSignedINR(deltaINR)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Projected total committed
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-ink">
                    {formatINR(projectedINR)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Budget position
                  </div>
                  <div
                    className={clsx(
                      "mt-0.5 text-base font-bold tabular-nums",
                      overUnderINR && overUnderINR > 0
                        ? "text-danger"
                        : "text-success"
                    )}
                  >
                    {overUnderText}
                  </div>
                </div>
              </div>
            ) : !canSeeAmounts ? (
              <div className="text-sm font-medium text-ink-muted">
                {tr(languageCode, "amountsHiddenNotice")}
              </div>
            ) : (
              <div className="text-sm font-medium text-warning">
                Unit price missing — enter a unit price on this expense before
                sending for approval.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Impact & Timeline (Always shown in impact_first, expandable in compact) */}
      {(expanded || !isCompact) && (
        <div className="space-y-4 border-t border-border pt-4">
          {isCompact ? (
            <div className="rounded-control border border-border bg-surface-2/60 p-4">
              {hasAmounts && deltaINR !== null && projectedINR !== null ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      Cost difference
                    </div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-ink">
                      {formatSignedINR(deltaINR)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      Projected total
                    </div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-ink">
                      {formatINR(projectedINR)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      Budget position
                    </div>
                    <div
                      className={clsx(
                        "mt-0.5 text-sm font-bold tabular-nums",
                        overUnderINR && overUnderINR > 0
                          ? "text-danger"
                          : "text-success"
                      )}
                    >
                      {overUnderText}
                    </div>
                  </div>
                </div>
              ) : !canSeeAmounts ? (
                <div className="text-sm text-ink-muted">
                  {tr(languageCode, "amountsHiddenNotice")}
                </div>
              ) : (
                <div className="text-sm text-warning">
                  Unit price missing — enter a unit price before sending for
                  approval.
                </div>
              )}
            </div>
          ) : null}

          {/* Alternative Option */}
          {canSeeAmounts && altSample ? (
            <div className="rounded-control border border-border bg-bg p-3 text-sm text-ink">
              <span className="font-semibold text-primary">
                Option to consider:{" "}
              </span>
              <span className="tabular-nums">
                {altSample.quantity} units ({formatSignedINR(altSample.deltaINR)}{" "}
                → {formatINR(altSample.projectedCommittedINR)} total,{" "}
                {altSample.overUnderBudgetINR > 0
                  ? `${formatINR(altSample.overUnderBudgetINR)} over budget`
                  : `${formatINR(Math.abs(altSample.overUnderBudgetINR))} within budget`}
                )
              </span>
            </div>
          ) : null}

          {/* Spoken/Typed Source & Owners */}
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-control border border-border bg-bg p-3">
              <div className="text-xs font-medium text-ink-muted">
                Family request
              </div>
              <div className="mt-0.5 text-ink indic-leading">
                “{proposal.source_text}”
              </div>
            </div>
            <div className="rounded-control border border-border bg-bg p-3">
              <div className="text-xs font-medium text-ink-muted">
                Decision owner
              </div>
              <div className="mt-0.5 font-semibold text-ink">
                {decisionOwner?.display_name ?? "Not assigned"}
              </div>
            </div>
            <div className="rounded-control border border-border bg-bg p-3">
              <div className="text-xs font-medium text-ink-muted">
                Follow-up owner
              </div>
              <div className="mt-0.5 font-semibold text-ink">
                {taskOwner?.display_name ??
                  decisionOwner?.display_name ??
                  "Not assigned"}
              </div>
            </div>
          </div>

          {/* 5-Stage Status Timeline */}
          <StatusTimeline
            status={proposal.status}
            vendorConfirmed={vendorConfirmed}
          />

          {/* Audit Assumptions */}
          {canSeeAmounts && proposal.impact?.assumptions?.length ? (
            <div className="text-xs text-ink-muted">
              Basis: {proposal.impact.assumptions.join(" • ")}
            </div>
          ) : null}
        </div>
      )}

      {/* Error banner */}
      {errorMsg ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-red-200 bg-red-50 p-3 text-sm text-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {canSubmit ? (
          <Button
            type="button"
            variant={
              proposal.status === "failed_to_dispatch" ? "accent" : "primary"
            }
            loading={submitting}
            onClick={handleSubmitToNudgeBee}
          >
            {proposal.status === "failed_to_dispatch" ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Retry NudgeBee
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send to NudgeBee
              </>
            )}
          </Button>
        ) : null}
      </div>

      {/* Vendor Confirmation Form (after family approval) */}
      {canRecordVendorResponse ? (
        <div className="space-y-3 rounded-control border border-blue-200 bg-blue-50/60 p-4">
          <div className="text-sm font-semibold text-ink">
            Record vendor&apos;s response
          </div>
          <p className="text-xs text-ink-muted">
            Family approved this change. Confirm only after the vendor has
            explicitly agreed to the revised quantity ({proposal.requested_value}
            ).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={vendorNote}
              onChange={(e) => setVendorNote(e.target.value)}
              placeholder="Optional note (e.g., Confirmed with Raju Caterers on call)"
              className="min-h-[44px] flex-1 rounded-control border border-border bg-surface px-3 text-sm text-ink"
            />
            <Button
              type="button"
              variant="primary"
              loading={vendorBusy}
              onClick={handleVendorAcknowledged}
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark vendor acknowledged
            </Button>
          </div>
        </div>
      ) : null}

      {/* Dev-only Callback Simulation Banner */}
      {canDevSimulate ? (
        <div className="space-y-2 rounded-control border-2 border-dashed border-danger bg-red-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-danger">
            <AlertTriangle className="h-4 w-4" />
            NOT NUDGEBEE (DEV ONLY)
          </div>
          <p className="text-xs text-ink-muted">
            Local development simulation enabled via ENABLE_DEV_CALLBACK=true.
            Runs on server without exposing callback secret.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={simulating}
              onClick={() => handleDevSimulate("approved")}
            >
              Simulate Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={simulating}
              onClick={() => handleDevSimulate("rejected")}
            >
              Simulate Reject
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
