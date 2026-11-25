import { NextRequest, NextResponse } from "next/server";
import type {
  CategoryRecord,
  EventRecord,
  ExpenseRecord,
  MemberRecord,
  MemberRole,
  ProposalRecord,
  QuoteRecord,
} from "@/lib/contracts";
import { getRepository } from "@/lib/db/repository";
import type { EventBudgetSummary } from "@/lib/domain/budget";

export interface AuthContext {
  event: EventRecord;
  member: MemberRecord;
}

export async function resolveAuthFromRequest(
  req: NextRequest,
  eventIdParam?: string
): Promise<{ ctx?: AuthContext; errorResponse?: NextResponse }> {
  const url = new URL(req.url);
  const eventId =
    eventIdParam ??
    url.searchParams.get("eventId") ??
    req.headers.get("x-tayyari-event-id") ??
    "";
  const token =
    url.searchParams.get("t") ?? req.headers.get("x-tayyari-token") ?? "";

  if (!eventId || !token) {
    return {
      errorResponse: NextResponse.json(
        { error: "Please open this event using your personal family link." },
        { status: 401 }
      ),
    };
  }

  const repo = getRepository();
  const event = await repo.getEvent(eventId);
  if (!event) {
    return {
      errorResponse: NextResponse.json(
        { error: "We could not find this event." },
        { status: 404 }
      ),
    };
  }

  const member = await repo.getMemberByToken(eventId, token);
  if (!member) {
    return {
      errorResponse: NextResponse.json(
        {
          error:
            "This member link is invalid. Please ask the event organizer for your link.",
        },
        { status: 401 }
      ),
    };
  }

  return { ctx: { event, member } };
}

export function requireRole(
  member: MemberRecord,
  allowed: MemberRole[]
): NextResponse | null {
  if (!allowed.includes(member.role)) {
    return NextResponse.json(
      {
        error: `This action is reserved for ${allowed.join(" or ")}. Your role is ${member.role}.`,
      },
      { status: 403 }
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Server-side Amount Redaction (Rule: removed in API output, not hidden in CSS)
// ---------------------------------------------------------------------------

export function sanitizeEventForMember(
  event: EventRecord,
  member: Pick<MemberRecord, "can_see_amounts">
) {
  if (member.can_see_amounts) return event;
  return {
    ...event,
    total_budget_inr: null,
  };
}

export function sanitizeCategoriesForMember(
  categories: CategoryRecord[],
  member: Pick<MemberRecord, "can_see_amounts">
) {
  if (member.can_see_amounts) return categories;
  return categories.map((c) => ({
    ...c,
    allocated_inr: null,
  }));
}

export function sanitizeExpensesForMember(
  expenses: ExpenseRecord[],
  member: Pick<MemberRecord, "can_see_amounts">
) {
  if (member.can_see_amounts) return expenses;
  return expenses.map((e) => ({
    ...e,
    unit_price_inr: null,
    committed_inr: null,
    paid_inr: null,
  }));
}

export function sanitizeQuotesForMember(
  quotes: QuoteRecord[],
  member: Pick<MemberRecord, "can_see_amounts">
) {
  if (member.can_see_amounts) return quotes;
  return quotes.map((q) => ({
    ...q,
    amount_inr: null,
  }));
}

export function sanitizeProposalsForMember(
  proposals: ProposalRecord[],
  member: Pick<MemberRecord, "can_see_amounts">
) {
  if (member.can_see_amounts) return proposals;
  return proposals.map((p) => ({
    ...p,
    baseline_unit_price_inr: null,
    impact: {
      status: p.impact.status,
      baselineCommittedINR: null,
      deltaINR: null,
      projectedCommittedINR: null,
      overUnderBudgetINR: null,
      alternativeSample: null,
      assumptions: ["Budget figures hidden for your role."],
    },
  }));
}

export function sanitizeBudgetSummaryForMember(
  summary: EventBudgetSummary,
  member: Pick<MemberRecord, "can_see_amounts">
) {
  if (member.can_see_amounts) return summary;
  return {
    amountsHidden: true,
    totalBudgetINR: null,
    allocatedINR: null,
    committedINR: null,
    paidINR: null,
    remainingUnpaidINR: null,
    remainingToAllocateINR: null,
    remainingOverallINR: null,
    pendingProposalsTotalINR: null,
    overBudget: false,
    priceUnknownExpenses: [],
    categories: summary.categories.map((c) => ({
      ...c,
      allocatedINR: null,
      committedINR: null,
      paidINR: null,
      remainingToAllocateINR: null,
    })),
  };
}
