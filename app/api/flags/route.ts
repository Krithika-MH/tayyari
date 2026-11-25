import { NextRequest, NextResponse } from "next/server";
import { resolveAuthFromRequest } from "@/lib/auth";
import { flagsmithProvider } from "@/lib/providers/flagsmith";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const hasEventId = Boolean(
    url.searchParams.get("eventId") ?? req.headers.get("x-tayyari-event-id")
  );

  if (!hasEventId) {
    const flags = await flagsmithProvider.getFlagsForEvent({
      id: "tayyari-default",
      plan: "free",
      city: "Bengaluru",
      type: "engagement",
      language: "en-IN",
    });
    return NextResponse.json(flags);
  }

  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) {
    return errorResponse!;
  }

  const flags = await flagsmithProvider.getFlagsForEvent({
    id: ctx.event.id,
    plan: ctx.event.plan,
    city: ctx.event.city,
    type: ctx.event.type,
    language: ctx.event.language,
  });

  return NextResponse.json(flags);
}
