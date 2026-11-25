"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Scale,
  Send,
  Sparkles,
} from "lucide-react";
import type {
  ExpenseRecord,
  ExtractedIntent,
  ProposalRecord,
} from "@/lib/contracts";
import {
  computeImpact,
  formatINR,
  formatSignedINR,
} from "@/lib/domain/budget";
import { tr } from "@/lib/i18n";
import {
  useEventContext,
  type SanitizedExpense,
  type SanitizedProposal,
} from "@/components/shell/EventContext";
import { DecisionCard } from "@/components/decisions/DecisionCard";
import { VoiceRecorder } from "@/components/ui/VoiceRecorder";
import {
  Button,
  Card,
  EmptyState,
  FlagChip,
  Skeleton,
  StatusChip,
} from "@/components/ui/primitives";

type WizardStep = 1 | 2 | 3;

export default function DecisionsPage() {
  const {
    eventId,
    token,
    event,
    member,
    members,
    expenses,
    proposals: contextProposals,
    flags,
    lang,
    loading,
    error,
    refreshEvent,
    refreshFlags,
  } = useEventContext();

  const [proposals, setProposals] = useState<
    Array<ProposalRecord | SanitizedProposal>
  >([]);
  const [devCallbackEnabled, setDevCallbackEnabled] = useState(false);
  const [flagsRefreshing, setFlagsRefreshing] = useState(false);

  // 3-step decision proposal sheet state
  const [step, setStep] = useState<WizardStep>(1);
  const [sourceText, setSourceText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedIntent | null>(null);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [selectedExpenseId, setSelectedExpenseId] = useState("");
  const [requestedQtyInput, setRequestedQtyInput] = useState("");
  const [decisionOwnerId, setDecisionOwnerId] = useState("");
  const [taskOwnerId, setTaskOwnerId] = useState("");
  const [unitPriceDraft, setUnitPriceDraft] = useState("");
  const [savingUnitPrice, setSavingUnitPrice] = useState(false);

  const [submittingAction, setSubmittingAction] = useState<
    "draft" | "send" | null
  >(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [highlightedProposalId, setHighlightedProposalId] = useState<
    string | null
  >(null);

  const prevPendingIdsRef = useRef<string>("");

  // Keep local proposals seeded from EventContext initially
  useEffect(() => {
    if (contextProposals && contextProposals.length > 0 && proposals.length === 0) {
      setProposals(contextProposals);
    }
  }, [contextProposals, proposals.length]);

  // Default decision & task owners once members load
  useEffect(() => {
    if (!members.length) return;
    if (!decisionOwnerId) {
      const defDecision =
        members.find((m) => m.role === "decision_owner") ??
        members.find((m) => m.role === "organizer") ??
        members[0];
      if (defDecision) setDecisionOwnerId(defDecision.id);
    }
    if (!taskOwnerId) {
      const defTask =
        members.find((m) => m.role === "helper") ??
        member ??
        members[0];
      if (defTask) setTaskOwnerId(defTask.id);
    }
  }, [members, member, decisionOwnerId, taskOwnerId]);

  const fetchDecisions = useCallback(
    async (alsoRefreshEventIfResolved = false) => {
      if (!eventId || !token) return;
      try {
        const res = await fetch(
          `/api/decisions?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          proposals?: ProposalRecord[];
          devCallbackEnabled?: boolean;
        };
        const nextList = data.proposals ?? [];
        setProposals(nextList);
        setDevCallbackEnabled(Boolean(data.devCallbackEnabled));

        const nextPendingKey = nextList
          .filter((p) => p.status === "pending_approval")
          .map((p) => p.id)
          .sort()
          .join(",");
        if (
          alsoRefreshEventIfResolved &&
          prevPendingIdsRef.current &&
          prevPendingIdsRef.current !== nextPendingKey
        ) {
          await refreshEvent();
        }
        prevPendingIdsRef.current = nextPendingKey;
      } catch {
        // Silent polling resilience
      }
    },
    [eventId, token, refreshEvent]
  );

  useEffect(() => {
    void fetchDecisions(false);
  }, [fetchDecisions]);

  const hasPending = useMemo(
    () => proposals.some((p) => p.status === "pending_approval"),
    [proposals]
  );

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      void fetchDecisions(true);
    }, 3000);
    return () => clearInterval(timer);
  }, [hasPending, fetchDecisions]);

  const selectedExpense = useMemo(
    () => expenses.find((e) => e.id === selectedExpenseId),
    [expenses, selectedExpenseId]
  );

  const requestedQtyNum = useMemo(() => {
    const n = Number(requestedQtyInput);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [requestedQtyInput]);

  const previewImpact = useMemo(() => {
    if (
      !event ||
      event.total_budget_inr === null ||
      !member?.can_see_amounts ||
      !selectedExpense ||
      requestedQtyNum === null
    ) {
      return null;
    }
    const numericExpenses: ExpenseRecord[] = expenses.map((e) => ({
      ...e,
      unit_price_inr: e.unit_price_inr,
      committed_inr: e.committed_inr ?? 0,
      paid_inr: e.paid_inr ?? 0,
    }));
    return computeImpact(
      { total_budget_inr: event.total_budget_inr },
      numericExpenses,
      {
        expenseId: selectedExpense.id,
        previousValue: selectedExpense.quantity,
        requestedValue: requestedQtyNum,
      }
    );
  }, [event, member?.can_see_amounts, selectedExpense, requestedQtyNum, expenses]);

  async function handleTranscriptConfirmed(text: string) {
    setSourceText(text);
    setSheetError(null);
    setExtractWarning(null);
    setExtracting(true);

    try {
      const res = await fetch(
        `/api/speech/extract?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            language_code: lang,
          }),
        }
      );
      const data = (await res.json()) as {
        extracted?: ExtractedIntent;
        matchedExpenseId?: string | null;
        candidateExpenses?: Array<ExpenseRecord | SanitizedExpense>;
        error?: string;
      };

      if (!res.ok) {
        setExtractWarning(
          data.error ||
            "Could not auto-extract details. Please choose the expense item and quantity below."
        );
        setExtracted(null);
        setCandidateIds([]);
        if (!selectedExpenseId && expenses[0]) {
          setSelectedExpenseId(expenses[0].id);
        }
        setStep(2);
        return;
      }

      setExtracted(data.extracted ?? null);
      const candIds = (data.candidateExpenses ?? []).map((e) => e.id);
      setCandidateIds(candIds);

      if (data.matchedExpenseId) {
        setSelectedExpenseId(data.matchedExpenseId);
      } else if (candIds.length === 1) {
        setSelectedExpenseId(candIds[0]);
      } else {
        setSelectedExpenseId("");
        setExtractWarning(
          "Multiple items could match your request. Please pick the exact expense item below."
        );
      }

      if (
        data.extracted?.newQuantity &&
        Number.isFinite(data.extracted.newQuantity) &&
        data.extracted.newQuantity > 0
      ) {
        setRequestedQtyInput(String(Math.round(data.extracted.newQuantity)));
      } else {
        setRequestedQtyInput("");
      }

      setStep(2);
    } catch {
      setExtractWarning(
        "Extraction service was unreachable. Please select the expense item and enter the new quantity manually."
      );
      setStep(2);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSaveUnitPrice() {
    if (!selectedExpense) return;
    const price = Number(unitPriceDraft);
    if (!Number.isFinite(price) || price < 0) {
      setSheetError("Please enter a valid non-negative unit price in ₹.");
      return;
    }
    setSavingUnitPrice(true);
    setSheetError(null);
    try {
      const res = await fetch(
        `/api/expenses?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedExpense.id,
            unit_price_inr: Math.round(price),
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSheetError(
          data.error ||
            "Could not update unit price here. You can update it on the Budget page."
        );
        return;
      }
      setUnitPriceDraft("");
      await refreshEvent();
    } catch {
      setSheetError("Could not update unit price. Please try on the Budget page.");
    } finally {
      setSavingUnitPrice(false);
    }
  }

  async function handleCreateProposal(andSend: boolean) {
    if (!selectedExpense) {
      setSheetError("Please pick an expense item.");
      return;
    }
    if (requestedQtyNum === null || requestedQtyNum <= 0) {
      setSheetError("Please enter a valid whole-number quantity greater than 0.");
      return;
    }
    if (requestedQtyNum === selectedExpense.quantity) {
      setSheetError(
        `New quantity must differ from the current quantity (${selectedExpense.quantity}).`
      );
      return;
    }

    setSubmittingAction(andSend ? "send" : "draft");
    setSheetError(null);

    try {
      const createRes = await fetch(
        `/api/decisions?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expense_id: selectedExpense.id,
            requested_value: requestedQtyNum,
            source_text: sourceText.trim() || `Change ${selectedExpense.title} to ${requestedQtyNum}`,
            source_language: lang,
            decision_owner_id: decisionOwnerId || null,
            task_owner_id: taskOwnerId || null,
          }),
        }
      );
      const createData = (await createRes.json()) as {
        proposal?: ProposalRecord;
        existingProposalId?: string;
        error?: string;
      };

      if (!createRes.ok) {
        if (createRes.status === 409 && createData.existingProposalId) {
          setHighlightedProposalId(createData.existingProposalId);
        }
        setSheetError(
          createData.error || "Could not create change proposal."
        );
        return;
      }

      const createdId = createData.proposal?.id;
      if (andSend && createdId) {
        const submitRes = await fetch(
          `/api/decisions/${encodeURIComponent(createdId)}/submit?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
          { method: "POST" }
        );
        const submitData = (await submitRes.json()) as { error?: string };
        if (!submitRes.ok) {
          setSheetError(
            submitData.error ||
              "Draft saved, but sending to NudgeBee failed. You can retry from the card below."
          );
        }
      }

      await Promise.all([fetchDecisions(false), refreshEvent()]);
      if (createdId) setHighlightedProposalId(createdId);
      setStep(1);
      setSourceText("");
      setExtracted(null);
      setSelectedExpenseId("");
      setRequestedQtyInput("");
      setExtractWarning(null);
    } catch {
      setSheetError("Network error while saving proposal. Please try again.");
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleRefreshFlags() {
    setFlagsRefreshing(true);
    try {
      await refreshFlags();
    } finally {
      setFlagsRefreshing(false);
    }
  }

  async function handleCardUpdated() {
    await Promise.all([fetchDecisions(false), refreshEvent()]);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !event || !member) {
    return (
      <Card className="space-y-2 border-red-200 bg-red-50">
        <h1 className="font-display text-xl font-semibold text-danger">
          Could not load decisions
        </h1>
        <p className="text-sm text-ink-muted">
          {error || "Please open this event using your personal family link."}
        </p>
      </Card>
    );
  }

  const canDraftProposal =
    member.role === "organizer" ||
    member.role === "decision_owner" ||
    member.role === "helper";

  const sortedExpenses = [...expenses].sort((a, b) => {
    const aMatch = candidateIds.includes(a.id) ? 0 : 1;
    const bMatch = candidateIds.includes(b.id) ? 0 : 1;
    return aMatch - bMatch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="marigold-underline font-display text-2xl font-bold text-ink sm:text-3xl">
            {tr(lang, "navDecisions")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Speak or type a plan change in Kannada, Hindi, or English. Nothing
            changes in your budget until the family approves it in NudgeBee and
            the vendor confirms.
          </p>
        </div>

        <FlagChip
          source={flags.source}
          refreshedAt={flags.refreshed_at}
          loading={flagsRefreshing}
          onRefresh={handleRefreshFlags}
        />
      </div>

      {/* Three-Step Proposal Sheet */}
      {canDraftProposal ? (
        <Card className="space-y-5">
          {/* Stepper Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-ink">
                Propose a quantity change
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {[
                { num: 1 as WizardStep, label: "1. Say or type" },
                { num: 2 as WizardStep, label: "2. Check & preview" },
                { num: 3 as WizardStep, label: "3. Send to NudgeBee" },
              ].map((s) => (
                <span
                  key={s.num}
                  className={
                    step === s.num
                      ? "rounded-full bg-primary px-3 py-1 text-white"
                      : step > s.num
                      ? "rounded-full bg-emerald-50 px-3 py-1 text-success"
                      : "rounded-full bg-surface-2 px-3 py-1 text-ink-muted"
                  }
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <VoiceRecorder
                eventId={eventId}
                token={token}
                languageCode={lang}
                onTranscriptConfirmed={handleTranscriptConfirmed}
              />
              {extracting ? (
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Matching your request to event expenses...
                </div>
              ) : null}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink-muted">
                  Request:{" "}
                  <strong className="text-ink indic-leading">
                    “{sourceText}”
                  </strong>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Edit request
                </Button>
              </div>

              {extractWarning ? (
                <div
                  role="alert"
                  className="rounded-control border border-amber-200 bg-amber-50 p-3 text-sm text-warning"
                >
                  {extractWarning}
                </div>
              ) : null}

              {extracted && extracted.missing.length > 0 ? (
                <div className="rounded-control border border-border bg-surface-2/60 p-3 text-xs text-ink-muted">
                  Please verify: {extracted.missing.join(" • ")}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="decision-expense-select"
                    className="mb-1.5 block text-sm font-semibold text-ink"
                  >
                    Expense item
                  </label>
                  <select
                    id="decision-expense-select"
                    value={selectedExpenseId}
                    onChange={(e) => setSelectedExpenseId(e.target.value)}
                    className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  >
                    <option value="">Select an expense item...</option>
                    {sortedExpenses.map((exp) => (
                      <option key={exp.id} value={exp.id}>
                        {candidateIds.includes(exp.id) ? "★ " : ""}
                        {exp.title} (currently {exp.quantity}
                        {member.can_see_amounts && exp.unit_price_inr !== null
                          ? ` @ ${formatINR(exp.unit_price_inr)}`
                          : ""}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="decision-qty-input"
                    className="mb-1.5 block text-sm font-semibold text-ink"
                  >
                    New quantity{" "}
                    {selectedExpense
                      ? `(current: ${selectedExpense.quantity})`
                      : ""}
                  </label>
                  <input
                    id="decision-qty-input"
                    type="number"
                    min={1}
                    step={1}
                    value={requestedQtyInput}
                    onChange={(e) => setRequestedQtyInput(e.target.value)}
                    placeholder="e.g. 200"
                    className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3 text-base tabular-nums text-ink"
                  />
                </div>
              </div>

              {/* Missing Unit Price Prompt */}
              {selectedExpense && selectedExpense.unit_price_inr === null ? (
                <div className="space-y-2 rounded-control border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-semibold text-warning">
                    Unit price is missing for {selectedExpense.title}
                  </div>
                  {member.can_see_amounts ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="number"
                        min={0}
                        value={unitPriceDraft}
                        onChange={(e) => setUnitPriceDraft(e.target.value)}
                        placeholder="Enter unit price in ₹ (e.g. 350)"
                        className="min-h-[44px] flex-1 rounded-control border border-border bg-surface px-3 text-sm tabular-nums text-ink"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        loading={savingUnitPrice}
                        onClick={handleSaveUnitPrice}
                      >
                        Save unit price
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">
                      Ask the organizer or decision owner to add a unit price
                      before sending this change for approval.
                    </p>
                  )}
                </div>
              ) : null}

              {/* Owners */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="decision-owner-select"
                    className="mb-1.5 block text-sm font-semibold text-ink"
                  >
                    Who approves in NudgeBee? (Decision owner)
                  </label>
                  <select
                    id="decision-owner-select"
                    value={decisionOwnerId}
                    onChange={(e) => setDecisionOwnerId(e.target.value)}
                    className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  >
                    <option value="">Not assigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name} ({m.role.replace("_", " ")})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="task-owner-select"
                    className="mb-1.5 block text-sm font-semibold text-ink"
                  >
                    Who confirms with the vendor after approval?
                  </label>
                  <select
                    id="task-owner-select"
                    value={taskOwnerId}
                    onChange={(e) => setTaskOwnerId(e.target.value)}
                    className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  >
                    <option value="">Same as decision owner</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name} ({m.role.replace("_", " ")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Deterministic Impact Preview */}
              {selectedExpense && requestedQtyNum !== null ? (
                <div className="rounded-control border border-border bg-surface-2/60 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Deterministic budget preview (baseline unchanged)
                  </div>
                  {!member.can_see_amounts ? (
                    <p className="mt-1 text-sm text-ink-muted">
                      {tr(lang, "amountsHiddenNotice")}
                    </p>
                  ) : previewImpact?.status === "ok" &&
                    previewImpact.deltaINR !== null ? (
                    <div className="mt-2 space-y-2">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <div className="text-xs text-ink-muted">
                            Cost delta
                          </div>
                          <div className="text-xl font-bold tabular-nums text-ink">
                            {formatSignedINR(previewImpact.deltaINR)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-ink-muted">
                            Projected committed
                          </div>
                          <div className="text-xl font-bold tabular-nums text-ink">
                            {formatINR(previewImpact.projectedCommittedINR)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-ink-muted">
                            Budget status
                          </div>
                          <div
                            className={
                              previewImpact.overUnderBudgetINR &&
                              previewImpact.overUnderBudgetINR > 0
                                ? "text-base font-bold tabular-nums text-danger"
                                : "text-base font-bold tabular-nums text-success"
                            }
                          >
                            {previewImpact.overUnderBudgetINR !== null &&
                            previewImpact.overUnderBudgetINR > 0
                              ? `Over by ${formatINR(previewImpact.overUnderBudgetINR)}`
                              : `Under by ${formatINR(Math.abs(previewImpact.overUnderBudgetINR ?? 0))}`}
                          </div>
                        </div>
                      </div>
                      {previewImpact.alternativeSample ? (
                        <div className="rounded-control border border-border bg-surface p-2.5 text-sm">
                          <span className="font-semibold text-primary">
                            Option to consider:{" "}
                          </span>
                          <span className="tabular-nums">
                            {previewImpact.alternativeSample.quantity} units (
                            {formatSignedINR(
                              previewImpact.alternativeSample.deltaINR
                            )}{" "}
                            →{" "}
                            {formatINR(
                              previewImpact.alternativeSample
                                .projectedCommittedINR
                            )}
                            )
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-warning">
                      Enter a unit price to compute the exact rupee impact.
                    </p>
                  )}
                </div>
              ) : null}

              {sheetError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-control border border-red-200 bg-red-50 p-3 text-sm text-danger"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{sheetError}</span>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!selectedExpense || !requestedQtyNum}
                  onClick={() => {
                    setSheetError(null);
                    setStep(3);
                  }}
                >
                  Continue to review
                </Button>
              </div>
            </div>
          )}

          {step === 3 && selectedExpense && requestedQtyNum !== null && (
            <div className="space-y-4">
              <div className="rounded-control border border-border bg-surface-2/50 p-4 space-y-2">
                <div className="text-sm font-semibold text-ink">
                  Ready to create proposal
                </div>
                <div className="text-base text-ink">
                  <strong>{selectedExpense.title}</strong>:{" "}
                  {selectedExpense.quantity} → {requestedQtyNum}
                </div>
                {member.can_see_amounts &&
                previewImpact?.status === "ok" &&
                previewImpact.deltaINR !== null ? (
                  <div className="text-sm tabular-nums text-ink-muted">
                    Impact: {formatSignedINR(previewImpact.deltaINR)} •
                    Projected total:{" "}
                    {formatINR(previewImpact.projectedCommittedINR)}
                  </div>
                ) : null}
                <div className="text-xs text-ink-muted">
                  Sending to NudgeBee creates an approval request for{" "}
                  {members.find((m) => m.id === decisionOwnerId)?.display_name ??
                    "the decision owner"}
                  . Baseline expenses remain untouched until approved.
                </div>
              </div>

              {sheetError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-control border border-red-200 bg-red-50 p-3 text-sm text-danger"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{sheetError}</span>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submittingAction !== null}
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={submittingAction === "draft"}
                    disabled={submittingAction !== null}
                    onClick={() => handleCreateProposal(false)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    loading={submittingAction === "send"}
                    disabled={submittingAction !== null}
                    onClick={() => handleCreateProposal(true)}
                  >
                    <Send className="h-4 w-4" />
                    Create & send to NudgeBee
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="bg-surface-2/50 text-sm text-ink-muted">
          You are viewing as <strong>{member.display_name}</strong> (viewer).
          You can follow family decisions below.
        </Card>
      )}

      {/* Polling Notice */}
      {hasPending ? (
        <div className="flex items-center gap-2">
          <StatusChip
            label="Checking NudgeBee every 3s for family approval..."
            tone="warning"
          />
        </div>
      ) : null}

      {/* Proposals List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            Change proposals ({proposals.length})
          </h2>
          <span className="text-xs font-medium text-ink-muted">
            Layout: {flags.decision_card_style === "compact" ? "Compact" : "Impact-first"}
          </span>
        </div>

        {proposals.length === 0 ? (
          <EmptyState
            icon={<Scale className="h-6 w-6" />}
            title="No change proposals yet"
            description="Record a voice note or type a quantity update above to see its exact rupee impact and request family approval."
          />
        ) : (
          <div className="space-y-4">
            {proposals.map((proposal) => (
              <DecisionCard
                key={proposal.id}
                proposal={proposal}
                expense={expenses.find((e) => e.id === proposal.expense_id)}
                members={members}
                canSeeAmounts={member.can_see_amounts}
                cardStyle={flags.decision_card_style}
                eventId={eventId}
                token={token}
                languageCode={lang}
                currentMember={member}
                devCallbackEnabled={devCallbackEnabled}
                highlighted={highlightedProposalId === proposal.id}
                onUpdated={handleCardUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
