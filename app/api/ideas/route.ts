import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LANGUAGES } from "@/lib/contracts";
import { resolveAuthFromRequest } from "@/lib/auth";
import { sarvamLlmProvider } from "@/lib/providers/sarvam";

const IdeasSchema = z.object({
  category: z.string().trim().min(1).max(60),
  vibe: z.string().trim().min(1).max(120),
  language: z.enum(LANGUAGES).optional(),
});

const FALLBACK_IDEAS = [
  "Use marigold and mango leaf garlands at the entrance for warm colour.",
  "Group brass diyas or earthen lamps near the welcome table.",
  "Print a single reusable welcome board instead of individual flyers.",
  "Choose seasonal local flowers from the morning market.",
  "Pack return gifts in reusable cotton potli bags.",
];

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) return errorResponse!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = IdeasSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a category and vibe." },
      { status: 400 }
    );
  }

  let ideas: string[];
  try {
    ideas = await sarvamLlmProvider.festiveIdeas({
      eventType: ctx.event.type,
      category: parsed.data.category,
      vibe: parsed.data.vibe,
      language: parsed.data.language ?? ctx.member.preferred_language,
    });
  } catch {
    ideas = FALLBACK_IDEAS;
  }

  return NextResponse.json({
    ideas,
    disclaimer: "AI idea, not a quote. Get a real price before deciding.",
  });
}
