import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";
import { GooglePlacesProvider } from "@/lib/providers/places";
import { checkAndConsumeLimit } from "@/lib/rate-limit";

const SearchNgosSchema = z.object({
  area: z.string().trim().max(120).optional(),
  query: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

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

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = SearchNgosSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid NGO search parameters." },
      { status: 400 }
    );
  }

  const limit = await checkAndConsumeLimit(repo, ctx.event, flags, "search");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason ?? "Search limit reached.", limit },
      { status: 429 }
    );
  }

  const places = new GooglePlacesProvider(repo);
  const result = await places.searchText({
    query:
      parsed.data.query?.trim() ||
      "food donation charity community kitchen shelter",
    category: "ngo",
    city: ctx.event.city,
    area: parsed.data.area ?? ctx.event.area,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
  });

  return NextResponse.json({
    results: result.results,
    fromCache: result.fromCache,
    fallbackUsed: result.fallbackUsed,
    mapsSearchUrl: result.mapsSearchUrl,
  });
}
