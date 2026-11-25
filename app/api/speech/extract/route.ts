import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthFromRequest, sanitizeExpensesForMember } from "@/lib/auth";
import { LANGUAGES } from "@/lib/contracts";
import { getRepository } from "@/lib/db/repository";
import { fuzzyMatchExpenses } from "@/lib/domain/budget";
import { sarvamLlmProvider } from "@/lib/providers/sarvam";

const ExtractRequestSchema = z.object({
  text: z.string().trim().min(1, "Please provide some text to extract.").max(1000),
  language_code: z.enum(LANGUAGES).optional(),
});

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) {
    return errorResponse!;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a short description of the change.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const repo = getRepository();
  const expenses = await repo.listExpenses(ctx.event.id);
  const languageCode = parsed.data.language_code ?? ctx.member.preferred_language;

  try {
    const extracted = await sarvamLlmProvider.extractIntent({
      text: parsed.data.text,
      languageCode,
      expenseTitles: expenses.map((e) => e.title),
    });

    const match = fuzzyMatchExpenses(extracted.item, expenses);
    const candidates =
      match.candidates.length > 0 ? match.candidates : expenses;

    return NextResponse.json({
      extracted,
      matchedExpenseId: match.exact?.id ?? null,
      candidateExpenses: sanitizeExpensesForMember(candidates, ctx.member),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not extract details automatically. Please select the expense and enter the new quantity manually.",
      },
      { status: 502 }
    );
  }
}
