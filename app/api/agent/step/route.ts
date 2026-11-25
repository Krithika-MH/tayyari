import { NextRequest, NextResponse } from "next/server";
import { AgentStepInputSchema } from "@/lib/contracts";
import { resolveAuthFromRequest } from "@/lib/auth";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";
import { runAgentStep } from "@/lib/agent/orchestrator";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  const repo = getRepository();
  const [flags, turns] = await Promise.all([
    flagsmithProvider.getFlagsForEvent(ctx.event),
    repo.listAgentTurns(ctx.event.id, ctx.member.id, 30),
  ]);

  return NextResponse.json({
    enabled: flags.module_planning_agent,
    turns,
  });
}

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parsed = AgentStepInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request parameters.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const repo = getRepository();
  const flags = await flagsmithProvider.getFlagsForEvent(ctx.event);

  const result = await runAgentStep({
    repo,
    event: ctx.event,
    member: ctx.member,
    flags,
    message: parsed.data.message,
    confirmActionTurnId: parsed.data.confirmActionTurnId,
    dismissActionTurnId: parsed.data.dismissActionTurnId,
  });

  if (result.status !== 200) {
    return NextResponse.json(
      { error: result.error ?? "Planning Assistant error." },
      { status: result.status }
    );
  }

  return NextResponse.json({
    turn: result.turn ?? null,
    turns: result.turns ?? [],
    steps: result.steps,
    continue: result.continue,
    pendingAction: result.pendingAction,
  });
}
