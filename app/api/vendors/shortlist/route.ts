import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeQuotesForMember,
} from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";

const UpsertVendorSchema = z.object({
  category: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().min(1).max(300),
  rating: z.number().min(0).max(5).nullable().optional(),
  user_rating_count: z.number().int().min(0).nullable().optional(),
  maps_url: z.string().url(),
  place_id: z.string().trim().min(1).max(200),
  shortlisted: z.boolean().default(true),
  source: z.enum(["places", "sample"]).default("places"),
  fetched_at: z.string().optional(),
});

const ToggleShortlistSchema = z.object({
  vendorId: z.string().uuid(),
  shortlisted: z.boolean(),
});

export async function GET(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const repo = getRepository();
  const [vendors, quotes] = await Promise.all([
    repo.listVendors(ctx.event.id),
    repo.listQuotes(ctx.event.id),
  ]);

  return NextResponse.json({
    vendors,
    quotes: sanitizeQuotesForMember(quotes, ctx.member),
  });
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

  const repo = getRepository();
  const flags = await flagsmithProvider.getFlagsForEvent(ctx.event);
  if (!flags.module_vendor_finder) {
    return NextResponse.json(
      { error: "Vendor Finder module is currently disabled." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = UpsertVendorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid vendor details.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const vendor = await repo.upsertVendor({
    event_id: ctx.event.id,
    category: parsed.data.category,
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address,
    rating: parsed.data.rating ?? null,
    user_rating_count: parsed.data.user_rating_count ?? null,
    maps_url: parsed.data.maps_url,
    place_id: parsed.data.place_id,
    shortlisted: parsed.data.shortlisted,
    source: parsed.data.source,
    fetched_at: parsed.data.fetched_at ?? new Date().toISOString(),
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "vendor_shortlisted",
    summary: `${ctx.member.display_name} shortlisted ${vendor.name} (${vendor.category}).`,
    ref_id: vendor.id,
  });

  return NextResponse.json({ vendor }, { status: 201 });
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

  const repo = getRepository();
  const flags = await flagsmithProvider.getFlagsForEvent(ctx.event);
  if (!flags.module_vendor_finder) {
    return NextResponse.json(
      { error: "Vendor Finder module is currently disabled." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ToggleShortlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid shortlist update parameters." },
      { status: 400 }
    );
  }

  const vendor = await repo.updateVendor(ctx.event.id, parsed.data.vendorId, {
    shortlisted: parsed.data.shortlisted,
  });
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
  }

  return NextResponse.json({ vendor });
}
