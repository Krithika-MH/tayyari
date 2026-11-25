import type { EventFlags, EventRecord, UsageKind } from "@/lib/contracts";
import type { TayyariRepository } from "@/lib/db/repository";

const DAILY_CAP_PER_EVENT: Record<UsageKind, number> = {
  speech: 200,
  agent: 400,
  search: 250,
  leftover: 20,
};

export interface LimitCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  reason?: string;
}

export function getActivePlanTier(event: Pick<EventRecord, "plan" | "pass_expires_at">): "free" | "pass_60" {
  if (event.plan !== "pass") return "free";
  if (event.pass_expires_at && new Date(event.pass_expires_at).getTime() < Date.now()) {
    return "free";
  }
  return "pass_60";
}

export async function checkAndConsumeLimit(
  repo: TayyariRepository,
  event: EventRecord,
  flags: EventFlags,
  kind: UsageKind
): Promise<LimitCheckResult> {
  const tierKey = getActivePlanTier(event);
  const tier = flags.plan_limits[tierKey];

  let limit = 10;
  if (kind === "speech") {
    limit =
      tierKey === "free"
        ? Math.min(tier.voice_requests, flags.free_voice_requests_limit || tier.voice_requests)
        : tier.voice_requests;
  } else if (kind === "agent") {
    limit =
      tierKey === "free"
        ? Math.min(tier.agent_messages, flags.free_agent_messages_limit || tier.agent_messages)
        : tier.agent_messages;
  } else if (kind === "search") {
    limit = tier.vendor_searches;
  } else if (kind === "leftover") {
    limit = tier.leftover_outreach;
  }

  const totalUsed = await repo.getUsageTotal(event.id, kind);
  if (totalUsed >= limit) {
    return {
      allowed: false,
      used: totalUsed,
      limit,
      reason: `You have reached the ${tierKey === "free" ? "Free plan" : "Event Pass"} limit of ${limit} ${kind} requests. You can upgrade on the Pricing page or continue with manual entry.`,
    };
  }

  const todayUsed = await repo.getUsageToday(event.id, kind);
  if (todayUsed >= DAILY_CAP_PER_EVENT[kind]) {
    return {
      allowed: false,
      used: todayUsed,
      limit: DAILY_CAP_PER_EVENT[kind],
      reason: "Daily safety rate limit reached for this event. Please try again tomorrow.",
    };
  }

  await repo.incrementUsage(event.id, kind);
  return {
    allowed: true,
    used: totalUsed + 1,
    limit,
  };
}
