import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeProposalsForMember,
} from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { addDaysToISODate, isStaleProposal } from "@/lib/domain/budget";

const DevSimulateSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(300).optional(),
});

function getTodayIST(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ proposalId: string }> }
) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEV_CALLBACK !== "true"
  ) {
    return NextResponse.json(
      { error: "Dev callback simulation is disabled." },
      { status: 403 }
    );
  }

  const { proposalId } = await context.params;
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) {
    return errorResponse!;
  }

  const roleError = requireRole(ctx.member, ["organizer", "decision_owner"]);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = DevSimulateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid simulation payload." },
      { status: 400 }
    );
  }

  const repo = getRepository();
  const proposal = await repo.getProposal(ctx.event.id, proposalId);
  if (!proposal) {
    return NextResponse.json(
      { error: "Proposal not found." },
      { status: 404 }
    );
  }

  if (proposal.status !== "pending_approval") {
    return NextResponse.json(
      {
        error: `Dev simulation only applies to pending_approval proposals (current: ${proposal.status}).`,
      },
      { status: 409 }
    );
  }

  const expense = await repo.getExpense(ctx.event.id, proposal.expense_id);
  if (!expense) {
    return NextResponse.json(
      { error: "Referenced expense not found." },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  const idempotencyKey = `dev-sim-${randomUUID()}`;
  const staleCheck = isStaleProposal(proposal, expense);
  if (staleCheck.stale) {
    const staleProposal = await repo.updateProposal(ctx.event.id, proposal.id, {
      status: "stale",
      idempotency_keys: [...proposal.idempotency_keys, idempotencyKey],
      history: [
        ...proposal.history,
        {
          at: now,
          actor: "Dev Simulator (NOT NudgeBee)",
          event: "Marked stale on simulated callback",
          note: staleCheck.reason,
        },
      ],
    });
    return NextResponse.json({
      ok: true,
      stale: true,
      proposal: staleProposal
        ? sanitizeProposalsForMember([staleProposal], ctx.member)[0]
        : null,
    });
  }

  const { decision, note } = parsed.data;
  if (decision === "approved") {
    const nextCommitted =
      expense.unit_price_inr !== null
        ? proposal.requested_value * expense.unit_price_inr
        : expense.committed_inr;

    await repo.updateExpense(ctx.event.id, expense.id, {
      quantity: proposal.requested_value,
      committed_inr: nextCommitted,
      version: expense.version + 1,
      vendor_confirmation: "pending",
    });

    const updated = await repo.updateProposal(ctx.event.id, proposal.id, {
      status: "approved",
      idempotency_keys: [...proposal.idempotency_keys, idempotencyKey],
      history: [
        ...proposal.history,
        {
          at: now,
          actor: `${ctx.member.display_name} (DEV SIMULATE — NOT NudgeBee)`,
          event: "Simulated approval callback",
          note: note || undefined,
        },
      ],
    });

    const tomorrow = addDaysToISODate(getTodayIST(), 1);
    const dueDate =
      tomorrow > ctx.event.event_date ? ctx.event.event_date : tomorrow;

    await repo.createTask({
      event_id: ctx.event.id,
      title: "Confirm the revised quantity with the vendor",
      owner_id: proposal.task_owner_id ?? proposal.decision_owner_id ?? null,
      due_date: dueDate,
      status: "assigned",
      depends_on: null,
      source: "proposal",
      time_label: null,
      location_label: null,
    });

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "proposal_approved",
      summary: `[DEV SIMULATE] Approved ${expense.title} (${proposal.previous_value} → ${proposal.requested_value}). Vendor confirmation pending.`,
      ref_id: proposal.id,
    });

    return NextResponse.json({
      ok: true,
      proposal: updated
        ? sanitizeProposalsForMember([updated], ctx.member)[0]
        : null,
    });
  }

  const updated = await repo.updateProposal(ctx.event.id, proposal.id, {
    status: "rejected",
    idempotency_keys: [...proposal.idempotency_keys, idempotencyKey],
    history: [
      ...proposal.history,
      {
        at: now,
        actor: `${ctx.member.display_name} (DEV SIMULATE — NOT NudgeBee)`,
        event: "Simulated rejection callback",
        note: note || undefined,
      },
    ],
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "proposal_rejected",
    summary: `[DEV SIMULATE] Declined ${expense.title} (${proposal.previous_value} → ${proposal.requested_value}). Baseline unchanged.`,
    ref_id: proposal.id,
  });

  return NextResponse.json({
    ok: true,
    proposal: updated
      ? sanitizeProposalsForMember([updated], ctx.member)[0]
      : null,
  });
}
