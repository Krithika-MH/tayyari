"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Edit3,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  CategoryBar,
  Dialog,
  EmptyState,
  StatCard,
  StatusChip,
  useToast,
} from "@/components/ui/primitives";
import { PageGuide } from "@/components/ui/PageGuide";
import {
  EXPENSE_SOURCES,
  EXPENSE_STATUSES,
  type ExpenseSource,
  type ExpenseStatus,
} from "@/lib/contracts";
import { formatINR, formatSignedINR } from "@/lib/domain/budget";
import { tr } from "@/lib/i18n";

export default function BudgetPage() {
  const { pushToast } = useToast();
  const {
    eventId,
    token,
    event,
    member,
    categories,
    expenses,
    proposals,
    budgetSummary,
    lang,
    refreshEvent,
  } = useEventContext();

  // Add Expense Dialog
  const [addOpen, setAddOpen] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expCategoryId, setExpCategoryId] = useState("");
  const [expQty, setExpQty] = useState(1);
  const [expUnitPrice, setExpUnitPrice] = useState("");
  const [expPaid, setExpPaid] = useState("0");
  const [expStatus, setExpStatus] = useState<ExpenseStatus>("quoted");
  const [expSource, setExpSource] = useState<ExpenseSource>("user_quote");
  const [expQuoteDate, setExpQuoteDate] = useState("");
  const [expNote, setExpNote] = useState("");
  const [savingExp, setSavingExp] = useState(false);

  // Edit Category Allocations Dialog
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocEdits, setAllocEdits] = useState<Record<string, number>>({});
  const [savingAlloc, setSavingAlloc] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!expCategoryId && categories.length > 0) {
      setExpCategoryId(categories[0].id);
    }
  }, [categories, expCategoryId]);

  if (!event || !member) return null;

  if (!member.can_see_amounts || !budgetSummary) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink marigold-underline">
          Budget
        </h1>
        <Card className="flex items-center gap-3 bg-surface-2/50">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <div className="text-sm font-medium text-ink">
            {tr(lang, "amountsHiddenNotice")} Only organizers and decision owners
            can view or edit budget figures.
          </div>
        </Card>
      </div>
    );
  }

  const canEditBudget =
    member.role === "organizer" || member.role === "decision_owner";
  const qs = `?t=${encodeURIComponent(token)}`;

  const pendingProposals = proposals.filter(
    (p) => p.status === "pending_approval" || p.status === "draft"
  );

  const openAllocDialog = () => {
    const initial: Record<string, number> = {};
    for (const c of categories) {
      initial[c.id] = c.allocated_inr ?? 0;
    }
    setAllocEdits(initial);
    setAllocOpen(true);
  };

  const handleSaveAllocations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAlloc(true);
    try {
      const updates = categories.map((c) => ({
        id: c.id,
        allocated_inr: Math.max(0, Math.round(allocEdits[c.id] ?? 0)),
      }));
      const res = await fetch(
        `/api/categories?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(data?.error ?? "Could not update allocations.", "error");
        return;
      }
      setAllocOpen(false);
      pushToast("Category allocations updated.", "success");
      await refreshEvent();
    } catch {
      pushToast("Network error updating allocations.", "error");
    } finally {
      setSavingAlloc(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || !expCategoryId) return;
    setSavingExp(true);
    const trimmedPrice = expUnitPrice.trim();
    const parsedUnitPrice =
      trimmedPrice === "" ? null : Math.max(0, Math.round(Number(trimmedPrice)));
    const parsedPaid = Math.max(0, Math.round(Number(expPaid) || 0));

    try {
      const res = await fetch(
        `/api/expenses?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: expCategoryId,
            title: expTitle.trim(),
            quantity: Math.max(1, Math.round(expQty)),
            unit_price_inr: parsedUnitPrice,
            paid_inr: parsedPaid,
            status: expStatus,
            source: expSource,
            quote_date: expQuoteDate.trim() || null,
            note: expNote.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(data?.error ?? "Could not add expense.", "error");
        return;
      }
      setExpTitle("");
      setExpQty(1);
      setExpUnitPrice("");
      setExpPaid("0");
      setExpQuoteDate("");
      setExpNote("");
      setAddOpen(false);
      pushToast("Expense added to budget.", "success");
      await refreshEvent();
    } catch {
      pushToast("Network error adding expense.", "error");
    } finally {
      setSavingExp(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    setDeletingId(expenseId);
    try {
      const res = await fetch(
        `/api/expenses?id=${encodeURIComponent(expenseId)}&eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(data?.error ?? "Could not delete expense.", "error");
        return;
      }
      pushToast("Expense removed.", "success");
      await refreshEvent();
    } catch {
      pushToast("Network error deleting expense.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const totalBudget = budgetSummary.totalBudgetINR ?? 0;
  const committedTotal = budgetSummary.committedINR ?? 0;
  const pendingDelta = budgetSummary.pendingProposalsTotalINR ?? 0;
  const projectedIfApproved = committedTotal + pendingDelta;

  const sourceLabelForExpense = (source: ExpenseSource, quoteDate: string | null) => {
    if (source === "demo_data") return "Demo data, not a local market quote";
    if (source === "user_quote") {
      return quoteDate
        ? `From your quote dated ${quoteDate}`
        : "From your quote";
    }
    return "Family estimate";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink marigold-underline">
              Budget &amp; Expenses
            </h1>
            <PageGuide
              title="Budget & Expenses"
              summary="See exact category allocations, committed quotes, paid amounts, and any pending decisions — computed deterministically."
              steps={[
                "Watch category bars: amber means 85%+ committed, red means over category allocation.",
                "Add expenses with a real quote or leave price blank for 'price unknown' (never counted as ₹0).",
                "Pending changes show under 'If pending decisions go ahead' without changing your baseline.",
              ]}
              note="Only Organizers and Decision Owners can view or edit rupee amounts."
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted tabular-nums">
            Total event budget:{" "}
            <strong className="text-ink">{formatINR(totalBudget)}</strong>
          </p>
        </div>

        {canEditBudget ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={openAllocDialog}>
              <Edit3 className="h-4 w-4" aria-hidden="true" />
              <span>Edit allocations</span>
            </Button>
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add expense</span>
            </Button>
          </div>
        ) : null}
      </div>

      {/* Hero Budget Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Budget"
          value={formatINR(budgetSummary.totalBudgetINR)}
        />
        <StatCard
          label="Allocated"
          value={formatINR(budgetSummary.allocatedINR)}
        />
        <StatCard
          label="Committed"
          value={formatINR(budgetSummary.committedINR)}
          tone={budgetSummary.overBudget ? "danger" : "neutral"}
        />
        <StatCard
          label="Paid"
          value={formatINR(budgetSummary.paidINR)}
          hint={`Unpaid: ${formatINR(budgetSummary.remainingUnpaidINR)}`}
          tone="success"
        />
      </div>

      {/* "If this goes ahead" Pending Proposals Banner */}
      {pendingProposals.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50/70 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-ink">
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
              <span>If pending decisions go ahead</span>
            </div>
            <Link href={`/e/${eventId}/decisions${qs}`}>
              <Button variant="secondary" size="sm" className="min-h-[48px]">
                Review {pendingProposals.length} pending
              </Button>
            </Link>
          </div>
          <p className="text-sm text-ink-muted tabular-nums">
            Baseline committed remains{" "}
            <strong className="text-ink">{formatINR(committedTotal)}</strong>.
            Pending proposals would add{" "}
            <strong className="text-warning">
              {formatSignedINR(pendingDelta)}
            </strong>{" "}
            for a projected total of{" "}
            <strong className="text-ink">{formatINR(projectedIfApproved)}</strong>{" "}
            ({projectedIfApproved > totalBudget
              ? `${formatINR(projectedIfApproved - totalBudget)} over budget`
              : `${formatINR(totalBudget - projectedIfApproved)} under budget`}
            ).
          </p>
        </Card>
      ) : null}

      {/* Price-Unknown Notice */}
      {budgetSummary.priceUnknownExpenses.length > 0 ? (
        <Card className="border-blue-200 bg-blue-50/60 text-sm text-ink">
          <strong>{budgetSummary.priceUnknownExpenses.length} price-unknown item(s):</strong>{" "}
          {budgetSummary.priceUnknownExpenses.map((e) => e.title).join(", ")}.
          These are never counted as ₹0 in totals.
        </Card>
      ) : null}

      {/* Category Allocations */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink marigold-underline">
            Category breakdown
          </h2>
          {canEditBudget ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[48px]"
              onClick={openAllocDialog}
            >
              Adjust split
            </Button>
          ) : null}
        </div>

        <div className="space-y-4 pt-1">
          {budgetSummary.categories.map((cat) => {
            const alloc = cat.allocatedINR ?? 0;
            const comm = cat.committedINR ?? 0;
            const ratio = alloc > 0 ? comm / alloc : comm > 0 ? 1 : 0;
            return (
              <CategoryBar
                key={cat.categoryId}
                name={cat.name}
                committedLabel={formatINR(comm)}
                allocatedLabel={formatINR(alloc)}
                ratio={ratio}
                overAllocated={cat.overAllocated}
                nearLimit={cat.nearLimit}
                priceUnknownCount={cat.priceUnknownCount}
              />
            );
          })}
        </div>
      </Card>

      {/* Expenses Grouped by Category */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-ink marigold-underline">
          Expenses by category
        </h2>

        {expenses.length === 0 ? (
          <EmptyState
            title="No expenses added yet"
            description="Add your first vendor quote or family estimate to track committed vs paid amounts."
            action={
              canEditBudget ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  Add first expense
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5 pt-1">
            {categories.map((cat) => {
              const catExpenses = expenses.filter(
                (e) => e.category_id === cat.id
              );
              if (catExpenses.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-ink">
                      {cat.name}
                    </h3>
                    <span className="text-xs text-ink-muted tabular-nums">
                      Allocated: {formatINR(cat.allocated_inr)}
                    </span>
                  </div>

                  {catExpenses.map((exp) => {
                    const isPriceUnknown =
                      exp.unit_price_inr === null &&
                      (exp.committed_inr === null || exp.committed_inr === 0);
                    const statusTone =
                      exp.status === "paid"
                        ? "success"
                        : exp.status === "committed"
                        ? "info"
                        : exp.status === "quoted"
                        ? "warning"
                        : "neutral";

                    return (
                      <Card
                        key={exp.id}
                        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">
                              {exp.title}
                            </span>
                            <StatusChip label={exp.status} tone={statusTone} />
                            {exp.vendor_confirmation === "pending" ? (
                              <StatusChip
                                label={tr(lang, "vendorPending")}
                                tone="warning"
                              />
                            ) : exp.vendor_confirmation === "acknowledged" ? (
                              <StatusChip
                                label={tr(lang, "vendorAcknowledged")}
                                tone="success"
                              />
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted tabular-nums">
                            <span>Qty: {exp.quantity}</span>
                            <span>
                              Unit:{" "}
                              {exp.unit_price_inr === null
                                ? "Price unknown"
                                : formatINR(exp.unit_price_inr)}
                            </span>
                            <span>
                              {sourceLabelForExpense(exp.source, exp.quote_date)}
                            </span>
                            <span>v{exp.version}</span>
                          </div>
                          {exp.note ? (
                            <p className="text-xs text-ink-muted">{exp.note}</p>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-4 sm:justify-end shrink-0">
                          <div className="text-right tabular-nums">
                            <div className="text-base font-bold text-ink">
                              {isPriceUnknown
                                ? "Price unknown"
                                : formatINR(exp.committed_inr)}
                            </div>
                            <div className="text-xs text-ink-muted">
                              Paid: {formatINR(exp.paid_inr ?? 0)}
                            </div>
                          </div>

                          {canEditBudget ? (
                            <button
                              type="button"
                              disabled={deletingId === exp.id}
                              onClick={() => handleDeleteExpense(exp.id)}
                              aria-label={`Delete ${exp.title}`}
                              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-control border border-border bg-bg text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Expense Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add expense item"
        description="Leave unit price blank if you have not received a quote yet — Tayyari marks it as Price unknown instead of ₹0."
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-ink">Category</span>
            <select
              value={expCategoryId}
              onChange={(e) => setExpCategoryId(e.target.value)}
              className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-ink">Item title</span>
            <input
              type="text"
              required
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              placeholder="e.g. Brass diya & entrance flowers"
              className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Quantity</span>
              <input
                type="number"
                min={1}
                required
                value={expQty}
                onChange={(e) => setExpQty(Math.max(1, Number(e.target.value) || 1))}
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">
                Unit price (₹)
              </span>
              <input
                type="number"
                min={0}
                value={expUnitPrice}
                onChange={(e) => setExpUnitPrice(e.target.value)}
                placeholder="Blank = unknown"
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">
                Paid so far (₹)
              </span>
              <input
                type="number"
                min={0}
                value={expPaid}
                onChange={(e) => setExpPaid(e.target.value)}
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Status</span>
              <select
                value={expStatus}
                onChange={(e) => setExpStatus(e.target.value as ExpenseStatus)}
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              >
                {EXPENSE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Source</span>
              <select
                value={expSource}
                onChange={(e) => setExpSource(e.target.value as ExpenseSource)}
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              >
                {EXPENSE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s === "user_quote"
                      ? "From vendor quote"
                      : s === "estimate"
                      ? "Family estimate"
                      : "Demo data"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">
                Quote date (optional)
              </span>
              <input
                type="date"
                value={expQuoteDate}
                onChange={(e) => setExpQuoteDate(e.target.value)}
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Note (optional)</span>
              <input
                type="text"
                value={expNote}
                onChange={(e) => setExpNote(e.target.value)}
                placeholder="Inclusions or remarks"
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingExp}>
              Save expense
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Category Allocations Dialog */}
      <Dialog
        open={allocOpen}
        onOpenChange={setAllocOpen}
        title="Edit category allocations"
        description={`Adjust planned amounts across categories. Total event budget: ${formatINR(totalBudget)}.`}
      >
        <form onSubmit={handleSaveAllocations} className="space-y-3">
          {categories.map((cat) => (
            <label
              key={cat.id}
              className="flex items-center justify-between gap-3 rounded-control border border-border bg-bg p-3"
            >
              <span className="text-sm font-semibold text-ink">{cat.name}</span>
              <input
                type="number"
                min={0}
                step={500}
                value={allocEdits[cat.id] ?? 0}
                onChange={(e) =>
                  setAllocEdits((prev) => ({
                    ...prev,
                    [cat.id]: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="min-h-[48px] w-36 rounded-control border border-border bg-surface px-3 text-sm font-semibold text-ink tabular-nums"
              />
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAllocOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingAlloc}>
              Save allocations
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
