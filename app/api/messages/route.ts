import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  LANGUAGES,
  MESSAGE_RECIPIENT_TYPES,
  MESSAGE_STATUSES,
} from "@/lib/contracts";
import { requireRole, resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { sarvamLlmProvider } from "@/lib/providers/sarvam";

const CreateMessageSchema = z.object({
  to_type: z.enum(MESSAGE_RECIPIENT_TYPES),
  to_name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(2).max(200),
  language: z.enum(LANGUAGES).default("en-IN"),
  bodyOverride: z.string().trim().min(1).max(1500).optional(),
});

const PatchMessageSchema = z.object({
  messageId: z.string().uuid(),
  body: z.string().trim().min(1).max(1500).optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
});

function buildDeterministicMessage(input: {
  recipientType: string;
  recipientName: string;
  purpose: string;
  eventName: string;
  eventDate: string;
  city: string;
  area: string;
  guestCount: number;
}): string {
  const place = input.area ? `${input.area}, ${input.city}` : input.city;
  if (input.recipientType === "ngo") {
    return `Namaste ${input.recipientName}, we are reaching out from ${input.eventName} (${input.eventDate}, ${place}) regarding: ${input.purpose}. Could you please confirm if your organisation can collect and assess food today?`;
  }
  return `Namaste ${input.recipientName}, warm greetings regarding ${input.eventName} on ${input.eventDate} in ${place} (approx. ${input.guestCount} guests). Purpose: ${input.purpose}. Please let us know when convenient.`;
}

export async function GET(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const repo = getRepository();
  const messages = await repo.listMessages(ctx.event.id);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const roleError = requireRole(ctx.member, [
    "organizer",
    "decision_owner",
    "helper",
  ]);
  if (roleError) return roleError;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = CreateMessageSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check recipient name, purpose, and language." },
      { status: 400 }
    );
  }

  const repo = getRepository();
  const { to_type, to_name, purpose, language, bodyOverride } = parsed.data;

  // Strictly DB facts only; never include fabricated prices or confirmations.
  const facts: Record<string, string | number | null> = {
    eventName: ctx.event.name,
    eventType: ctx.event.type,
    eventDate: ctx.event.event_date,
    city: ctx.event.city,
    area: ctx.event.area || null,
    guestCount: ctx.event.guest_count,
  };

  let draftedBody: string;
  if (bodyOverride) {
    draftedBody = bodyOverride;
  } else {
    try {
      draftedBody = await sarvamLlmProvider.draftMessage({
        recipientType: to_type,
        recipientName: to_name,
        purpose,
        language,
        facts,
      });
    } catch {
      draftedBody = buildDeterministicMessage({
        recipientType: to_type,
        recipientName: to_name,
        purpose,
        eventName: ctx.event.name,
        eventDate: ctx.event.event_date,
        city: ctx.event.city,
        area: ctx.event.area,
        guestCount: ctx.event.guest_count,
      });
    }
  }

  const message = await repo.createMessage({
    event_id: ctx.event.id,
    to_type,
    to_name,
    purpose,
    language,
    body: draftedBody,
    status: "prepared",
    created_by: ctx.member.id,
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "message_prepared",
    summary: `${ctx.member.display_name} prepared a ${language} message for ${to_name}.`,
    ref_id: message.id,
  });

  return NextResponse.json({ message }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const roleError = requireRole(ctx.member, [
    "organizer",
    "decision_owner",
    "helper",
  ]);
  if (roleError) return roleError;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PatchMessageSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message update parameters." },
      { status: 400 }
    );
  }

  const repo = getRepository();
  const patch: { body?: string; status?: (typeof MESSAGE_STATUSES)[number] } =
    {};
  if (parsed.data.body !== undefined) patch.body = parsed.data.body;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  const updated = await repo.updateMessage(
    ctx.event.id,
    parsed.data.messageId,
    patch
  );
  if (!updated) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  return NextResponse.json({ message: updated });
}
