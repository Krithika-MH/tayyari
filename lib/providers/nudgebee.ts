import { timingSafeEqual } from "crypto";
import type { WorkflowProvider } from "@/lib/contracts";

export function verifyCallbackSecret(authHeader: string | null): boolean {
  const expected = process.env.CALLBACK_SECRET?.trim();
  if (!expected || !authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  const provided = authHeader.slice(prefix.length).trim();

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class NudgeBeeWorkflowProvider implements WorkflowProvider {
  async triggerApproval(input: {
    kind: "change_request" | "leftover_outreach";
    refId: string;
    summary: string;
    eventName: string;
    decisionOwnerName: string;
    deltaINR?: number | null;
    projectedOverUnderINR?: number | null;
  }): Promise<{ ok: boolean; workflowRef: string | null; error?: string }> {
    const webhookUrl = process.env.NUDGEBEE_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
      return {
        ok: false,
        workflowRef: null,
        error: "NUDGEBEE_WEBHOOK_URL is not configured.",
      };
    }

    const payload: Record<string, unknown> = {
      kind: input.kind,
      refId: input.refId,
      summary: input.summary,
      eventName: input.eventName,
      decisionOwnerName: input.decisionOwnerName,
    };

    if (input.kind === "change_request") {
      payload.deltaINR = input.deltaINR ?? null;
      payload.projectedOverUnderINR = input.projectedOverUnderINR ?? null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          ok: false,
          workflowRef: null,
          error: `NudgeBee webhook returned HTTP ${res.status}`,
        };
      }

      let workflowRef: string | null = null;
      try {
        const data = (await res.json()) as Record<string, unknown>;
        const maybeRef =
          data.run_id ?? data.runId ?? data.execution_id ?? data.executionId ?? data.id;
        if (typeof maybeRef === "string" && maybeRef.trim()) {
          workflowRef = maybeRef.trim();
        }
      } catch {
        workflowRef = null;
      }

      return { ok: true, workflowRef };
    } catch (err) {
      clearTimeout(timeout);
      return {
        ok: false,
        workflowRef: null,
        error:
          err instanceof Error
            ? err.message
            : "Could not reach NudgeBee webhook",
      };
    }
  }
}

export const nudgeBeeProvider = new NudgeBeeWorkflowProvider();
