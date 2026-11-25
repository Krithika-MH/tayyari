import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CreateLeftoverSchema, type LeftoverStatus } from "@/lib/contracts";
import { requireRole, resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";

const UpdateLeftoverSchema = z.object({
  leftoverId: z.string().uuid(),
  status: z
    .enum(["contacted", "accepted", "declined", "collected", "not_collected"])
    .optional(),
  ngo_place_id: z.string().nullable().optional(),
  ngo_name: z.string().nullable().optional(),
  ngo_phone: z.string().nullable().optional(),
  ngo_maps_url: z.string().nullable().optional(),
  note: z.string().max(300).optional(),
});

const POST_APPROVAL_STATES: ReadonlyArray<LeftoverStatus> = [
  "outreach_approved",
  "contacted",
  "accepted",
  "declined",
  "collected",
  "not_collected",
];

export async function GET(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const repo = getRepository();
  const [flags, leftovers] = await Promise.all([
    flagsmithProvider.getFlagsForEvent(ctx.event),
    repo.listLeftovers(ctx.event.id),
  ]);

  return NextResponse.json({
    enabled: flags.module_leftover_food,
    leftovers,
  });
}

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = CreateLeftoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check your leftover food details.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const leftover = await repo.createLeftover({
    event_id: ctx.event.id,
    food_type: parsed.data.food_type,
    approx_portions: parsed.data.approx_portions,
    served_at: parsed.data.served_at,
    storage_notes: parsed.data.storage_notes || "unknown",
    allergen_notes: parsed.data.allergen_notes || "unknown",
    pickup_location: parsed.data.pickup_location,
    ngo_place_id: parsed.data.ngo_place_id ?? null,
    ngo_name: parsed.data.ngo_name ?? null,
    ngo_phone: parsed.data.ngo_phone ?? null,
    ngo_maps_url: parsed.data.ngo_maps_url ?? null,
    status: "logged",
    workflow_ref: null,
    idempotency_keys: [],
    history: [
      {
        at: now,
        actor: ctx.member.display_name,
        event: "logged",
      },
    ],
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "leftover_logged",
    summary: `${ctx.member.display_name} logged approx. ${leftover.approx_portions} portions of "${leftover.food_type}" for leftover outreach planning.`,
    ref_id: leftover.id,
  });

  return NextResponse.json({ leftover }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = UpdateLeftoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid leftover update parameters." },
      { status: 400 }
    );
  }

  const existing = await repo.getLeftover(ctx.event.id, parsed.data.leftoverId);
  if (!existing) {
    return NextResponse.json(
      { error: "Leftover record not found." },
      { status: 404 }
    );
  }

  if (parsed.data.status && !POST_APPROVAL_STATES.includes(existing.status)) {
    return NextResponse.json(
      {
        error:
          "Family approval in NudgeBee is required before contacting an organisation or recording outreach outcomes.",
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const nextHistory = [...(existing.history ?? [])];
  if (parsed.data.status) {
    nextHistory.push({
      at: now,
      actor: ctx.member.display_name,
      event: `status_${parsed.data.status}`,
      note: parsed.data.note,
    });
  } else if (parsed.data.ngo_name !== undefined) {
    nextHistory.push({
      at: now,
      actor: ctx.member.display_name,
      event: "ngo_selected",
      note: parsed.data.ngo_name ?? undefined,
    });
  }

  const updated = await repo.updateLeftover(ctx.event.id, existing.id, {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.ngo_place_id !== undefined
      ? { ngo_place_id: parsed.data.ngo_place_id }
      : {}),
    ...(parsed.data.ngo_name !== undefined
      ? { ngo_name: parsed.data.ngo_name }
      : {}),
    ...(parsed.data.ngo_phone !== undefined
      ? { ngo_phone: parsed.data.ngo_phone }
      : {}),
    ...(parsed.data.ngo_maps_url !== undefined
      ? { ngo_maps_url: parsed.data.ngo_maps_url }
      : {}),
    history: nextHistory,
  });

  if (parsed.data.status) {
    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "leftover_updated",
      summary: `${ctx.member.display_name} marked leftover food "${existing.food_type}" as ${parsed.data.status.replace("_", " ")}.`,
      ref_id: existing.id,
    });
  }

  return NextResponse.json({ leftover: updated });
}
