import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LANGUAGES } from "@/lib/contracts";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeBudgetSummaryForMember,
  sanitizeCategoriesForMember,
  sanitizeEventForMember,
  sanitizeExpensesForMember,
  sanitizeProposalsForMember,
} from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { addDaysToISODate, summarizeBudget } from "@/lib/domain/budget";
import { flagsmithProvider } from "@/lib/providers/flagsmith";

const PatchEventSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  area: z.string().trim().max(80).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  language: z.enum(LANGUAGES).optional(),
  guest_count: z.number().int().min(1).max(10000).optional(),
  total_budget_inr: z.number().int().min(0).max(100000000).optional(),
  shift_task_dates: z.boolean().optional(),
});

function diffDaysISO(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.split("-").map(Number);
  const [y2, m2, d2] = toISO.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;
    const { ctx, errorResponse } = await resolveAuthFromRequest(req, eventId);
    if (errorResponse || !ctx) return errorResponse!;

    const { event, member } = ctx;
    const repo = getRepository();

    const [
      members,
      categories,
      expenses,
      tasks,
      proposals,
      guests,
      activity,
      usage,
      flags,
    ] = await Promise.all([
      repo.listMembers(event.id),
      repo.listCategories(event.id),
      repo.listExpenses(event.id),
      repo.listTasks(event.id),
      repo.listProposals(event.id),
      repo.listGuests(event.id),
      repo.listActivity(event.id, 30),
      repo.getAllUsageTotals(event.id),
      flagsmithProvider.getFlagsForEvent({
        id: event.id,
        plan: event.plan,
        city: event.city,
        type: event.type,
        language: event.language,
      }),
    ]);

    const budgetSummary = summarizeBudget(event, categories, expenses, proposals);

    const sanitizedMembers = members.map((m) => ({
      id: m.id,
      created_at: m.created_at,
      event_id: m.event_id,
      display_name: m.display_name,
      role: m.role,
      can_see_amounts: m.can_see_amounts,
      preferred_language: m.preferred_language,
      ...(member.role === "organizer" ? { access_token: m.access_token } : {}),
    }));

    return NextResponse.json({
      event: sanitizeEventForMember(event, member),
      member,
      members: sanitizedMembers,
      categories: sanitizeCategoriesForMember(categories, member),
      expenses: sanitizeExpensesForMember(expenses, member),
      tasks,
      proposals: sanitizeProposalsForMember(proposals, member),
      guests,
      activity,
      budgetSummary: sanitizeBudgetSummaryForMember(budgetSummary, member),
      usage,
      flags,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load event.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;
    const { ctx, errorResponse } = await resolveAuthFromRequest(req, eventId);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer"]);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = PatchEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid event update fields.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { shift_task_dates, ...patch } = parsed.data;
    const repo = getRepository();
    const updated = await repo.updateEvent(ctx.event.id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    if (
      shift_task_dates &&
      patch.event_date &&
      patch.event_date !== ctx.event.event_date
    ) {
      const deltaDays = diffDaysISO(ctx.event.event_date, patch.event_date);
      if (deltaDays !== 0) {
        const tasks = await repo.listTasks(ctx.event.id);
        for (const t of tasks) {
          if (t.source === "template") {
            await repo.updateTask(ctx.event.id, t.id, {
              due_date: addDaysToISODate(t.due_date, deltaDays),
            });
          }
        }
      }
    }

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "event_updated",
      summary: `${ctx.member.display_name} updated event details.`,
      ref_id: ctx.event.id,
    });

    return NextResponse.json({ event: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update event." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;
    const { ctx, errorResponse } = await resolveAuthFromRequest(req, eventId);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer"]);
    if (forbidden) return forbidden;

    const repo = getRepository();
    await repo.deleteEvent(ctx.event.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete event." },
      { status: 500 }
    );
  }
}
