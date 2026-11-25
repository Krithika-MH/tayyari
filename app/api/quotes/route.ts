import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CreateQuoteSchema } from "@/lib/contracts";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeQuotesForMember,
} from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";

const CommitExistingQuoteSchema = z.object({
  commitExistingQuoteId: z.string().uuid(),
  commitToCategoryId: z.string().uuid(),
  expenseTitle: z.string().trim().min(1).max(120).optional(),
});

const CreateOrCommitQuoteSchema = CreateQuoteSchema.extend({
  commitToCategoryId: z.string().uuid().optional(),
  expenseTitle: z.string().trim().min(1).max(120).optional(),
});

function todayISODate(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const repo = getRepository();
  const quotes = await repo.listQuotes(ctx.event.id);
  return NextResponse.json({
    quotes: sanitizeQuotesForMember(quotes, ctx.member),
  });
}

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const repo = getRepository();
  const flags = await flagsmithProvider.getFlagsForEvent(ctx.event);
  if (!flags.module_vendor_finder) {
    return NextResponse.json(
      { error: "Vendor Finder module is currently disabled." },
      { status: 403 }
    );
  }

  if (!ctx.member.can_see_amounts) {
    return NextResponse.json(
      { error: "Your role does not permit viewing or entering quote amounts." },
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

  // Branch 1: Commit an already-saved quote to a budget category
  const commitOnly = CommitExistingQuoteSchema.safeParse(body);
  if (commitOnly.success) {
    const [quotes, vendors, categories] = await Promise.all([
      repo.listQuotes(ctx.event.id),
      repo.listVendors(ctx.event.id),
      repo.listCategories(ctx.event.id),
    ]);
    const quote = quotes.find(
      (q) => q.id === commitOnly.data.commitExistingQuoteId
    );
    if (!quote) {
      return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    }
    const vendor = vendors.find((v) => v.id === quote.vendor_id);
    const category = categories.find(
      (c) => c.id === commitOnly.data.commitToCategoryId
    );
    if (!category) {
      return NextResponse.json(
        { error: "Budget category not found." },
        { status: 400 }
      );
    }

    const expense = await repo.createExpense({
      event_id: ctx.event.id,
      category_id: category.id,
      title:
        commitOnly.data.expenseTitle?.trim() ||
        `${vendor?.name ?? "Vendor"} (${quote.unit_label})`,
      vendor_id: quote.vendor_id,
      quantity: 1,
      unit_price_inr: quote.amount_inr,
      committed_inr: quote.amount_inr,
      paid_inr: 0,
      status: "committed",
      vendor_confirmation: "pending",
      source: "user_quote",
      quote_date: quote.quote_date,
      version: 1,
      note: `From your quote dated ${quote.quote_date}${quote.inclusions ? ` — ${quote.inclusions}` : ""}`,
    });

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "quote_committed",
      summary: `${ctx.member.display_name} committed quote from ${vendor?.name ?? "vendor"} to ${category.name}.`,
      ref_id: expense.id,
    });

    return NextResponse.json({ quote, expense }, { status: 201 });
  }

  // Branch 2: Create a new quote (and optionally commit to a budget category)
  const parsed = CreateOrCommitQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid quote details.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [vendors, categories] = await Promise.all([
    repo.listVendors(ctx.event.id),
    repo.listCategories(ctx.event.id),
  ]);
  const vendor = vendors.find((v) => v.id === parsed.data.vendor_id);
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
  }

  if (
    parsed.data.commitToCategoryId &&
    !categories.some((c) => c.id === parsed.data.commitToCategoryId)
  ) {
    return NextResponse.json(
      { error: "Selected budget category does not exist." },
      { status: 400 }
    );
  }

  const quoteDate = parsed.data.quote_date ?? todayISODate();
  const quote = await repo.createQuote({
    event_id: ctx.event.id,
    vendor_id: vendor.id,
    amount_inr: parsed.data.amount_inr,
    unit_label: parsed.data.unit_label,
    inclusions: parsed.data.inclusions,
    exclusions: parsed.data.exclusions,
    valid_till: parsed.data.valid_till ?? null,
    entered_by: ctx.member.id,
    quote_date: quoteDate,
  });

  await repo.createActivity({
    event_id: ctx.event.id,
    actor_id: ctx.member.id,
    kind: "quote_added",
    summary: `${ctx.member.display_name} logged a quote for ${vendor.name} (dated ${quoteDate}).`,
    ref_id: quote.id,
  });

  let expense = null;
  if (parsed.data.commitToCategoryId) {
    expense = await repo.createExpense({
      event_id: ctx.event.id,
      category_id: parsed.data.commitToCategoryId,
      title:
        parsed.data.expenseTitle?.trim() ||
        `${vendor.name} (${quote.unit_label})`,
      vendor_id: vendor.id,
      quantity: 1,
      unit_price_inr: quote.amount_inr,
      committed_inr: quote.amount_inr,
      paid_inr: 0,
      status: "committed",
      vendor_confirmation: "pending",
      source: "user_quote",
      quote_date: quote.quote_date,
      version: 1,
      note: `From your quote dated ${quote.quote_date}${quote.inclusions ? ` — ${quote.inclusions}` : ""}`,
    });

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "quote_committed",
      summary: `${ctx.member.display_name} committed quote from ${vendor.name} to budget.`,
      ref_id: expense.id,
    });
  }

  return NextResponse.json({ quote, expense }, { status: 201 });
}
