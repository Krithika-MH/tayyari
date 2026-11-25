import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireRole,
  resolveAuthFromRequest,
  sanitizeCategoriesForMember,
} from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  allocated_inr: z.number().int().min(0).max(100000000),
  sort: z.number().int().min(0).optional(),
});

const PatchCategorySchema = z.union([
  z.object({
    updates: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(60).optional(),
          allocated_inr: z.number().int().min(0).max(100000000).optional(),
          sort: z.number().int().min(0).optional(),
        })
      )
      .min(1),
  }),
  z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60).optional(),
    allocated_inr: z.number().int().min(0).max(100000000).optional(),
    sort: z.number().int().min(0).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer", "decision_owner"]);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = CreateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid category details.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const existing = await repo.listCategories(ctx.event.id);
    const maxSort = existing.reduce((m, c) => Math.max(m, c.sort), 0);

    const category = await repo.createCategory({
      event_id: ctx.event.id,
      name: parsed.data.name,
      allocated_inr: parsed.data.allocated_inr,
      sort: parsed.data.sort ?? maxSort + 1,
    });

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "category_created",
      summary: `${ctx.member.display_name} added category "${category.name}".`,
      ref_id: category.id,
    });

    return NextResponse.json(
      { category: sanitizeCategoriesForMember([category], ctx.member)[0] },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create category." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await resolveAuthFromRequest(req);
    if (errorResponse || !ctx) return errorResponse!;

    const forbidden = requireRole(ctx.member, ["organizer", "decision_owner"]);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = PatchCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid category update.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const items = "updates" in parsed.data ? parsed.data.updates : [parsed.data];
    const updated = [];

    for (const item of items) {
      const patch: { name?: string; allocated_inr?: number; sort?: number } = {};
      if (item.name !== undefined) patch.name = item.name;
      if (item.allocated_inr !== undefined) patch.allocated_inr = item.allocated_inr;
      if (item.sort !== undefined) patch.sort = item.sort;
      const cat = await repo.updateCategory(ctx.event.id, item.id, patch);
      if (cat) updated.push(cat);
    }

    await repo.createActivity({
      event_id: ctx.event.id,
      actor_id: ctx.member.id,
      kind: "category_updated",
      summary: `${ctx.member.display_name} updated category allocations.`,
      ref_id: updated[0]?.id ?? null,
    });

    return NextResponse.json({
      categories: sanitizeCategoriesForMember(updated, ctx.member),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update categories." },
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
    let categoryId = url.searchParams.get("id") ?? "";
    if (!categoryId) {
      try {
        const body = (await req.json()) as { id?: string };
        if (body?.id) categoryId = body.id;
      } catch {
        // ignore empty body
      }
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: "Category id is required." },
        { status: 400 }
      );
    }

    const repo = getRepository();
    const expenses = await repo.listExpenses(ctx.event.id);
    if (expenses.some((e) => e.category_id === categoryId)) {
      return NextResponse.json(
        { error: "Move or delete expenses in this category before deleting it." },
        { status: 409 }
      );
    }

    await repo.deleteCategory(ctx.event.id, categoryId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete category." },
      { status: 500 }
    );
  }
}
