import { NextRequest, NextResponse } from "next/server";
import { resolveAuthFromRequest, sanitizeProposalsForMember } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { isStaleProposal } from "@/lib/domain/budget";
import { nudgeBeeProvider } from "@/lib/providers/nudgebee";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ proposalId: string }> }
) {
  const { proposalId } = await context.params;
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) {
    return errorResponse!;
  }

  const repo = getRepository();
  const proposal = await repo.getProposal(ctx.event.id, proposalId);
  if (!proposal) {
    return NextResponse.json(
      { error: "Change proposal not found." },
      { status: 404 }
    );
  }

  const canSubmit =
    ctx.member.role === "organizer" ||
    ctx.member.role === "decision_owner" ||
    proposal.requested_by === ctx.member.id;

  if (!canSubmit) {
    return NextResponse.json(
      {
        error:
          "Only an organizer, decision owner, or the member who drafted this change can send it for approval.",
      },
      { status: 403 }
    );
  }

  if (
    proposal.status !== "draft" &&
    proposal.status !== "failed_to_dispatch"
  ) {
    return NextResponse.json(
      {
        error: `Cannot send a proposal that is currently "${proposal.status}".`,
      },
      { status: 409 }
    );
  }

  const expense = await repo.getExpense(ctx.event.id, proposal.expense_id);
  if (!expense) {
    return NextResponse.json(
      { error: "Referenced expense item no longer exists." },
      { status: 404 }
    );
  }

  if (expense.unit_price_inr === null) {
    return NextResponse.json(
      { error: "Enter a unit price before sending for approval." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const staleCheck = isStaleProposal(proposal, expense);
  if (staleCheck.stale) {
    const staleProposal = await repo.updateProposal(ctx.event.id, proposal.id, {
      status: "stale",
      history: [
        ...proposal.history,
        {
          at: now,
          actor: "System",
          event: "Marked stale before dispatch",
          note: staleCheck.reason,
        },
      ],
    });
    return NextResponse.json(
      {
        error:
          staleCheck.reason ??
          "This expense changed since the proposal was drafted. Please create a new proposal.",
        proposal: staleProposal
          ? sanitizeProposalsForMember([staleProposal], ctx.member)[0]
          : null,
      },
      { status: 409 }
    );
  }

  const members = await repo.listMembers(ctx.event.id);
  const decisionOwner =
    (proposal.decision_owner_id &&
      members.find((m) => m.id === proposal.decision_owner_id)) ||
    members.find((m) => m.role === "decision_owner") ||
    members.find((m) => m.role === "organizer");
  const decisionOwnerName =
    decisionOwner?.display_name ?? "Family Decision Owner";

  const summary = `${expense.title}: ${proposal.previous_value} → ${proposal.requested_value}`;
  const dispatchRes = await nudgeBeeProvider.triggerApproval({
    kind: "change_request",
    refId: proposal.id,
    summary,
    eventName: ctx.event.name,
    decisionOwnerName,
    deltaINR: proposal.impact.deltaINR,
    projectedOverUnderINR: proposal.impact.overUnderBudgetINR,
  });

  if (!dispatchRes.ok) {
    const failedProposal = await repo.updateProposal(
      ctx.event.id,
      proposal.id,
      {
        status: "failed_to_dispatch",
        history: [
          ...proposal.history,
          {
            at: now,
            actor: ctx.member.display_name,
            event: "Failed to dispatch to NudgeBee",
            note: dispatchRes.error,
          },
        ],
      }
    );

    return NextResponse.json(
      {
        error:
          dispatchRes.error ||
          "Could not reach NudgeBee approval workflow. You can retry without losing your draft.",
        retryable: true,
        proposal: failedProposal
          ? sanitizeProposalsForMember([failedProposal], ctx.member)[0]
          : null,
      },
      { status: 502 }
    );
  }

  const pendingProposal = await repo.updateProposal(ctx.event.id, proposal.id, {
    status: "pending_approval",
    workflow_ref: dispatchRes.workflowRef,
    history: [
      ...proposal.history,
      {
        at: now,
        actor: ctx.member.display_name,
        event: "Sent to NudgeBee for approval",
        note: dispatchRes.workflowRef
          ? `Workflow ref: ${dispatchRes.workflowRef}`
          : undefined,
      },
    ],
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "proposal_submitted",
    summary: `${ctx.member.display_name} sent ${expense.title} (${proposal.previous_value} → ${proposal.requested_value}) to NudgeBee for ${decisionOwnerName}'s approval.`,
    ref_id: proposal.id,
  });

  return NextResponse.json({
    proposal: pendingProposal
      ? sanitizeProposalsForMember([pendingProposal], ctx.member)[0]
      : null,
  });
}
