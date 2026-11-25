import { NextRequest, NextResponse } from "next/server";
import { requireRole, resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";
import { nudgeBeeProvider } from "@/lib/providers/nudgebee";
import { checkAndConsumeLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ leftoverId: string }> }
) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const { leftoverId } = await context.params;
  const repo = getRepository();
  const flags = await flagsmithProvider.getFlagsForEvent(ctx.event);
  if (!flags.module_leftover_food) {
    return NextResponse.json(
      { error: "Leftover Food Outreach module is currently disabled." },
      { status: 403 }
    );
  }

  const roleError = requireRole(ctx.member, [
    "organizer",
    "decision_owner",
    "helper",
  ]);
  if (roleError) return roleError;

  const leftover = await repo.getLeftover(ctx.event.id, leftoverId);
  if (!leftover) {
    return NextResponse.json(
      { error: "Leftover record not found." },
      { status: 404 }
    );
  }

  if (leftover.status !== "logged") {
    return NextResponse.json(
      {
        error: `This leftover outreach is already in state "${leftover.status}".`,
      },
      { status: 409 }
    );
  }

  const limit = await checkAndConsumeLimit(repo, ctx.event, flags, "leftover");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason ?? "Leftover outreach limit reached.", limit },
      { status: 429 }
    );
  }

  const summary = `Approve outreach to ${leftover.ngo_name || "selected NGO"} for leftover food`;
  const dispatch = await nudgeBeeProvider.triggerApproval({
    kind: "leftover_outreach",
    refId: leftover.id,
    summary,
    eventName: ctx.event.name,
    decisionOwnerName: ctx.member.display_name,
  });

  const now = new Date().toISOString();
  if (!dispatch.ok) {
    const failedHistory = [
      ...(leftover.history ?? []),
      {
        at: now,
        actor: ctx.member.display_name,
        event: "dispatch_failed",
        note: dispatch.error,
      },
    ];
    await repo.updateLeftover(ctx.event.id, leftover.id, {
      history: failedHistory,
    });
    return NextResponse.json(
      {
        error:
          dispatch.error ||
          "Could not reach NudgeBee for outreach approval. Please check Status or retry.",
      },
      { status: 502 }
    );
  }

  const updated = await repo.updateLeftover(ctx.event.id, leftover.id, {
    status: "outreach_pending_approval",
    workflow_ref: dispatch.workflowRef,
    history: [
      ...(leftover.history ?? []),
      {
        at: now,
        actor: ctx.member.display_name,
        event: "outreach_submitted_to_nudgebee",
        note: dispatch.workflowRef ?? undefined,
      },
    ],
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "leftover_submitted",
    summary: `${ctx.member.display_name} requested NudgeBee approval for leftover food outreach (${leftover.ngo_name || "NGO"}).`,
    ref_id: leftover.id,
  });

  return NextResponse.json({
    leftover: updated,
    workflowRef: dispatch.workflowRef,
  });
}
