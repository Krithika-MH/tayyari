import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";

const ActivatePassSchema = z.object({
  durationDays: z.union([z.literal(30), z.literal(60)]).default(30),
});

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer"]);
    if (forbidden) return forbidden;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = ActivatePassSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Duration must be 30 or 60 days." },
        { status: 400 }
      );
    }

    const { durationDays } = parsed.data;
    const expiresAt = new Date(
      Date.now() + durationDays * 86400 * 1000
    ).toISOString();

    const repo = getRepository();
    const updated = await repo.updateEvent(ctx.event.id, {
      plan: "pass",
      pass_expires_at: expiresAt,
    });
    if (!updated) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const flagsmithSync = await flagsmithProvider.updateEventPlanTrait(
      ctx.event.id,
      "pass"
    );

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "plan_upgraded",
      summary: `${ctx.member.display_name} activated the ${durationDays}-day Event Pass (demo mode — no payment charged).`,
      ref_id: ctx.event.id,
    });

    const flags = await flagsmithProvider.getFlagsForEvent({
      id: updated.id,
      plan: updated.plan,
      city: updated.city,
      type: updated.type,
      language: updated.language,
    });

    return NextResponse.json({
      event: updated,
      flags,
      flagsmithSync,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to activate Event Pass.",
      },
      { status: 500 }
    );
  }
}
