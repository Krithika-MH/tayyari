import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CreateExpenseSchema,
  EXPENSE_SOURCES,
  EXPENSE_STATUSES,
  VENDOR_CONFIRMATION_STATES,
} from "@/lib/contracts";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeExpensesForMember,
} from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";

const PatchExpenseSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive().optional(),
  unit_price_inr: z.number().int().min(0).nullable().optional(),
  committed_inr: z.number().int().min(0).optional(),
  paid_inr: z.number().int().min(0).optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  vendor_confirmation: z.enum(VENDOR_CONFIRMATION_STATES).optional(),
  source: z.enum(EXPENSE_SOURCES).optional(),
  quote_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(400).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer", "decision_owner"]);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = CreateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid expense fields.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const unitPrice = d.unit_price_inr ?? null;
    const committedINR =
      d.committed_inr !== undefined
        ? d.committed_inr
        : unitPrice !== null
        ? d.quantity * unitPrice
        : 0;

    const repo = getRepository();
    const expense = await repo.createExpense({
      event_id: ctx.event.id,
      category_id: d.category_id,
      title: d.title,
      vendor_id: d.vendor_id ?? null,
      quantity: d.quantity,
      unit_price_inr: unitPrice,
      committed_inr: committedINR,
      paid_inr: d.paid_inr,
      status: d.status,
      vendor_confirmation: d.vendor_id ? "pending" : "not_applicable",
      source: d.source,
      quote_date: d.quote_date ?? null,
      version: 1,
      note: d.note,
    });

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "expense_created",
      summary: `${ctx.member.display_name} added expense "${expense.title}".`,
      ref_id: expense.id,
    });

    return NextResponse.json(
      { expense: sanitizeExpensesForMember([expense], ctx.member)[0] },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create expense." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer", "decision_owner"]);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = PatchExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid expense update.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const existing = await repo.getExpense(ctx.event.id, parsed.data.id);
    if (!existing) {
      return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    }

    const { id, ...patch } = parsed.data;
    const nextQty = patch.quantity ?? existing.quantity;
    const nextUnitPrice =
      patch.unit_price_inr !== undefined
        ? patch.unit_price_inr
        : existing.unit_price_inr;

    let nextCommitted = patch.committed_inr;
    if (
      nextCommitted === undefined &&
      (patch.quantity !== undefined || patch.unit_price_inr !== undefined)
    ) {
      nextCommitted = nextUnitPrice !== null ? nextQty * nextUnitPrice : 0;
    }

    const affectsPricing =
      (patch.quantity !== undefined && patch.quantity !== existing.quantity) ||
      (patch.unit_price_inr !== undefined &&
        patch.unit_price_inr !== existing.unit_price_inr) ||
      (nextCommitted !== undefined && nextCommitted !== existing.committed_inr);

    const updated = await repo.updateExpense(ctx.event.id, id, {
      ...patch,
      ...(nextCommitted !== undefined ? { committed_inr: nextCommitted } : {}),
      version: affectsPricing ? existing.version + 1 : existing.version,
    });

    if (!updated) {
      return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    }

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "expense_updated",
      summary: `${ctx.member.display_name} updated "${updated.title}".`,
      ref_id: updated.id,
    });

    return NextResponse.json({
      expense: sanitizeExpensesForMember([updated], ctx.member)[0],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update expense." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer", "decision_owner"]);
    if (forbidden) return forbidden;

    const url = new URL(req.url);
    let expenseId = url.searchParams.get("id") ?? "";
    if (!expenseId) {
      try {
        const body = (await req.json()) as { id?: string };
        if (body?.id) expenseId = body.id;
      } catch {
        // ignore empty body
      }
    }

    if (!expenseId) {
      return NextResponse.json(
        { error: "Expense id is required." },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const existing = await repo.getExpense(ctx.event.id, expenseId);
    if (!existing) {
      return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    }

    const proposals = await repo.listProposals(ctx.event.id);
    const hasPending = proposals.some(
      (p) =>
        p.expense_id === expenseId &&
        (p.status === "pending_approval" || p.status === "draft")
    );
    if (hasPending) {
      return NextResponse.json(
        {
          error:
            "Cannot delete this expense while a change proposal is pending approval.",
        },
        { status: 409 }
      );
    }

    await repo.deleteExpense(ctx.event.id, expenseId);

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "expense_deleted",
      summary: `${ctx.member.display_name} removed "${existing.title}".`,
      ref_id: expenseId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete expense." },
      { status: 500 }
    );
  }
}
