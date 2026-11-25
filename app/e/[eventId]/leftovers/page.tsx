"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Utensils,
} from "lucide-react";
import { clsx } from "clsx";
import type { LeftoverRecord, PlaceCandidate } from "@/lib/contracts";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusChip,
  useToast,
} from "@/components/ui/primitives";

const SAFETY_BANNER =
  "Plan who will help before guests leave. An organisation must confirm it can collect and judge safety. This app does not certify any food as safe.";

const DISPOSAL_GUIDANCE =
  "If no one can collect, follow the caterer's safe disposal procedure.";

function getTrackerStep(status: LeftoverRecord["status"]): number {
  switch (status) {
    case "logged":
    case "outreach_pending_approval":
      return 1;
    case "outreach_approved":
      return 2;
    case "contacted":
    case "accepted":
    case "declined":
      return 3;
    case "collected":
    case "not_collected":
      return 4;
  }
}

function buildNgoEnquiryDraft(
  item: LeftoverRecord,
  eventName: string,
  city: string
): string {
  return `Namaste ${item.ngo_name || "team"}, we are calling from ${eventName} in ${item.pickup_location || city}. We have approx. ${item.approx_portions} portions of ${item.food_type} (served at ${item.served_at}, storage: ${item.storage_notes || "unknown"}, allergens: ${item.allergen_notes || "unknown"}). Could you confirm if your organisation is able to collect and assess this food today?`;
}

export default function LeftoversPage() {
  const { eventId, token, event, member, flags, loading, refreshEvent } =
    useEventContext();
  const { pushToast } = useToast();

  const [leftovers, setLeftovers] = useState<LeftoverRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Form state
  const [foodType, setFoodType] = useState("");
  const [approxPortions, setApproxPortions] = useState("25");
  const [servedAt, setServedAt] = useState("");
  const [storageNotes, setStorageNotes] = useState("unknown");
  const [allergenNotes, setAllergenNotes] = useState("unknown");
  const [pickupLocation, setPickupLocation] = useState("");
  const [selectedNgo, setSelectedNgo] = useState<PlaceCandidate | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);

  // NGO Finder state
  const [ngoArea, setNgoArea] = useState("");
  const [searchingNgos, setSearchingNgos] = useState(false);
  const [ngoResults, setNgoResults] = useState<PlaceCandidate[]>([]);
  const [ngoFallbackUsed, setNgoFallbackUsed] = useState(false);
  const [ngoMapsUrl, setNgoMapsUrl] = useState<string | null>(null);

  // Action loading
  const [submittingApprovalId, setSubmittingApprovalId] = useState<string | null>(
    null
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [draftedMessageById, setDraftedMessageById] = useState<
    Record<string, string>
  >({});

  const authQuery = `eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`;
  const canEdit = member?.role !== "viewer";
  const moduleEnabled = flags?.module_leftover_food !== false;

  useEffect(() => {
    if (event) {
      if (!pickupLocation) {
        setPickupLocation(
          event.area ? `${event.area}, ${event.city}` : event.city
        );
      }
      if (!ngoArea && event.area) {
        setNgoArea(event.area);
      }
    }
  }, [event, pickupLocation, ngoArea]);

  const loadLeftovers = useCallback(async () => {
    if (!eventId || !token) return;
    try {
      const res = await fetch(`/api/leftovers?${authQuery}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setLeftovers(Array.isArray(data.leftovers) ? data.leftovers : []);
      }
    } finally {
      setLoadingList(false);
    }
  }, [authQuery, eventId, token]);

  useEffect(() => {
    void loadLeftovers();
  }, [loadLeftovers]);

  // Poll every 3s while any item is waiting for NudgeBee approval
  const hasPendingApproval = leftovers.some(
    (l) => l.status === "outreach_pending_approval"
  );

  useEffect(() => {
    if (!hasPendingApproval) return;
    const interval = setInterval(() => {
      void loadLeftovers();
    }, 3000);
    return () => clearInterval(interval);
  }, [hasPendingApproval, loadLeftovers]);

  async function handleSearchNgos(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!moduleEnabled) return;
    setSearchingNgos(true);
    try {
      const res = await fetch(`/api/leftovers/ngos?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: ngoArea.trim() || event?.area || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not search food organisations.", "error");
        return;
      }
      setNgoResults(Array.isArray(data.results) ? data.results : []);
      setNgoFallbackUsed(Boolean(data.fallbackUsed));
      setNgoMapsUrl(data.mapsSearchUrl ?? null);
    } catch {
      pushToast("Network error while searching organisations.", "error");
    } finally {
      setSearchingNgos(false);
    }
  }

  async function handleLogLeftover(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !moduleEnabled) return;
    const portionsNum = Number(approxPortions);
    if (!Number.isInteger(portionsNum) || portionsNum <= 0) {
      pushToast("Enter an approximate portion count greater than 0.", "error");
      return;
    }

    setSubmittingForm(true);
    try {
      const res = await fetch(`/api/leftovers?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_type: foodType.trim(),
          approx_portions: portionsNum,
          served_at: servedAt.trim() || "unknown",
          storage_notes: storageNotes.trim() || "unknown",
          allergen_notes: allergenNotes.trim() || "unknown",
          pickup_location: pickupLocation.trim(),
          ngo_place_id: selectedNgo?.place_id ?? null,
          ngo_name: selectedNgo?.name ?? null,
          ngo_phone: selectedNgo?.phone ?? null,
          ngo_maps_url: selectedNgo?.maps_url ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not log leftover food.", "error");
        return;
      }
      pushToast("Leftover food plan logged.", "success");
      setFoodType("");
      setServedAt("");
      setStorageNotes("unknown");
      setAllergenNotes("unknown");
      await loadLeftovers();
      await refreshEvent();
    } catch {
      pushToast("Network error while logging leftovers.", "error");
    } finally {
      setSubmittingForm(false);
    }
  }

  async function handleSubmitForApproval(leftoverId: string) {
    if (!canEdit) return;
    setSubmittingApprovalId(leftoverId);
    try {
      const res = await fetch(
        `/api/leftovers/${encodeURIComponent(leftoverId)}/submit?${authQuery}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(
          data.error || "Could not send outreach request to NudgeBee.",
          "error"
        );
        return;
      }
      pushToast(
        "Outreach approval requested in NudgeBee. Polling for decision...",
        "info"
      );
      await loadLeftovers();
      await refreshEvent();
    } catch {
      pushToast("Network error while requesting approval.", "error");
    } finally {
      setSubmittingApprovalId(null);
    }
  }

  async function handleStatusUpdate(
    leftoverId: string,
    status: "contacted" | "accepted" | "declined" | "collected" | "not_collected"
  ) {
    if (!canEdit) return;
    setUpdatingId(leftoverId);
    try {
      const res = await fetch(`/api/leftovers?${authQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leftoverId, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not update outreach status.", "error");
        return;
      }
      pushToast(`Marked as ${status.replace("_", " ")}.`, "success");
      await loadLeftovers();
      await refreshEvent();
    } catch {
      pushToast("Network error while updating status.", "error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handlePrepareNgoMessage(item: LeftoverRecord) {
    try {
      const res = await fetch(`/api/messages?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_type: "ngo",
          to_name: item.ngo_name || "Food Donation Organisation",
          purpose: `Leftover food pickup enquiry (${item.approx_portions} portions of ${item.food_type}, served at ${item.served_at}, pickup at ${item.pickup_location})`,
          language: event?.language ?? "en-IN",
        }),
      });
      const data = await res.json();
      if (res.ok && data.message?.body) {
        setDraftedMessageById((prev) => ({
          ...prev,
          [item.id]: data.message.body,
        }));
        pushToast("Enquiry message prepared (also saved in Messages).", "success");
      } else {
        setDraftedMessageById((prev) => ({
          ...prev,
          [item.id]: buildNgoEnquiryDraft(
            item,
            event?.name ?? "our family event",
            event?.city ?? ""
          ),
        }));
      }
    } catch {
      setDraftedMessageById((prev) => ({
        ...prev,
        [item.id]: buildNgoEnquiryDraft(
          item,
          event?.name ?? "our family event",
          event?.city ?? ""
        ),
      }));
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink marigold-underline">
          Leftover Food &amp; NGO Outreach
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Coordinate surplus food thoughtfully with family approval before
          contacting any local food organisation.
        </p>
      </div>

      {/* Calm Safety Panel */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-card border border-amber-300 bg-surface-2 p-4 text-sm text-ink"
      >
        <ShieldAlert className="h-5 w-5 shrink-0 text-warning mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Food safety &amp; responsibility notice</p>
          <p className="text-ink-muted">{SAFETY_BANNER}</p>
        </div>
      </div>

      {!moduleEnabled ? (
        <EmptyState
          icon={<HeartHandshake className="h-6 w-6" />}
          title="Leftover Food Outreach is turned off"
          description="This module is currently disabled by Flagsmith live controls for this event."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Log Surplus Food Form */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Utensils className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-semibold text-ink">
                Plan or log surplus food
              </h2>
            </div>

            <form onSubmit={handleLogLeftover} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">
                  Food items
                </label>
                <input
                  type="text"
                  required
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  placeholder="e.g. Veg pulao, sambar, gulab jamun"
                  className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">
                    Approx. portions
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={approxPortions}
                    onChange={(e) => setApproxPortions(e.target.value)}
                    className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">
                    Served at (time)
                  </label>
                  <input
                    type="text"
                    required
                    value={servedAt}
                    onChange={(e) => setServedAt(e.target.value)}
                    placeholder="e.g. 2:00 PM or unknown"
                    className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">
                    Storage notes (keep &ldquo;unknown&rdquo; if unsure)
                  </label>
                  <input
                    type="text"
                    value={storageNotes}
                    onChange={(e) => setStorageNotes(e.target.value)}
                    placeholder="unknown"
                    className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">
                    Allergen notes
                  </label>
                  <input
                    type="text"
                    value={allergenNotes}
                    onChange={(e) => setAllergenNotes(e.target.value)}
                    placeholder="unknown"
                    className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">
                  Pickup location
                </label>
                <input
                  type="text"
                  required
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  placeholder="Hall address or landmark"
                  className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
                />
              </div>

              {selectedNgo ? (
                <div className="flex items-center justify-between gap-2 rounded-control border border-primary/30 bg-surface-2/60 p-3 text-xs">
                  <div>
                    <div className="font-semibold text-ink">
                      Selected organisation: {selectedNgo.name}
                    </div>
                    <div className="text-ink-muted">{selectedNgo.address}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNgo(null)}
                    className="font-semibold text-danger hover:underline"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="text-xs text-ink-muted">
                  Optional: pick a nearby organisation on the right before
                  logging.
                </p>
              )}

              <Button
                type="submit"
                disabled={!canEdit}
                loading={submittingForm}
                className="w-full"
              >
                Log surplus food plan
              </Button>
            </form>
          </Card>

          {/* Right: NGO Finder */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-ink">
                Find nearby food organisations
              </h2>
              <StatusChip label="Unverified listings" tone="warning" />
            </div>

            <form onSubmit={handleSearchNgos} className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted" />
                <input
                  type="text"
                  value={ngoArea}
                  onChange={(e) => setNgoArea(e.target.value)}
                  placeholder={`Area in ${event?.city ?? "city"}`}
                  className="h-11 w-full rounded-control border border-border bg-bg pl-9 pr-3 text-sm text-ink"
                />
              </div>
              <Button type="submit" size="sm" loading={searchingNgos}>
                <Search className="h-4 w-4" />
                Search
              </Button>
            </form>

            {ngoFallbackUsed ? (
              <div className="rounded-control border border-amber-300 bg-amber-50 p-3 text-xs text-warning space-y-1">
                <div>
                  <strong>Sample listings, not real organisations.</strong>{" "}
                  Use Google Maps to find active local shelters today.
                </div>
                {ngoMapsUrl ? (
                  <a
                    href={ngoMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary underline"
                  >
                    Open Google Maps search
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {ngoResults.length === 0 ? (
                <p className="text-sm text-ink-muted py-4">
                  Click Search to list nearby community kitchens, food banks, or
                  shelters in {ngoArea || event?.city}.
                </p>
              ) : (
                ngoResults.map((ngo) => {
                  const isSelected = selectedNgo?.place_id === ngo.place_id;
                  return (
                    <div
                      key={ngo.place_id}
                      className={clsx(
                        "rounded-control border p-3.5 space-y-2",
                        isSelected
                          ? "border-primary bg-surface-2/50"
                          : "border-border bg-bg"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-ink">
                          {ngo.name}
                        </div>
                        <Button
                          size="sm"
                          variant={isSelected ? "primary" : "secondary"}
                          onClick={() => setSelectedNgo(ngo)}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </Button>
                      </div>
                      <p className="text-xs text-ink-muted">{ngo.address}</p>
                      <p className="text-xs font-medium text-warning">
                        Unverified listing. Contact to confirm they can accept
                        food today.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {ngo.phone ? (
                          <span className="font-medium text-ink">
                            Phone: {ngo.phone}
                          </span>
                        ) : null}
                        <a
                          href={ngo.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-primary underline"
                        >
                          Open in Maps
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Logged Leftovers & 4-Step Outreach Tracker */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            Outreach Tracker
          </h2>
          {hasPendingApproval ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadLeftovers()}
            >
              <RefreshCw className="h-4 w-4" />
              Checking NudgeBee every 3s
            </Button>
          ) : null}
        </div>

        {loadingList ? (
          <Skeleton className="h-40 w-full" />
        ) : leftovers.length === 0 ? (
          <EmptyState
            icon={<HeartHandshake className="h-6 w-6" />}
            title="No surplus food plans logged yet"
            description="Log an estimate before guests leave so the family decision owner can approve outreach calmly if needed."
          />
        ) : (
          <div className="space-y-4">
            {leftovers.map((item) => {
              const step = getTrackerStep(item.status);
              const approvedOrLater =
                item.status !== "logged" &&
                item.status !== "outreach_pending_approval";
              const enquiryText =
                draftedMessageById[item.id] ??
                buildNgoEnquiryDraft(
                  item,
                  event?.name ?? "our event",
                  event?.city ?? ""
                );

              return (
                <Card key={item.id} className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-ink">
                        {item.food_type} ({item.approx_portions} portions)
                      </h3>
                      <p className="text-sm text-ink-muted">
                        Served at: {item.served_at} · Storage:{" "}
                        {item.storage_notes} · Allergens:{" "}
                        {item.allergen_notes || "unknown"}
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        Pickup: {item.pickup_location}
                        {item.ngo_name ? ` · NGO: ${item.ngo_name}` : ""}
                      </p>
                    </div>

                    <StatusChip
                      label={item.status.replace(/_/g, " ")}
                      tone={
                        item.status === "collected" ||
                        item.status === "accepted" ||
                        item.status === "outreach_approved"
                          ? "success"
                          : item.status === "declined" ||
                            item.status === "not_collected"
                          ? "warning"
                          : item.status === "outreach_pending_approval"
                          ? "info"
                          : "neutral"
                      }
                    />
                  </div>

                  {/* 4-step tracker */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { num: 1, label: "Logged" },
                      { num: 2, label: "Approved to contact" },
                      { num: 3, label: "Contacted" },
                      { num: 4, label: "Collected or not collected" },
                    ].map((s) => {
                      const active = step >= s.num;
                      return (
                        <div
                          key={s.num}
                          className={clsx(
                            "flex items-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold",
                            active
                              ? "border-primary/40 bg-surface-2/70 text-ink"
                              : "border-border bg-bg text-ink-muted"
                          )}
                        >
                          {active ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Clock className="h-4 w-4 shrink-0 text-ink-muted" />
                          )}
                          <span>
                            {s.num}. {s.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Step 1 -> Submit to NudgeBee */}
                  {item.status === "logged" && canEdit && moduleEnabled ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-bg p-3 border border-border">
                      <span className="text-xs text-ink-muted">
                        Outreach requires family approval in NudgeBee before
                        contacting the organisation.
                      </span>
                      <Button
                        size="sm"
                        loading={submittingApprovalId === item.id}
                        onClick={() => void handleSubmitForApproval(item.id)}
                      >
                        <Send className="h-4 w-4" />
                        Request approval to contact NGO
                      </Button>
                    </div>
                  ) : null}

                  {/* Step 2 -> Waiting for NudgeBee */}
                  {item.status === "outreach_pending_approval" ? (
                    <div className="flex items-center gap-2 rounded-control border border-blue-200 bg-blue-50 p-3 text-sm text-info">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        Waiting for family approval in NudgeBee (checking every
                        3s)...
                      </span>
                    </div>
                  ) : null}

                  {/* Step 3+ -> Approved: Unlock NGO contact, drafted message, and outcome recording */}
                  {approvedOrLater ? (
                    <div className="space-y-3 rounded-control border border-emerald-200 bg-emerald-50/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-ink">
                          Outreach approved — ready to enquire
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.ngo_phone ? (
                            <a
                              href={`tel:${item.ngo_phone.replace(/\s+/g, "")}`}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-semibold text-primary hover:bg-surface-2"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              Call {item.ngo_phone}
                            </a>
                          ) : null}
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(
                              enquiryText
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Open in WhatsApp
                          </a>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handlePrepareNgoMessage(item)}
                          >
                            Draft in {event?.language ?? "en-IN"}
                          </Button>
                        </div>
                      </div>

                      <p className="rounded-control border border-border bg-surface p-3 text-xs text-ink indic-leading">
                        {enquiryText}
                      </p>

                      {canEdit && moduleEnabled ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={updatingId === item.id}
                            onClick={() =>
                              void handleStatusUpdate(item.id, "contacted")
                            }
                          >
                            Mark contacted
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={updatingId === item.id}
                            onClick={() =>
                              void handleStatusUpdate(item.id, "accepted")
                            }
                          >
                            NGO accepted
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={updatingId === item.id}
                            onClick={() =>
                              void handleStatusUpdate(item.id, "declined")
                            }
                          >
                            NGO declined
                          </Button>
                          <Button
                            size="sm"
                            disabled={updatingId === item.id}
                            onClick={() =>
                              void handleStatusUpdate(item.id, "collected")
                            }
                          >
                            Food collected
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={updatingId === item.id}
                            onClick={() =>
                              void handleStatusUpdate(item.id, "not_collected")
                            }
                          >
                            Not collected
                          </Button>
                        </div>
                      ) : null}

                      <p className="text-xs font-medium text-warning">
                        {DISPOSAL_GUIDANCE}
                      </p>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
