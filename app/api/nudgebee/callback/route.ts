import { NextRequest, NextResponse } from "next/server";
import { NudgeBeeCallbackSchema } from "@/lib/contracts";
import { getRepository } from "@/lib/db/repository";
import { addDaysToISODate, isStaleProposal } from "@/lib/domain/budget";
import { verifyCallbackSecret } from "@/lib/providers/nudgebee";

function getTodayIST(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

export async function POST(req: NextRequest) {
  if (!verifyCallbackSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = NudgeBeeCallbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid callback payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { kind, refId, decision, idempotencyKey, workflowRunRef, note } =
    parsed.data;
  const repo = getRepository();
  const now = new Date().toISOString();

  if (kind === "change_request") {
    const proposal = await repo.findProposalById(refId);
    if (!proposal) {
      return NextResponse.json(
        { error: "Proposal not found." },
        { status: 404 }
      );
    }

    if (proposal.idempotency_keys.includes(idempotencyKey)) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        kind,
        refId,
        status: proposal.status,
      });
    }

    if (
      (proposal.status === "approved" && decision === "rejected") ||
      (proposal.status === "rejected" && decision === "approved")
    ) {
      return NextResponse.json(
        {
          error: `Conflicting decision: proposal is already ${proposal.status}.`,
          status: proposal.status,
        },
        { status: 409 }
      );
    }

    if (proposal.status === decision) {
      await repo.updateProposal(proposal.event_id, proposal.id, {
        idempotency_keys: [...proposal.idempotency_keys, idempotencyKey],
      });
      return NextResponse.json({
        ok: true,
        idempotent: true,
        kind,
        refId,
        status: proposal.status,
      });
    }

    const expense = await repo.getExpense(
      proposal.event_id,
      proposal.expense_id
    );
    if (!expense) {
      return NextResponse.json(
        { error: "Referenced expense not found." },
        { status: 404 }
      );
    }

    const staleCheck = isStaleProposal(proposal, expense);
    if (staleCheck.stale) {
      await repo.updateProposal(proposal.event_id, proposal.id, {
        status: "stale",
        idempotency_keys: [...proposal.idempotency_keys, idempotencyKey],
        history: [
          ...proposal.history,
          {
            at: now,
            actor: "NudgeBee",
            event: "Marked stale on callback",
            note: staleCheck.reason,
          },
        ],
      });
      return NextResponse.json({
        ok: true,
        stale: true,
        kind,
        refId,
        status: "stale",
      });
    }

    if (decision === "approved") {
      const nextCommitted =
        expense.unit_price_inr !== null
          ? proposal.requested_value * expense.unit_price_inr
          : expense.committed_inr;

      await repo.updateExpense(proposal.event_id, expense.id, {
        quantity: proposal.requested_value,
        committed_inr: nextCommitted,
        version: expense.version + 1,
        vendor_confirmation: "pending",
      });

      await repo.updateProposal(proposal.event_id, proposal.id, {
        status: "approved",
        workflow_ref: workflowRunRef ?? proposal.workflow_ref,
        idempotency_keys: [...proposal.idempotency_keys, idempotencyKey],
        history: [
          ...proposal.history,
          {
            at: now,
            actor: "NudgeBee",
            event: "Approved in NudgeBee workflow",
            note: note || undefined,
          },
        ],
      });

      const event = await repo.getEvent(proposal.event_id);
      const tomorrow = addDaysToISODate(getTodayIST(), 1);
      const dueDate =
        event && tomorrow > event.event_date ? event.event_date : tomorrow;

      await repo.createTask({
        event_id: proposal.event_id,
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
        event_id: proposal.event_id,
        actor_id: proposal.decision_owner_id,
        kind: "proposal_approved",
        summary: `Family approved ${expense.title} (${proposal.previous_value} → ${proposal.requested_value}) in NudgeBee. Vendor confirmation pending.`,
        ref_id: proposal.id,
      });

      return NextResponse.json({
        ok: true,
        kind,
        refId,
        status: "approved",
      });
    }

    await repo.updateProposal(proposal.event_id, proposal.id, {
      status: "rejected",
      workflow_ref: workflowRunRef ?? proposal.workflow_ref,
      idempotency_keys: [...proposal.idempotency_keys, idempotencyKey],
      history: [
        ...proposal.history,
        {
          at: now,
          actor: "NudgeBee",
          event: "Rejected in NudgeBee workflow",
          note: note || undefined,
        },
      ],
    });

    await repo.createActivity({
      event_id: proposal.event_id,
      actor_id: proposal.decision_owner_id,
      kind: "proposal_rejected",
      summary: `Proposal for ${expense.title} (${proposal.previous_value} → ${proposal.requested_value}) was declined in NudgeBee. Baseline unchanged.`,
      ref_id: proposal.id,
    });

    return NextResponse.json({
      ok: true,
      kind,
      refId,
      status: "rejected",
    });
  }

  // kind === "leftover_outreach"
  const leftover = await repo.findLeftoverById(refId);
  if (!leftover) {
    return NextResponse.json(
      { error: "Leftover entry not found." },
      { status: 404 }
    );
  }

  if (leftover.idempotency_keys.includes(idempotencyKey)) {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      kind,
      refId,
      status: leftover.status,
    });
  }

  if (
    (leftover.status === "outreach_approved" && decision === "rejected") ||
    (leftover.status === "not_collected" && decision === "approved")
  ) {
    return NextResponse.json(
      {
        error: `Conflicting decision: leftover outreach is already ${leftover.status}.`,
        status: leftover.status,
      },
      { status: 409 }
    );
  }

  if (
    (leftover.status === "outreach_approved" && decision === "approved") ||
    (leftover.status === "not_collected" && decision === "rejected")
  ) {
    await repo.updateLeftover(leftover.event_id, leftover.id, {
      idempotency_keys: [...leftover.idempotency_keys, idempotencyKey],
    });
    return NextResponse.json({
      ok: true,
      idempotent: true,
      kind,
      refId,
      status: leftover.status,
    });
  }

  const nextStatus =
    decision === "approved" ? "outreach_approved" : "not_collected";

  await repo.updateLeftover(leftover.event_id, leftover.id, {
    status: nextStatus,
    workflow_ref: workflowRunRef ?? leftover.workflow_ref,
    idempotency_keys: [...leftover.idempotency_keys, idempotencyKey],
    history: [
      ...leftover.history,
      {
        at: now,
        actor: "NudgeBee",
        event:
          decision === "approved"
            ? "Leftover outreach approved in NudgeBee"
            : "Leftover outreach rejected in NudgeBee",
        note: note || undefined,
      },
    ],
  });

  await repo.createActivity({
    event_id: leftover.event_id,
    actor_id: null,
    kind:
      decision === "approved"
        ? "leftover_outreach_approved"
        : "leftover_outreach_rejected",
    summary: `Leftover food outreach (${leftover.food_type}) was ${
      decision === "approved" ? "approved" : "declined"
    } in NudgeBee.`,
    ref_id: leftover.id,
  });

  return NextResponse.json({
    ok: true,
    kind,
    refId,
    status: nextStatus,
  });
}
