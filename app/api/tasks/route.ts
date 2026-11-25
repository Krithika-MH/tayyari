import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CreateTaskSchema, TASK_STATUSES } from "@/lib/contracts";
import { requireRole, resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { addDaysToISODate } from "@/lib/domain/budget";

const ShiftTemplateSchema = z.object({
  action: z.literal("shift_template_dates"),
  offsetDays: z.number().int().min(-365).max(365),
});

const PatchTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  owner_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  time_label: z.string().max(40).nullable().optional(),
  location_label: z.string().max(120).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const shiftParsed = ShiftTemplateSchema.safeParse(body);
    if (shiftParsed.success) {
      const forbidden = requireRole(ctx.member, ["organizer", "decision_owner"]);
      if (forbidden) return forbidden;

      const repo = getRepository();
      const tasks = await repo.listTasks(ctx.event.id);
      const updated = [];
      for (const t of tasks) {
        if (t.source === "template") {
          const next = await repo.updateTask(ctx.event.id, t.id, {
            due_date: addDaysToISODate(t.due_date, shiftParsed.data.offsetDays),
          });
          if (next) updated.push(next);
        }
      }

      await repo.createActivity({
        event_id: ctx.event.id,
        actor_id: ctx.member.id,
        kind: "tasks_shifted",
        summary: `${ctx.member.display_name} shifted template task dates by ${shiftParsed.data.offsetDays} day(s).`,
        ref_id: ctx.event.id,
      });

      return NextResponse.json({ tasks: updated });
    }

    const forbidden = requireRole(ctx.member, [
      "organizer",
      "decision_owner",
      "helper",
    ]);
    if (forbidden) return forbidden;

    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid task details.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const repo = getRepository();
    const task = await repo.createTask({
      event_id: ctx.event.id,
      title: d.title,
      owner_id: d.owner_id ?? (ctx.member.role === "helper" ? ctx.member.id : null),
      due_date: d.due_date,
      status: "assigned",
      depends_on: null,
      source: d.source,
      time_label: d.time_label ?? null,
      location_label: d.location_label ?? null,
    });

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "task_created",
      summary: `${ctx.member.display_name} added task "${task.title}".`,
      ref_id: task.id,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create task." },
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

    const parsed = PatchTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid task update.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const existing = await repo.getTask(ctx.event.id, parsed.data.id);
    if (!existing) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    if (ctx.member.role === "helper") {
      if (existing.owner_id && existing.owner_id !== ctx.member.id) {
        return NextResponse.json(
          { error: "Helpers can only update tasks assigned to them." },
          { status: 403 }
        );
      }
      if (
        parsed.data.title !== undefined ||
        parsed.data.due_date !== undefined ||
        parsed.data.owner_id !== undefined
      ) {
        return NextResponse.json(
          { error: "Only organizers or decision owners can reassign or edit task details." },
          { status: 403 }
        );
      }
    }

    const { id, ...patch } = parsed.data;
    const finalPatch = {
      ...patch,
      ...(ctx.member.role === "helper" &&
      !existing.owner_id &&
      patch.status &&
      patch.status !== "declined"
        ? { owner_id: ctx.member.id }
        : {}),
    };

    const updated = await repo.updateTask(ctx.event.id, id, finalPatch);
    if (!updated) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    if (patch.status && patch.status !== existing.status) {
      await repo.createActivity({
        event_id: ctx.event.id,
        actor_id: ctx.member.id,
        kind: "task_status",
        summary: `${ctx.member.display_name} marked "${updated.title}" as ${updated.status}.`,
        ref_id: updated.id,
      });
    }

    return NextResponse.json({ task: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update task." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer", "decision_owner"]);
    if (forbidden) return forbidden;

    const url = new URL(req.url);
    let taskId = url.searchParams.get("id") ?? "";
    if (!taskId) {
      try {
        const body = (await req.json()) as { id?: string };
        if (body?.id) taskId = body.id;
      } catch {
        // ignore empty body
      }
    }

    if (!taskId) {
      return NextResponse.json({ error: "Task id is required." }, { status: 400 });
    }

    const repo = getRepository();
    await repo.deleteTask(ctx.event.id, taskId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete task." },
      { status: 500 }
    );
  }
}
