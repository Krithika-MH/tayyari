import { NextRequest, NextResponse } from "next/server";
import { resolveAuthFromRequest } from "@/lib/auth";
import { LANGUAGES, type LanguageCode } from "@/lib/contracts";
import { getRepository } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";
import { sarvamSpeechProvider } from "@/lib/providers/sarvam";
import { checkAndConsumeLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const SPEECH_KEYTERMS = [
  "plates",
  "caterer",
  "mandap",
  "rangoli",
  "decor",
  "venue",
  "return gifts",
  "sweets",
];

function parseLanguageCode(
  raw: FormDataEntryValue | null,
  fallback: LanguageCode
): LanguageCode | "unknown" {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (trimmed === "unknown") return "unknown";
  if ((LANGUAGES as readonly string[]).includes(trimmed)) {
    return trimmed as LanguageCode;
  }
  return fallback;
}

export async function POST(req: NextRequest) {
  const { ctx, errorResponse } = await resolveAuthFromRequest(req);
  if (errorResponse || !ctx) {
    return errorResponse!;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data with an audio file." },
      { status: 400 }
    );
  }

  const fileEntry = formData.get("file");
  if (
    !fileEntry ||
    typeof fileEntry !== "object" ||
    !("arrayBuffer" in fileEntry) ||
    !("size" in fileEntry)
  ) {
    return NextResponse.json(
      { error: "Missing audio file. Please record a voice note or upload an audio clip." },
      { status: 400 }
    );
  }

  if (fileEntry.size <= 0) {
    return NextResponse.json(
      { error: "Audio file is empty. Please try recording again." },
      { status: 400 }
    );
  }

  if (fileEntry.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error:
          "Audio file is larger than 5 MB. Keep voice notes under 25 seconds or type your request.",
      },
      { status: 413 }
    );
  }

  const repo = getRepository();
  const flags = await flagsmithProvider.getFlagsForEvent({
    id: ctx.event.id,
    plan: ctx.event.plan,
    city: ctx.event.city,
    type: ctx.event.type,
    language: ctx.event.language,
  });

  const limitCheck = await checkAndConsumeLimit(repo, ctx.event, flags, "speech");
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error:
          limitCheck.reason ??
          "Voice request limit reached for this event plan.",
        upgradeHint: true,
        used: limitCheck.used,
        limit: limitCheck.limit,
      },
      { status: 429 }
    );
  }

  const languageCode = parseLanguageCode(
    formData.get("language_code"),
    ctx.member.preferred_language || ctx.event.language
  );

  try {
    const buffer = await fileEntry.arrayBuffer();
    const audioBytes = new Uint8Array(buffer);
    const mimeType =
      "type" in fileEntry && typeof fileEntry.type === "string" && fileEntry.type
        ? fileEntry.type
        : "audio/webm";
    const fileName =
      "name" in fileEntry && typeof fileEntry.name === "string" && fileEntry.name
        ? fileEntry.name
        : "audio.webm";

    const result = await sarvamSpeechProvider.transcribe({
      audioBytes,
      mimeType,
      fileName,
      languageCode,
      keyterms: SPEECH_KEYTERMS,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not transcribe audio. Please type your request instead.",
      },
      { status: 502 }
    );
  }
}
