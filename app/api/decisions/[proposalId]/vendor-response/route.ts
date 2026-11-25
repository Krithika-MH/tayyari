import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeExpensesForMember,
  sanitizeProposalsForMember,
} from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";

const VendorResponseSchema = z.object({
  acknowledged: z.boolean(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ proposalId: string }> }
) {
  const { proposalId } = await context.params;
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

  const parsed = VendorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid vendor response payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const repo = getRepository();
  const proposal = await repo.getProposal(ctx.event.id, proposalId);
  if (!proposal) {
    return NextResponse.json(
      { error: "Change proposal not found." },
      { status: 404 }
    );
  }

  if (proposal.status !== "approved") {
    return NextResponse.json(
      {
        error:
          "Family approval in NudgeBee is required before recording vendor confirmation.",
      },
      { status: 400 }
    );
  }

  const expense = await repo.getExpense(ctx.event.id, proposal.expense_id);
  if (!expense) {
    return NextResponse.json(
      { error: "Referenced expense item not found." },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  const nextConfirmation = parsed.data.acknowledged
    ? "acknowledged"
    : "pending";

  const updatedExpense = await repo.updateExpense(ctx.event.id, expense.id, {
    vendor_confirmation: nextConfirmation,
  });

  const updatedProposal = await repo.updateProposal(
    ctx.event.id,
    proposal.id,
    {
      history: [
        ...proposal.history,
        {
          at: now,
          actor: ctx.member.display_name,
          event: parsed.data.acknowledged
            ? "Vendor acknowledged revised quantity"
            : "Vendor confirmation marked pending",
          note: parsed.data.note || undefined,
        },
      ],
    }
  );

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "vendor_response",
    summary: `${ctx.member.display_name} recorded vendor ${
      parsed.data.acknowledged ? "acknowledgement" : "pending status"
    } for ${expense.title}.`,
    ref_id: proposal.id,
  });

  return NextResponse.json({
    proposal: updatedProposal
      ? sanitizeProposalsForMember([updatedProposal], ctx.member)[0]
      : null,
    expense: updatedExpense
      ? sanitizeExpensesForMember([updatedExpense], ctx.member)[0]
      : null,
  });
}
