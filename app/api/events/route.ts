import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { CreateEventSchema } from "@/lib/contracts";
import { getRepository } from "@/lib/db/repository";
import {
  addDaysToISODate,
  buildAllocatedCategories,
  TASK_TEMPLATES,
} from "@/lib/domain/budget";

function makeToken(): string {
  return randomBytes(16).toString("hex");
}

export async function GET() {
  try {
    const repo = getRepository();
    const events = await repo.listEvents();
    const summaries = events.map((e) => ({
      id: e.id,
      created_at: e.created_at,
      name: e.name,
      type: e.type,
      city: e.city,
      area: e.area,
      event_date: e.event_date,
      language: e.language,
      guest_count: e.guest_count,
      plan: e.plan,
      is_demo: e.is_demo,
    }));
    return NextResponse.json({ events: summaries });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to list events.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const parsed = CreateEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please check the event details and try again.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const repo = getRepository();

    const event = await repo.createEvent({
      name: data.name,
      type: data.type,
      city: data.city,
      area: data.area,
      event_date: data.event_date,
      language: data.language,
      guest_count: data.guest_count,
      total_budget_inr: data.total_budget_inr,
      plan: "free",
      pass_expires_at: null,
      is_demo: false,
    });

    const catInputs =
      data.categories && data.categories.length > 0
        ? data.categories.map((c, idx) => ({
            name: c.name,
            allocated_inr: c.allocated_inr,
            sort: idx + 1,
          }))
        : buildAllocatedCategories(data.type, data.total_budget_inr);

    const categories = [];
    for (const c of catInputs) {
      categories.push(
        await repo.createCategory({
          event_id: event.id,
          name: c.name,
          allocated_inr: c.allocated_inr,
          sort: c.sort,
        })
      );
    }

    const rawMembers =
      data.members && data.members.length > 0
        ? [...data.members]
        : [
            {
              display_name: "Organizer",
              role: "organizer" as const,
              can_see_amounts: true,
              preferred_language: data.language,
            },
          ];

    if (!rawMembers.some((m) => m.role === "organizer")) {
      rawMembers.unshift({
        display_name: "Organizer",
        role: "organizer",
        can_see_amounts: true,
        preferred_language: data.language,
      });
    }

    const members = [];
    for (const m of rawMembers) {
      const canSee =
        m.can_see_amounts !== undefined
          ? m.can_see_amounts
          : m.role === "organizer" || m.role === "decision_owner";
      members.push(
        await repo.createMember({
          event_id: event.id,
          display_name: m.display_name,
          role: m.role,
          can_see_amounts: canSee,
          access_token: makeToken(),
          preferred_language: m.preferred_language ?? data.language,
        })
      );
    }

    const organizer =
      members.find((m) => m.role === "organizer") ?? members[0];

    const templates = TASK_TEMPLATES[data.type] ?? TASK_TEMPLATES.other;
    for (const t of templates) {
      await repo.createTask({
        event_id: event.id,
        title: t.title,
        owner_id: organizer.id,
        due_date: addDaysToISODate(data.event_date, t.offsetDays),
        status: "assigned",
        depends_on: null,
        source: "template",
        time_label: t.time_label ?? null,
        location_label: t.location_label ?? null,
      });
    }

    await repo.createActivity({
      event_id: event.id,
      actor_id: organizer.id,
      kind: "event_created",
      summary: `Created ${event.name} (${event.city}).`,
      ref_id: event.id,
    });

    return NextResponse.json(
      {
        event,
        categories,
        members,
        organizerUrl: `/e/${event.id}?t=${encodeURIComponent(organizer.access_token)}`,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create event.",
      },
      { status: 500 }
    );
  }
}
