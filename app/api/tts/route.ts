import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthFromRequest } from "@/lib/auth";
import { LANGUAGES } from "@/lib/contracts";
import { sarvamSpeechProvider } from "@/lib/providers/sarvam";

const TtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
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

  const parsed = TtsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Text is required for audio playback." },
      { status: 400 }
    );
  }

  const languageCode = parsed.data.language_code ?? ctx.member.preferred_language;

  try {
    const result = await sarvamSpeechProvider.synthesize({
      text: parsed.data.text,
      languageCode,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Voice playback is currently unavailable." },
      { status: 503 }
    );
  }
}
