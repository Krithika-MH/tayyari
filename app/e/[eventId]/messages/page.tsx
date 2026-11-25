"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Languages,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  Printer,
  Share2,
  Sparkles,
  UserCheck,
  Volume2,
} from "lucide-react";
import { clsx } from "clsx";
import {
  MESSAGE_RECIPIENT_TYPES,
  type LanguageCode,
  type MessageRecipientType,
  type MessageRecord,
} from "@/lib/contracts";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  EmptyState,
  LanguageToggle,
  Skeleton,
  StatusChip,
  useToast,
} from "@/components/ui/primitives";
import { PageGuide } from "@/components/ui/PageGuide";

const RECIPIENT_LABELS: Record<MessageRecipientType, string> = {
  vendor: "Vendor",
  relative: "Relative / Guest",
  helper: "Family Helper",
  ngo: "Food NGO",
};

const QUICK_PURPOSES = [
  "Confirm arrival time and setup checklist",
  "Share event-day schedule and venue pin",
  "Confirm final guest headcount",
  "Enquire about leftover food pickup today",
];

function parseTimeLabelMinutes(label: string | null): number {
  if (!label) return 24 * 60;
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 23 * 60;
  let hours = Number(m[1]);
  const mins = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

export default function MessagesPage() {
  const { eventId, token, event, member, members, tasks, lang, loading } =
    useEventContext();
  const { pushToast } = useToast();

  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);

  // Composer state
  const [toType, setToType] = useState<MessageRecipientType>("vendor");
  const [toName, setToName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [draftLang, setDraftLang] = useState<LanguageCode>(lang || "en-IN");
  const [drafting, setDrafting] = useState(false);

  // Inline edits & TTS state
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const authQuery = `eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`;
  const canEdit = member?.role !== "viewer";

  useEffect(() => {
    setDraftLang(lang);
  }, [lang]);

  const loadMessages = useCallback(async () => {
    if (!eventId || !token) return;
    try {
      const res = await fetch(`/api/messages?${authQuery}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const list: MessageRecord[] = Array.isArray(data.messages)
          ? data.messages
          : [];
        setMessages(list);
        setEditedBodies((prev) => {
          const next = { ...prev };
          for (const m of list) {
            if (next[m.id] === undefined) next[m.id] = m.body;
          }
          return next;
        });
      }
    } finally {
      setLoadingMsgs(false);
    }
  }, [authQuery, eventId, token]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const memberNameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.display_name])),
    [members]
  );

  const runSheetTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const dateCmp = a.due_date.localeCompare(b.due_date);
      if (dateCmp !== 0) return dateCmp;
      return (
        parseTimeLabelMinutes(a.time_label) -
        parseTimeLabelMinutes(b.time_label)
      );
    });
  }, [tasks]);

  const shareUrl = useMemo(() => {
    const path = `/share/${eventId}?s=runsheet`;
    if (typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return path;
  }, [eventId]);

  async function handleDraftMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setDrafting(true);
    try {
      const res = await fetch(`/api/messages?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_type: toType,
          to_name: toName.trim(),
          purpose: purpose.trim(),
          language: draftLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not draft message.", "error");
        return;
      }
      pushToast("Message prepared! Review and open in WhatsApp to send.", "success");
      setToName("");
      setPurpose("");
      await loadMessages();
    } catch {
      pushToast("Network error while drafting message.", "error");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSaveEdit(msg: MessageRecord) {
    if (!canEdit) return;
    const body = (editedBodies[msg.id] ?? msg.body).trim();
    if (!body) return;
    setSavingId(msg.id);
    try {
      const res = await fetch(`/api/messages?${authQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id, body }),
      });
      if (!res.ok) {
        pushToast("Could not save changes.", "error");
        return;
      }
      pushToast("Draft updated.", "success");
      await loadMessages();
    } finally {
      setSavingId(null);
    }
  }

  async function handleCopyMessage(msg: MessageRecord) {
    const body = editedBodies[msg.id] ?? msg.body;
    try {
      await navigator.clipboard.writeText(body);
      pushToast("Copied message text.", "success");
      if (canEdit) {
        await fetch(`/api/messages?${authQuery}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: msg.id, status: "copied" }),
        });
        await loadMessages();
      }
    } catch {
      pushToast("Could not copy automatically — please select and copy.", "info");
    }
  }

  async function handleMarkShared(msg: MessageRecord) {
    if (!canEdit) return;
    await fetch(`/api/messages?${authQuery}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msg.id, status: "shared" }),
    });
    await loadMessages();
  }

  async function handleListen(msg: MessageRecord) {
    const body = (editedBodies[msg.id] ?? msg.body).trim();
    if (!body) return;
    setSpeakingId(msg.id);
    try {
      const res = await fetch(`/api/tts?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: body.slice(0, 500),
          language_code: msg.language,
        }),
      });
      if (!res.ok) {
        pushToast("Voice playback is unavailable right now.", "info");
        return;
      }
      const data = await res.json();
      if (!data.audioBase64) {
        pushToast("No audio returned for this message.", "info");
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(
        `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`
      );
      audioRef.current = audio;
      await audio.play();
    } catch {
      pushToast("Could not play voice preview.", "info");
    } finally {
      setSpeakingId(null);
    }
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      pushToast("Copied read-only Run Sheet share link.", "success");
    } catch {
      pushToast("Could not copy link automatically.", "info");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink marigold-underline">
              Messages &amp; Run Sheet
            </h1>
            <PageGuide
              title="Messages & Run Sheet"
              summary="Draft polite updates in Kannada, Hindi, or English with Sarvam AI, listen aloud, and share a money-free run sheet."
              steps={[
                "Pick recipient type (Vendor, Relative, Helper, NGO), purpose, and language to generate an editable draft.",
                "Edit the text, press 'Listen' for Sarvam TTS playback, or click 'Open in WhatsApp' to send it yourself.",
                "Copy the public Run Sheet link or print the event-day schedule — zero rupee amounts are included.",
              ]}
              note="Messages are always marked 'Prepared' until you personally send them in WhatsApp."
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Prepare polite Kannada, Hindi, or English messages for WhatsApp and
            share a clean, money-free event-day run sheet.
          </p>
        </div>
      </div>

      {/* Section 1: Message Composer (hidden on print) */}
      <div className="no-print grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-ink">
              Prepare a message
            </h2>
          </div>

          <form onSubmit={handleDraftMessage} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Recipient type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MESSAGE_RECIPIENT_TYPES.map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setToType(rt)}
                    className={clsx(
                      "min-h-[40px] rounded-control border px-3 text-xs font-semibold transition-colors",
                      toType === rt
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-bg text-ink hover:bg-surface-2"
                    )}
                  >
                    {RECIPIENT_LABELS[rt]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Recipient name
              </label>
              <input
                type="text"
                required
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="e.g. Sri Lakshmi Catering / Ramesh Mama"
                className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Purpose
              </label>
              <textarea
                rows={2}
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="What do you want to coordinate?"
                className="w-full rounded-control border border-border bg-bg p-3 text-sm text-ink"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_PURPOSES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className="rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-2"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Languages className="h-4 w-4 text-primary" />
                Draft language
              </span>
              <LanguageToggle value={draftLang} onChange={setDraftLang} />
            </div>

            <Button
              type="submit"
              disabled={!canEdit}
              loading={drafting}
              className="w-full"
            >
              <Sparkles className="h-4 w-4" />
              Draft with Sarvam AI
            </Button>

            <p className="text-[11px] text-ink-muted">
              Tayyari prepares message text using verified event facts only. You
              always review and send it yourself on WhatsApp.
            </p>
          </form>
        </Card>

        {/* Prepared Message Drafts */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              Prepared drafts ({messages.length})
            </h2>
            <span className="text-xs text-ink-muted">
              Always labelled Prepared (never Sent automatically)
            </span>
          </div>

          {loadingMsgs ? (
            <Skeleton className="h-44 w-full" />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-6 w-6" />}
              title="No prepared messages yet"
              description="Use the composer on the left to draft a polite Kannada, Hindi, or English message for vendors, relatives, or helpers."
            />
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => {
                const currentBody = editedBodies[msg.id] ?? msg.body;
                const isDirty = currentBody.trim() !== msg.body.trim();
                const statusLabel =
                  msg.status === "copied"
                    ? "Prepared — Copied"
                    : msg.status === "shared"
                    ? "Prepared — Opened in WhatsApp"
                    : "Prepared (open WhatsApp to send)";

                return (
                  <Card key={msg.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wide text-primary">
                          {RECIPIENT_LABELS[msg.to_type]} · {msg.language}
                        </span>
                        <h3 className="font-semibold text-ink">
                          To: {msg.to_name}
                        </h3>
                        <p className="text-xs text-ink-muted">{msg.purpose}</p>
                      </div>
                      <StatusChip
                        label={statusLabel}
                        tone={msg.status === "prepared" ? "info" : "success"}
                      />
                    </div>

                    <textarea
                      rows={3}
                      value={currentBody}
                      readOnly={!canEdit}
                      onChange={(e) =>
                        setEditedBodies((prev) => ({
                          ...prev,
                          [msg.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-control border border-border bg-bg p-3 text-sm text-ink indic-leading"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit && isDirty ? (
                        <Button
                          size="sm"
                          loading={savingId === msg.id}
                          onClick={() => void handleSaveEdit(msg)}
                        >
                          <Check className="h-4 w-4" />
                          Save edit
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleCopyMessage(msg)}
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        loading={speakingId === msg.id}
                        onClick={() => void handleListen(msg)}
                      >
                        <Volume2 className="h-4 w-4" />
                        Listen
                      </Button>

                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          currentBody
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void handleMarkShared(msg)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-control bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Open in WhatsApp
                      </a>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Time-Ordered Run Sheet (Printable + Shareable) */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold text-ink">
                Event Run Sheet — {event?.name}
              </h2>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {event?.event_date} ·{" "}
              {event?.area ? `${event.area}, ${event.city}` : event?.city} ·{" "}
              {event?.guest_count} guests · Read-only schedule (zero budget
              amounts)
            </p>
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleCopyShareLink()}
            >
              <Share2 className="h-4 w-4" />
              Copy share link
            </Button>
            <a
              href={`/share/${eventId}?s=runsheet`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-control border border-border bg-surface px-3.5 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open share view
            </a>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print run sheet
            </Button>
          </div>
        </div>

        <div className="no-print rounded-control bg-bg px-3 py-2 text-xs text-ink-muted flex flex-wrap items-center justify-between gap-2 border border-border">
          <span className="truncate">
            Public-safe share link: <strong className="text-ink">{shareUrl}</strong>
          </span>
          <span>Contains zero rupee figures</span>
        </div>

        {runSheetTasks.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">
            No tasks scheduled yet. Add tasks on the Plan page to populate the
            run sheet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {runSheetTasks.map((t) => {
              const ownerName = t.owner_id
                ? memberNameById.get(t.owner_id) ?? "Unassigned"
                : "Unassigned";
              return (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold tabular-nums text-ink">
                        {t.due_date}
                        {t.time_label ? ` · ${t.time_label}` : ""}
                      </span>
                      <span className="font-semibold text-ink">{t.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted pl-1">
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="h-3.5 w-3.5" />
                        Owner: {ownerName}
                      </span>
                      {t.location_label ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {t.location_label}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <StatusChip
                    label={t.status}
                    tone={
                      t.status === "completed"
                        ? "success"
                        : t.status === "accepted"
                        ? "info"
                        : t.status === "declined"
                        ? "danger"
                        : "neutral"
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
