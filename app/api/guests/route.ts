import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";

const CreateGuestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  group_label: z.string().trim().max(80).default("Family"),
  count: z.number().int().min(1).max(200).default(1),
  dietary_note: z.string().trim().max(240).default(""),
  rsvp: z.enum(["unknown", "yes", "no"]).default("unknown"),
});

const PatchGuestSchema = z.object({
  id: z.string().uuid(),
  rsvp: z.enum(["unknown", "yes", "no"]).optional(),
  count: z.number().int().min(1).max(200).optional(),
  dietary_note: z.string().trim().max(240).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const repo = getRepository();
    const guests = await repo.listGuests(ctx.event.id);
    return NextResponse.json({ guests });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list guests." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, [
      "organizer",
      "decision_owner",
      "helper",
    ]);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = CreateGuestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid guest details.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const guest = await repo.createGuest({
      event_id: ctx.event.id,
      name: parsed.data.name,
      group_label: parsed.data.group_label,
      count: parsed.data.count,
      dietary_note: parsed.data.dietary_note,
      rsvp: parsed.data.rsvp,
    });

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "guest_added",
      summary: `${ctx.member.display_name} added guest "${guest.name}" (${guest.count}).`,
      ref_id: guest.id,
    });

    return NextResponse.json({ guest }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add guest." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, [
      "organizer",
      "decision_owner",
      "helper",
    ]);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = PatchGuestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid guest update.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const { id, ...patch } = parsed.data;
    const guest = await repo.updateGuest(ctx.event.id, id, patch);
    if (!guest) {
      return NextResponse.json({ error: "Guest not found." }, { status: 404 });
    }

    return NextResponse.json({ guest });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update guest." },
      { status: 500 }
    );
  }
}
