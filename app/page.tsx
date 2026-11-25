"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { clsx } from "clsx";
import {
  Button,
  Card,
  EventIllustration,
  PlanBadge,
  StatusChip,
} from "@/components/ui/primitives";
import {
  EVENT_TYPES,
  LANGUAGES,
  MEMBER_ROLES,
  type EventType,
  type LanguageCode,
  type MemberRecord,
  type MemberRole,
} from "@/lib/contracts";
import {
  buildAllocatedCategories,
  formatINR,
  STARTER_SPLITS,
} from "@/lib/domain/budget";

interface EventSummary {
  id: string;
  name: string;
  type: EventType;
  city: string;
  area: string;
  event_date: string;
  language: LanguageCode;
  guest_count: number;
  plan: "free" | "pass";
  is_demo: boolean;
}

interface DraftCategory {
  id: string;
  name: string;
  pct: number;
  allocated_inr: number;
}

interface DraftMember {
  id: string;
  display_name: string;
  role: MemberRole;
  preferred_language: LanguageCode;
}

const EVENT_TYPE_META: Record<
  EventType,
  { title: string; subtitle: string; defaultBudget: number; defaultGuests: number }
> = {
  wedding: {
    title: "Wedding",
    subtitle: "Mandap, catering, rituals & family hosts",
    defaultBudget: 600000,
    defaultGuests: 300,
  },
  engagement: {
    title: "Engagement",
    subtitle: "Ring ceremony, lunch & family welcome",
    defaultBudget: 120000,
    defaultGuests: 150,
  },
  birthday: {
    title: "Birthday",
    subtitle: "Cake, snacks, games & return gifts",
    defaultBudget: 35000,
    defaultGuests: 50,
  },
  festival: {
    title: "Festival",
    subtitle: "Puja, prasad, flowers & neighbours",
    defaultBudget: 40000,
    defaultGuests: 80,
  },
  housewarming: {
    title: "Housewarming",
    subtitle: "Griha Pravesh, breakfast & lunch",
    defaultBudget: 75000,
    defaultGuests: 100,
  },
  other: {
    title: "Other gathering",
    subtitle: "Anniversary, naming ceremony or reunion",
    defaultBudget: 50000,
    defaultGuests: 60,
  },
};

function defaultFutureDate(daysAhead = 30): string {
  const dt = new Date(Date.now() + daysAhead * 86400 * 1000);
  return dt.toISOString().slice(0, 10);
}

function buildDraftCategories(type: EventType, budget: number): DraftCategory[] {
  const split = STARTER_SPLITS[type] ?? STARTER_SPLITS.other;
  const allocated = buildAllocatedCategories(type, budget);
  return allocated.map((cat, idx) => ({
    id: `${type}-${idx}`,
    name: cat.name,
    pct: split[idx]?.pct ?? 0,
    allocated_inr: cat.allocated_inr,
  }));
}

export default function LandingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [seeding, setSeeding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [existingEvents, setExistingEvents] = useState<EventSummary[]>([]);

  // Step 1
  const [eventType, setEventType] = useState<EventType>("engagement");

  // Step 2
  const [name, setName] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [area, setArea] = useState("");
  const [eventDate, setEventDate] = useState(defaultFutureDate(30));
  const [guestCount, setGuestCount] = useState(150);
  const [language, setLanguage] = useState<LanguageCode>("en-IN");

  // Step 3
  const [totalBudget, setTotalBudget] = useState(120000);
  const [categories, setCategories] = useState<DraftCategory[]>(() =>
    buildDraftCategories("engagement", 120000)
  );
  const [newCategoryName, setNewCategoryName] = useState("");

  // Step 4
  const [members, setMembers] = useState<DraftMember[]>([
    {
      id: "m-1",
      display_name: "Meera",
      role: "organizer",
      preferred_language: "en-IN",
    },
    {
      id: "m-2",
      display_name: "Aunt Lakshmi",
      role: "decision_owner",
      preferred_language: "kn-IN",
    },
    {
      id: "m-3",
      display_name: "Karthik",
      role: "helper",
      preferred_language: "en-IN",
    },
  ]);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<MemberRole>("helper");

  // Post-submit created event links
  const [createdResult, setCreatedResult] = useState<{
    eventId: string;
    eventName: string;
    organizerUrl: string;
    members: MemberRecord[];
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.events && Array.isArray(data.events)) {
          setExistingEvents(data.events);
        }
      })
      .catch(() => {
        // Ignore on cold load
      });
  }, []);

  const handleSelectEventType = (t: EventType) => {
    setEventType(t);
    const meta = EVENT_TYPE_META[t];
    setTotalBudget(meta.defaultBudget);
    setGuestCount(meta.defaultGuests);
    setCategories(buildDraftCategories(t, meta.defaultBudget));
  };

  const handleBudgetChange = (nextBudget: number) => {
    const safe = Number.isFinite(nextBudget) ? Math.max(0, Math.round(nextBudget)) : 0;
    setTotalBudget(safe);
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        allocated_inr: Math.round((safe * c.pct) / 100),
      }))
    );
  };

  const handleCategoryPctChange = (id: string, pctVal: number) => {
    const pct = Number.isFinite(pctVal) ? Math.max(0, Math.min(100, pctVal)) : 0;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, pct, allocated_inr: Math.round((totalBudget * pct) / 100) }
          : c
      )
    );
  };

  const handleCategoryAmountChange = (id: string, amtVal: number) => {
    const amt = Number.isFinite(amtVal) ? Math.max(0, Math.round(amtVal)) : 0;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              allocated_inr: amt,
              pct: totalBudget > 0 ? Math.round((amt / totalBudget) * 100) : 0,
            }
          : c
      )
    );
  };

  const handleRemoveCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setCategories((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: trimmed,
        pct: 0,
        allocated_inr: 0,
      },
    ]);
    setNewCategoryName("");
  };

  const handleAddMember = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    setMembers((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        display_name: trimmed,
        role: newMemberRole,
        preferred_language: language,
      },
    ]);
    setNewMemberName("");
  };

  const handleRemoveMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleLoadDemo = async () => {
    setSeeding(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.meeraUrl) {
        setErrorMsg(data?.error ?? "Could not load demo event.");
        setSeeding(false);
        return;
      }
      const sep = data.meeraUrl.includes("?") ? "&" : "?";
      router.push(`${data.meeraUrl}${sep}welcome=1`);
    } catch {
      setErrorMsg("Network error while loading demo event.");
      setSeeding(false);
    }
  };

  const handleCreateEvent = async () => {
    setCreating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${EVENT_TYPE_META[eventType].title} Plan`,
          type: eventType,
          city: city.trim() || "Bengaluru",
          area: area.trim(),
          event_date: eventDate,
          language,
          guest_count: Math.max(1, guestCount),
          total_budget_inr: Math.max(0, totalBudget),
          categories: categories.map((c) => ({
            name: c.name,
            allocated_inr: c.allocated_inr,
          })),
          members: members.map((m) => ({
            display_name: m.display_name,
            role: m.role,
            preferred_language: m.preferred_language,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error ?? "Could not create event.");
        setCreating(false);
        return;
      }
      setCreatedResult({
        eventId: data.event.id,
        eventName: data.event.name,
        organizerUrl: data.organizerUrl,
        members: data.members,
      });
    } catch {
      setErrorMsg("Network error while creating your event.");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (memberId: string, token: string, eventId: string) => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/e/${eventId}?t=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(memberId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setErrorMsg("Could not copy automatically — please copy the link manually.");
    }
  };

  const allocatedSum = categories.reduce((s, c) => s + c.allocated_inr, 0);

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Warm Kolam Hero Header */}
      <header className="kolam-pattern border-b border-border bg-surface/80">
        <div className="mx-auto max-w-[1040px] px-4 py-8 sm:py-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>Tayyari · Calm family event planning</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              Plan your family celebration without spreadsheet chaos.
            </h1>
            <p className="text-base text-ink-muted">
              One shared room for budget clarity, tasks, voice change requests in
              English, Kannada, or Hindi, and respectful role privacy.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button
              variant="accent"
              loading={seeding}
              onClick={handleLoadDemo}
              className="w-full sm:w-auto"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Load demo event (Ananya &amp; Rohan)</span>
            </Button>
            <span className="text-xs text-ink-muted text-center">
              Instant walkthrough with seeded Bengaluru engagement
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1040px] px-4 py-8 space-y-8">
        {errorMsg ? (
          <div
            role="alert"
            className="rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-danger"
          >
            {errorMsg}
          </div>
        ) : null}

        {/* Post-Creation Family Links Screen */}
        {createdResult ? (
          <Card className="space-y-6">
            <div className="space-y-2">
              <StatusChip label="Your event room is ready" tone="success" />
              <h2 className="font-display text-2xl font-bold text-ink">
                Share personal links with {createdResult.eventName}
              </h2>
              <p className="text-sm text-ink-muted">
                Each person gets a private link. Organizers and decision owners see
                rupee figures; helpers and viewers only see tasks, timelines, and
                logistics.
              </p>
            </div>

            <div className="space-y-3">
              {createdResult.members.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-bg p-4"
                >
                  <div>
                    <div className="font-semibold text-ink">{m.display_name}</div>
                    <div className="text-xs text-ink-muted">
                      {m.role.replace("_", " ")} ·{" "}
                      {m.can_see_amounts ? "Can see amounts" : "Amounts hidden"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[48px]"
                      onClick={() =>
                        copyLink(m.id, m.access_token, createdResult.eventId)
                      }
                    >
                      {copiedId === m.id ? (
                        <Check className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>{copiedId === m.id ? "Copied" : "Copy link"}</span>
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-[48px]"
                      onClick={() =>
                        router.push(
                          `/e/${createdResult.eventId}?t=${encodeURIComponent(
                            m.access_token
                          )}&welcome=1`
                        )
                      }
                    >
                      <span>Open as {m.display_name}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setCreatedResult(null);
                  setStep(1);
                }}
              >
                Create another event
              </Button>
              <Button
                variant="primary"
                onClick={() => router.push(`${createdResult.organizerUrl}&welcome=1`)}
              >
                <span>Open Event Room</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </Card>
        ) : (
          /* 4-Step Onboarding Wizard */
          <Card className="space-y-6">
            {/* Progress Dots */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Step {step} of 4
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
                  {step === 1 && "What are you planning together?"}
                  {step === 2 && "Tell us the basics"}
                  {step === 3 && "Set your budget & category split"}
                  {step === 4 && "Invite family & assign roles"}
                </h2>
              </div>

              <div className="flex items-center gap-1" aria-label={`Step ${step} of 4`}>
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={n >= step}
                    onClick={() => {
                      if (n < step) setStep(n as 1 | 2 | 3 | 4);
                    }}
                    aria-label={`Step ${n}`}
                    className="flex min-h-[48px] min-w-[28px] items-center justify-center px-1 disabled:cursor-default"
                  >
                    <span
                      className={clsx(
                        "h-3 rounded-full transition-all",
                        n === step
                          ? "w-8 bg-primary"
                          : n < step
                          ? "w-3 bg-accent cursor-pointer"
                          : "w-3 bg-border"
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Step 1: Event Type */}
            {step === 1 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {EVENT_TYPES.map((t) => {
                    const meta = EVENT_TYPE_META[t];
                    const selected = eventType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleSelectEventType(t)}
                        className={clsx(
                          "flex min-h-[104px] items-center gap-4 rounded-card border p-4 text-left transition-all",
                          selected
                            ? "border-primary bg-surface-2 ring-2 ring-primary"
                            : "border-border bg-bg hover:bg-surface-2/60"
                        )}
                      >
                        <EventIllustration type={t} className="shrink-0" />
                        <div>
                          <div className="font-display text-lg font-bold text-ink">
                            {meta.title}
                          </div>
                          <div className="text-xs text-ink-muted">{meta.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <Button variant="primary" onClick={() => setStep(2)}>
                    <span>Continue</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Step 2: Event Basics */}
            {step === 2 ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-sm font-semibold text-ink">Event name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`e.g. Priya & Karthik ${EVENT_TYPE_META[eventType].title}`}
                      className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-base text-ink"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold text-ink">City</span>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Bengaluru"
                      className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-base text-ink"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold text-ink">
                      Area / Neighbourhood (optional)
                    </span>
                    <input
                      type="text"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      placeholder="Jayanagar"
                      className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-base text-ink"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold text-ink">Event date</span>
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-base text-ink"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold text-ink">
                      Approximate guests
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={guestCount}
                      onChange={(e) =>
                        setGuestCount(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-base text-ink tabular-nums"
                    />
                  </label>

                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-sm font-semibold text-ink">
                      Preferred language
                    </span>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                      className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-base text-ink"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l === "en-IN"
                            ? "English (India)"
                            : l === "kn-IN"
                            ? "ಕನ್ನಡ (Kannada)"
                            : "हिन्दी (Hindi)"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Back</span>
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (!name.trim()) {
                        setName(`Family ${EVENT_TYPE_META[eventType].title}`);
                      }
                      setStep(3);
                    }}
                  >
                    <span>Next: Budget split</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Step 3: Total Budget & Suggested Split */}
            {step === 3 ? (
              <div className="space-y-5">
                <div className="rounded-control border border-border bg-surface-2/50 p-4 space-y-2">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-ink">
                      Total budget (INR)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={totalBudget}
                      onChange={(e) => handleBudgetChange(Number(e.target.value))}
                      className="min-h-[48px] w-full rounded-control border border-border bg-surface px-3.5 text-lg font-bold text-ink tabular-nums"
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted tabular-nums">
                    <span>
                      Suggested split for {EVENT_TYPE_META[eventType].title} (no
                      unrequested contingency added).
                    </span>
                    <span>
                      Allocated:{" "}
                      <strong
                        className={
                          allocatedSum > totalBudget ? "text-danger" : "text-ink"
                        }
                      >
                        {formatINR(allocatedSum)}
                      </strong>{" "}
                      of {formatINR(totalBudget)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-bg p-3"
                    >
                      <div className="min-w-[140px] flex-1 font-semibold text-ink">
                        {cat.name}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <span>%</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={cat.pct}
                          onChange={(e) =>
                            handleCategoryPctChange(cat.id, Number(e.target.value))
                          }
                          aria-label={`${cat.name} percentage`}
                          className="min-h-[48px] w-20 rounded-control border border-border bg-surface px-2.5 text-sm font-semibold text-ink tabular-nums"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <span>₹</span>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          value={cat.allocated_inr}
                          onChange={(e) =>
                            handleCategoryAmountChange(cat.id, Number(e.target.value))
                          }
                          aria-label={`${cat.name} amount in INR`}
                          className="min-h-[48px] w-32 rounded-control border border-border bg-surface px-2.5 text-sm font-semibold text-ink tabular-nums"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(cat.id)}
                        aria-label={`Remove ${cat.name}`}
                        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Add custom category (e.g. Music)"
                    className="min-h-[48px] flex-1 min-w-[200px] rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
                  />
                  <Button variant="secondary" onClick={handleAddCategory}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>Add category</span>
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Back</span>
                  </Button>
                  <Button variant="primary" onClick={() => setStep(4)}>
                    <span>Next: Invite family</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Step 4: Invite Family */}
            {step === 4 ? (
              <div className="space-y-5">
                <p className="text-sm text-ink-muted">
                  Choose who sees rupee amounts: <strong>Organizers</strong> and{" "}
                  <strong>Decision Owners</strong> see amounts;{" "}
                  <strong>Helpers</strong> and <strong>Viewers</strong> have amounts
                  redacted on the server.
                </p>

                <div className="space-y-2.5">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-bg p-3"
                    >
                      <input
                        type="text"
                        value={m.display_name}
                        onChange={(e) =>
                          setMembers((prev) =>
                            prev.map((x) =>
                              x.id === m.id
                                ? { ...x, display_name: e.target.value }
                                : x
                            )
                          )
                        }
                        aria-label="Member name"
                        className="min-h-[48px] flex-1 min-w-[160px] rounded-control border border-border bg-surface px-3 text-sm font-semibold text-ink"
                      />
                      <select
                        value={m.role}
                        onChange={(e) =>
                          setMembers((prev) =>
                            prev.map((x) =>
                              x.id === m.id
                                ? { ...x, role: e.target.value as MemberRole }
                                : x
                            )
                          )
                        }
                        aria-label={`Role for ${m.display_name}`}
                        className="min-h-[48px] rounded-control border border-border bg-surface px-3 text-sm text-ink"
                      >
                        {MEMBER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r === "decision_owner"
                              ? "Decision Owner (sees amounts)"
                              : r === "organizer"
                              ? "Organizer (sees amounts)"
                              : r === "helper"
                              ? "Helper (amounts hidden)"
                              : "Viewer (amounts hidden)"}
                          </option>
                        ))}
                      </select>
                      {members.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id)}
                          aria-label={`Remove ${m.display_name}`}
                          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-control text-ink-muted hover:bg-surface-2 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Add family member name"
                    className="min-h-[48px] flex-1 min-w-[180px] rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
                  />
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as MemberRole)}
                    aria-label="New member role"
                    className="min-h-[48px] rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  >
                    {MEMBER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" onClick={handleAddMember}>
                    <Users className="h-4 w-4" aria-hidden="true" />
                    <span>Add member</span>
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setStep(3)}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Back</span>
                  </Button>
                  <Button
                    variant="primary"
                    loading={creating}
                    onClick={handleCreateEvent}
                  >
                    <span>Create Event Room</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {/* Existing Events Section (if any) */}
        {existingEvents.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold text-ink marigold-underline">
              Recent events in this workspace
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {existingEvents.map((ev) => (
                <Card key={ev.id} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <EventIllustration type={ev.type} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink truncate">
                          {ev.name}
                        </span>
                        <PlanBadge plan={ev.plan} />
                      </div>
                      <div className="text-xs text-ink-muted tabular-nums">
                        {ev.city} · {ev.event_date} · {ev.guest_count} guests
                      </div>
                    </div>
                  </div>
                  {ev.is_demo ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[48px] shrink-0"
                      loading={seeding}
                      onClick={handleLoadDemo}
                    >
                      Open Demo
                    </Button>
                  ) : (
                    <StatusChip label="Private link" tone="info" />
                  )}
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* Clear Privacy Notice */}
        <Card className="bg-surface-2/40 space-y-3">
          <div className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>Family privacy &amp; data control</span>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm text-ink-muted sm:grid-cols-3">
            <div>
              <strong className="text-ink block">What is stored</strong>
              Event dates, category budgets, expense quotes, task assignments,
              guest counts, and draft WhatsApp messages.
            </div>
            <div>
              <strong className="text-ink block">Who can see amounts</strong>
              Only Organizers and Decision Owners receive rupee totals. Helpers
              and Viewers have all amounts stripped on the server.
            </div>
            <div>
              <strong className="text-ink block">How to delete an event</strong>
              The Organizer can permanently delete an event and all associated
              records anytime from the Event Home page.
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
