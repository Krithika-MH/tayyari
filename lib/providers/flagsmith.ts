import {
  DEFAULT_EVENT_FLAGS,
  DEFAULT_PLAN_LIMITS,
  PlanLimitsConfigSchema,
  type EventFlags,
  type EventType,
  type FlagProvider,
  type LanguageCode,
} from "@/lib/contracts";

interface FlagsmithApiFlag {
  feature?: { name?: string };
  enabled?: boolean;
  feature_state_value?: unknown;
}

interface FlagsmithIdentityResponse {
  flags?: FlagsmithApiFlag[];
}

const FLAGSMITH_BASE_URL = "https://edge.api.flagsmith.com/api/v1";

function parseBooleanFlag(
  map: Map<string, FlagsmithApiFlag>,
  name: string,
  fallback: boolean
): boolean {
  const f = map.get(name);
  if (!f) return fallback;
  return typeof f.enabled === "boolean" ? f.enabled : fallback;
}

function parseNumberFlag(
  map: Map<string, FlagsmithApiFlag>,
  name: string,
  fallback: number
): number {
  const f = map.get(name);
  if (!f || f.feature_state_value === null || f.feature_state_value === undefined) {
    return fallback;
  }
  const num = Number(f.feature_state_value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export class FlagsmithProvider implements FlagProvider {
  private serverKey: string | undefined;

  constructor(serverKey = process.env.FLAGSMITH_SERVER_KEY?.trim()) {
    this.serverKey = serverKey;
  }

  async getFlagsForEvent(event: {
    id: string;
    plan: "free" | "pass";
    city: string;
    type: EventType;
    language: LanguageCode;
  }): Promise<EventFlags> {
    const now = new Date().toISOString();
    if (!this.serverKey) {
      return {
        ...DEFAULT_EVENT_FLAGS,
        refreshed_at: now,
        warning: "FLAGSMITH_SERVER_KEY is not configured",
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${FLAGSMITH_BASE_URL}/identities/`, {
        method: "POST",
        headers: {
          "X-Environment-Key": this.serverKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          identifier: event.id,
          traits: [
            { trait_key: "plan", trait_value: event.plan },
            { trait_key: "city", trait_value: event.city },
            { trait_key: "event_type", trait_value: event.type },
            { trait_key: "language", trait_value: event.language },
          ],
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          ...DEFAULT_EVENT_FLAGS,
          refreshed_at: now,
          warning: `Flagsmith responded with HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as FlagsmithIdentityResponse;
      const map = new Map<string, FlagsmithApiFlag>();
      for (const flag of data.flags ?? []) {
        const name = flag.feature?.name;
        if (name) map.set(name, flag);
      }

      const rawCardStyle = map.get("decision_card_style")?.feature_state_value;
      const decision_card_style: "impact_first" | "compact" =
        rawCardStyle === "compact" || rawCardStyle === "impact_first"
          ? rawCardStyle
          : "impact_first";

      let plan_limits = DEFAULT_PLAN_LIMITS;
      const rawLimits = map.get("plan_limits")?.feature_state_value;
      if (rawLimits) {
        try {
          const parsedObj =
            typeof rawLimits === "string" ? JSON.parse(rawLimits) : rawLimits;
          const validated = PlanLimitsConfigSchema.safeParse(parsedObj);
          if (validated.success) {
            plan_limits = validated.data;
          }
        } catch {
          plan_limits = DEFAULT_PLAN_LIMITS;
        }
      }

      const freeVoice = parseNumberFlag(
        map,
        "free_voice_requests_limit",
        plan_limits.free.voice_requests
      );
      const freeAgent = parseNumberFlag(
        map,
        "free_agent_messages_limit",
        plan_limits.free.agent_messages
      );

      return {
        decision_card_style,
        module_vendor_finder: parseBooleanFlag(map, "module_vendor_finder", true),
        module_leftover_food: parseBooleanFlag(map, "module_leftover_food", true),
        module_planning_agent: parseBooleanFlag(map, "module_planning_agent", true),
        free_voice_requests_limit: freeVoice,
        free_agent_messages_limit: freeAgent,
        plan_limits: {
          ...plan_limits,
          free: {
            ...plan_limits.free,
            voice_requests: freeVoice,
            agent_messages: freeAgent,
          },
        },
        source: "flagsmith",
        refreshed_at: now,
      };
    } catch (err) {
      return {
        ...DEFAULT_EVENT_FLAGS,
        refreshed_at: now,
        warning:
          err instanceof Error ? err.message : "Flagsmith request failed",
      };
    }
  }

  async updateEventPlanTrait(
    eventId: string,
    plan: "free" | "pass"
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.serverKey) {
      return { ok: false, error: "FLAGSMITH_SERVER_KEY not configured" };
    }
    try {
      const res = await fetch(`${FLAGSMITH_BASE_URL}/identities/`, {
        method: "POST",
        headers: {
          "X-Environment-Key": this.serverKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: eventId,
          traits: [{ trait_key: "plan", trait_value: plan }],
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}

export const flagsmithProvider = new FlagsmithProvider();
