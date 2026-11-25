import { NextResponse } from "next/server";
import { getRepository, isSupabaseConfigured } from "@/lib/db/repository";
import { flagsmithProvider } from "@/lib/providers/flagsmith";

export const dynamic = "force-dynamic";

type HealthStatus = "green" | "amber" | "red";

interface HealthCheckItem {
  name: string;
  status: HealthStatus;
  detail: string;
}

async function checkSupabase(): Promise<HealthCheckItem> {
  if (!isSupabaseConfigured()) {
    if (process.env.ENABLE_DEMO_MEMORY_DB === "true") {
      return {
        name: "Supabase",
        status: "amber",
        detail:
          "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; demo in-memory DB is active.",
      };
    }
    return {
      name: "Supabase",
      status: "red",
      detail: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    };
  }

  try {
    const repo = getRepository();
    const res = await repo.ping();
    if (res.ok) {
      return {
        name: "Supabase",
        status: "green",
        detail: "Connected and responding to queries.",
      };
    }
    return {
      name: "Supabase",
      status: "red",
      detail: res.error
        ? `Database ping failed: ${res.error.slice(0, 120)}`
        : "Database ping failed.",
    };
  } catch (err) {
    return {
      name: "Supabase",
      status: "red",
      detail:
        err instanceof Error
          ? err.message.slice(0, 120)
          : "Database connection failed.",
    };
  }
}

async function checkSarvam(): Promise<HealthCheckItem> {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) {
    return {
      name: "Sarvam AI",
      status: "amber",
      detail: "SARVAM_API_KEY is not configured.",
    };
  }

  const baseUrl = (
    process.env.SARVAM_LLM_BASE_URL?.trim() || "https://api.sarvam.ai/v1"
  ).replace(/\/$/, "");
  const model = process.env.SARVAM_LLM_MODEL?.trim() || "sarvam-105b";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      return {
        name: "Sarvam AI",
        status: "green",
        detail: `API key verified (${model} reachable).`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        name: "Sarvam AI",
        status: "red",
        detail: `Authentication rejected (HTTP ${res.status}).`,
      };
    }
    return {
      name: "Sarvam AI",
      status: "amber",
      detail: `Returned HTTP ${res.status}.`,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      name: "Sarvam AI",
      status: "amber",
      detail:
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out after 5s."
          : "Could not reach Sarvam AI endpoint.",
    };
  }
}

async function checkFlagsmith(): Promise<HealthCheckItem> {
  const serverKey = process.env.FLAGSMITH_SERVER_KEY?.trim();
  if (!serverKey) {
    return {
      name: "Flagsmith",
      status: "amber",
      detail: "FLAGSMITH_SERVER_KEY not set; using safe default flags.",
    };
  }

  const flags = await flagsmithProvider.getFlagsForEvent({
    id: "tayyari-health-probe",
    plan: "free",
    city: "Bengaluru",
    type: "engagement",
    language: "en-IN",
  });

  if (flags.source === "flagsmith") {
    return {
      name: "Flagsmith",
      status: "green",
      detail: `Connected (${flags.decision_card_style} layout active).`,
    };
  }

  return {
    name: "Flagsmith",
    status: "amber",
    detail: flags.warning
      ? `Fallback to defaults (${flags.warning.slice(0, 100)}).`
      : "Unreachable; using safe default flags.",
  };
}

async function checkGooglePlaces(): Promise<HealthCheckItem> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    return {
      name: "Google Places",
      status: "amber",
      detail:
        "GOOGLE_PLACES_API_KEY not set; sample listings & Maps fallback active.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName",
        },
        body: JSON.stringify({
          textQuery: "Bengaluru",
          pageSize: 1,
        }),
        cache: "no-store",
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (res.ok) {
      return {
        name: "Google Places",
        status: "green",
        detail: "Places API (New) reachable and returning results.",
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        name: "Google Places",
        status: "red",
        detail: `API key rejected (HTTP ${res.status}).`,
      };
    }
    return {
      name: "Google Places",
      status: "amber",
      detail: `Places probe returned HTTP ${res.status}.`,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      name: "Google Places",
      status: "amber",
      detail:
        err instanceof Error && err.name === "AbortError"
          ? "Places probe timed out after 5s."
          : "Could not reach Google Places API.",
    };
  }
}

function checkNudgeBee(): HealthCheckItem {
  const webhookUrl = process.env.NUDGEBEE_WEBHOOK_URL?.trim();
  const callbackSecret = process.env.CALLBACK_SECRET?.trim();
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();

  const missing: string[] = [];
  if (!webhookUrl) missing.push("NUDGEBEE_WEBHOOK_URL");
  if (!callbackSecret) missing.push("CALLBACK_SECRET");
  if (!publicBaseUrl) missing.push("PUBLIC_BASE_URL");

  if (missing.length === 3) {
    return {
      name: "NudgeBee",
      status: "amber",
      detail: "NudgeBee webhook and callback settings are not configured.",
    };
  }

  if (missing.length > 0) {
    return {
      name: "NudgeBee",
      status: "amber",
      detail: `Missing configuration: ${missing.join(", ")}.`,
    };
  }

  try {
    const parsed = new URL(webhookUrl!);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        name: "NudgeBee",
        status: "red",
        detail: "NUDGEBEE_WEBHOOK_URL must use http or https.",
      };
    }
  } catch {
    return {
      name: "NudgeBee",
      status: "red",
      detail: "NUDGEBEE_WEBHOOK_URL is not a valid URL.",
    };
  }

  if (callbackSecret === "replace-with-strong-random-secret") {
    return {
      name: "NudgeBee",
      status: "amber",
      detail:
        "Webhook URL set, but CALLBACK_SECRET is still the default placeholder.",
    };
  }

  return {
    name: "NudgeBee",
    status: "green",
    detail:
      "Webhook URL, callback secret, and public base URL configured (not triggered by health check).",
  };
}

export async function GET() {
  const [supabase, sarvam, flagsmith, places] = await Promise.all([
    checkSupabase(),
    checkSarvam(),
    checkFlagsmith(),
    checkGooglePlaces(),
  ]);
  const nudgebee = checkNudgeBee();

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    checks: [supabase, sarvam, flagsmith, nudgebee, places],
  });
}
