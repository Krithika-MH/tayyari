import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeProposalsForMember,
} from "@/lib/auth";
import { CreateProposalSchema } from "@/lib/contracts";
import { getRepository } from "@/lib/db/repository";
import { computeImpact } from "@/lib/domain/budget";

export const dynamic = "force-dynamic";

function isDevCallbackEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_CALLBACK === "true"
  );
}

export async function GET(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) {
    return errorResponse!;
  }

  const repo = getRepository();
  const proposals = await repo.listProposals(ctx.event.id);

  return NextResponse.json({
    proposals: sanitizeProposalsForMember(proposals, ctx.member),
    devCallbackEnabled: isDevCallbackEnabled(),
  });
}

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) {
    return errorResponse!;
  }

  const roleError = requireRole(ctx.member, [
    "organizer",
    "decision_owner",
    "helper",
  ]);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = CreateProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ||
          "Please check the proposal fields and try again.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const repo = getRepository();

  const expense = await repo.getExpense(ctx.event.id, input.expense_id);
  if (!expense) {
    return NextResponse.json(
      { error: "Expense item was not found in this event." },
      { status: 404 }
    );
  }

  if (input.requested_value <= 0 || input.requested_value === expense.quantity) {
    return NextResponse.json(
      {
        error: `Requested quantity must be positive and different from the current quantity (${expense.quantity}).`,
      },
      { status: 400 }
    );
  }

  const existingProposals = await repo.listProposals(ctx.event.id);
  const activeExisting = existingProposals.find(
    (p) =>
      p.expense_id === expense.id &&
      (p.status === "pending_approval" || p.status === "draft")
  );
  if (activeExisting) {
    return NextResponse.json(
      {
        error:
          "A pending or draft proposal already exists for this expense item. Resolve or send the existing proposal first.",
        existingProposalId: activeExisting.id,
      },
      { status: 409 }
    );
  }

  if (input.decision_owner_id) {
    const decisionOwner = await repo.getMemberById(
      ctx.event.id,
      input.decision_owner_id
    );
    if (!decisionOwner) {
      return NextResponse.json(
        { error: "Selected decision owner does not belong to this event." },
        { status: 400 }
      );
    }
  }

  if (input.task_owner_id) {
    const taskOwner = await repo.getMemberById(
      ctx.event.id,
      input.task_owner_id
    );
    if (!taskOwner) {
      return NextResponse.json(
        { error: "Selected follow-up owner does not belong to this event." },
        { status: 400 }
      );
    }
  }

  const allExpenses = await repo.listExpenses(ctx.event.id);
  const impact = computeImpact(ctx.event, allExpenses, {
    expenseId: expense.id,
    previousValue: expense.quantity,
    requestedValue: input.requested_value,
  });

  const now = new Date().toISOString();
  const created = await repo.createProposal({
    event_id: ctx.event.id,
    expense_id: expense.id,
    baseline_version: expense.version,
    baseline_unit_price_inr: expense.unit_price_inr,
    field: "quantity",
    previous_value: expense.quantity,
    requested_value: input.requested_value,
    requested_by: ctx.member.id,
    source_text: input.source_text,
    source_language: input.source_language,
    status: "draft",
    decision_owner_id: input.decision_owner_id ?? null,
    task_owner_id: input.task_owner_id ?? null,
    impact,
    workflow_ref: null,
    idempotency_keys: [],
    history: [
      {
        at: now,
        actor: ctx.member.display_name,
        event: "Draft proposal created",
        note: `${expense.title}: ${expense.quantity} → ${input.requested_value}`,
      },
    ],
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "proposal_created",
    summary: `${ctx.member.display_name} drafted a change for ${expense.title} (${expense.quantity} → ${input.requested_value}).`,
    ref_id: created.id,
  });

  return NextResponse.json(
    {
      proposal: sanitizeProposalsForMember([created], ctx.member)[0],
    },
    { status: 201 }
  );
}
