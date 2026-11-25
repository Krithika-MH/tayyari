"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Mic,
  Send,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import type { AgentTurnRecord, LanguageCode } from "@/lib/contracts";
import { Button, StatusChip, useToast } from "@/components/ui/primitives";
import { VoiceRecorder } from "@/components/ui/VoiceRecorder";

const STARTER_CHIPS = [
  "What is pending this week?",
  "Find return gift shops near me",
  "How much is left for decor?",
];

export function AgentPanel({
  open,
  onClose,
  eventId,
  token,
  language,
  canSeeAmounts,
  onActionConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  token: string;
  language: LanguageCode;
  canSeeAmounts: boolean;
  onActionConfirmed?: () => void;
}) {
  const { pushToast } = useToast();
  const [turns, setTurns] = useState<AgentTurnRecord[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [actingTurnId, setActingTurnId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [showMic, setShowMic] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const authQuery = `eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`;

  const loadTurns = useCallback(async () => {
    if (!eventId || !token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/agent/step?${authQuery}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.enabled !== false);
        setTurns(Array.isArray(data.turns) ? data.turns : []);
      }
    } catch {
      // Non-fatal on initial load
    } finally {
      setLoadingHistory(false);
    }
  }, [authQuery, eventId, token]);

  useEffect(() => {
    if (open) {
      void loadTurns();
    }
  }, [open, loadTurns]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, turns, sending]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setErrorMsg(null);
    setInput("");
    setShowMic(false);

    // Optimistic user turn preview
    const tempId = `temp-${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: tempId,
        created_at: new Date().toISOString(),
        event_id: eventId,
        member_id: "",
        role: "user",
        content: trimmed,
        tool_name: null,
        tool_args: null,
        tool_result: null,
        pending_action: null,
        action_status: "none",
      },
    ]);

    try {
      let stepPayload: { message?: string } = { message: trimmed };
      for (let step = 0; step < 5; step++) {
        const res = await fetch(`/api/agent/step?${authQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stepPayload),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Could not complete assistant step.");
          if (res.status === 403) setEnabled(false);
          break;
        }
        if (Array.isArray(data.turns)) {
          setTurns(data.turns);
        }
        if (!data.continue || data.pendingAction) {
          break;
        }
        stepPayload = {};
      }
    } catch {
      setErrorMsg("Could not reach Tayyari Planning Assistant.");
    } finally {
      setSending(false);
    }
  }

  async function handleActionDecision(
    turnId: string,
    decision: "confirm" | "dismiss"
  ) {
    setActingTurnId(turnId);
    setErrorMsg(null);
    try {
      const payload =
        decision === "confirm"
          ? { confirmActionTurnId: turnId }
          : { dismissActionTurnId: turnId };
      const res = await fetch(`/api/agent/step?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Could not update action.");
        return;
      }
      if (Array.isArray(data.turns)) {
        setTurns(data.turns);
      }
      if (decision === "confirm") {
        pushToast("Change saved to your event plan.", "success");
        onActionConfirmed?.();
      } else {
        pushToast("Suggested action dismissed.", "info");
      }
    } catch {
      setErrorMsg("Network error while updating action.");
    } finally {
      setActingTurnId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Ask Tayyari Planning Assistant"
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative z-10 mt-auto flex max-h-[88vh] w-full flex-col rounded-t-card border border-border bg-bg shadow-soft sm:mt-0 sm:h-full sm:max-h-screen sm:w-[440px] sm:rounded-none sm:rounded-l-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4 rounded-t-card sm:rounded-tl-card sm:rounded-tr-none">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">
                Ask Tayyari
              </h2>
              <p className="text-xs text-ink-muted">
                {canSeeAmounts
                  ? "Checks tasks, vendors & budget; asks before saving changes"
                  : "Checks tasks & vendors; budget figures hidden for your role"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Planning Assistant"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!enabled ? (
            <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-warning flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Planning Assistant is turned off</p>
                <p className="mt-1">
                  This module is currently disabled by Flagsmith live controls.
                  Your manual pages remain available.
                </p>
              </div>
            </div>
          ) : null}

          {turns.length === 0 && !loadingHistory ? (
            <div className="space-y-3 pt-2">
              <div className="rounded-card border border-border bg-surface p-4 text-sm text-ink-muted">
                <p className="font-medium text-ink">
                  Ask in English, Kannada, or Hindi.
                </p>
                <p className="mt-1">
                  I can inspect your tasks, run sheet, vendor search, NGOs
                  {canSeeAmounts ? ", and budget totals" : ""}. I always ask
                  for your confirmation before saving any change.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={!enabled || sending}
                    onClick={() => void sendMessage(chip)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn) => {
            if (turn.role === "tool") {
              return (
                <div
                  key={turn.id}
                  className="flex items-center gap-2 text-xs text-ink-muted px-2"
                >
                  <Wrench className="h-3.5 w-3.5 text-primary" />
                  <span>{turn.content}</span>
                </div>
              );
            }

            const isUser = turn.role === "user";
            return (
              <div
                key={turn.id}
                className={clsx(
                  "flex flex-col gap-2",
                  isUser ? "items-end" : "items-start"
                )}
              >
                <div
                  className={clsx(
                    "max-w-[88%] rounded-card px-4 py-3 text-sm leading-relaxed indic-leading shadow-sm",
                    isUser
                      ? "bg-primary text-white"
                      : "border border-border bg-surface text-ink"
                  )}
                >
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>

                {turn.pending_action ? (
                  <div className="w-full max-w-[94%] rounded-card border-2 border-accent/60 bg-surface p-4 shadow-soft space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-primary">
                          Proposed Action
                        </div>
                        <div className="mt-0.5 font-semibold text-ink">
                          {turn.pending_action.label}
                        </div>
                      </div>
                      {turn.action_status === "confirmed" ? (
                        <StatusChip label="Confirmed" tone="success" />
                      ) : turn.action_status === "dismissed" ? (
                        <StatusChip label="Dismissed" tone="neutral" />
                      ) : (
                        <StatusChip label="Needs confirmation" tone="accent" />
                      )}
                    </div>

                    <div className="rounded-control bg-bg p-2.5 text-xs text-ink-muted space-y-1">
                      {Object.entries(turn.pending_action.args).map(
                        ([key, val]) => (
                          <div
                            key={key}
                            className="flex items-baseline justify-between gap-3"
                          >
                            <span className="font-medium text-ink">{key}:</span>
                            <span className="text-right break-all">
                              {typeof val === "object" && val !== null
                                ? JSON.stringify(val)
                                : String(val ?? "—")}
                            </span>
                          </div>
                        )
                      )}
                    </div>

                    {turn.action_status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          loading={actingTurnId === turn.id}
                          disabled={actingTurnId !== null}
                          onClick={() =>
                            void handleActionDecision(turn.id, "confirm")
                          }
                        >
                          <Check className="h-4 w-4" />
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={actingTurnId !== null}
                          onClick={() =>
                            void handleActionDecision(turn.id, "dismiss")
                          }
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {sending ? (
            <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-sm text-ink-muted w-fit">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
              <span>Thinking with Sarvam AI...</span>
            </div>
          ) : null}

          {errorMsg ? (
            <div
              role="alert"
              className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-danger"
            >
              {errorMsg}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {/* Footer composer */}
        <div className="border-t border-border bg-surface p-4 space-y-3">
          {showMic ? (
            <VoiceRecorder
              compact
              eventId={eventId}
              token={token}
              languageCode={language}
              onTranscriptConfirmed={(text) => void sendMessage(text)}
            />
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => setShowMic((v) => !v)}
              disabled={!enabled}
              aria-label="Toggle voice input"
              className={clsx(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-control border transition-colors",
                showMic
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-bg text-ink hover:bg-surface-2"
              )}
            >
              <Mic className="h-5 w-5" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!enabled || sending}
              placeholder="Ask Tayyari anything about the plan..."
              className="h-12 flex-1 rounded-control border border-border bg-bg px-3.5 text-base text-ink placeholder:text-ink-muted"
            />

            <Button
              type="submit"
              disabled={!enabled || !input.trim() || sending}
              loading={sending}
              aria-label="Send message"
              className="shrink-0 px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </aside>
    </div>
  );
}
