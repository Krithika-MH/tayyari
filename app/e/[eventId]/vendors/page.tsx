"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  Store,
} from "lucide-react";
import { clsx } from "clsx";
import {
  VENDOR_CATEGORIES,
  type PlaceCandidate,
  type QuoteRecord,
  type VendorCategory,
  type VendorRecord,
} from "@/lib/contracts";
import { formatINR } from "@/lib/domain/budget";
import { buildVenueSuggestions } from "@/lib/domain/suggestions";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  Skeleton,
  StatusChip,
  useToast,
} from "@/components/ui/primitives";
import { PageGuide } from "@/components/ui/PageGuide";

const CATEGORY_LABELS: Record<VendorCategory, string> = {
  caterers: "Caterers",
  decorators: "Decorators",
  venues: "Venues",
  photographers: "Photographers",
  flowers: "Flowers",
  sweets: "Sweets",
  return_gifts: "Return gifts",
  rentals: "Rentals",
  cake_shops: "Cake shops",
};

type SanitizedQuote = Omit<QuoteRecord, "amount_inr"> & {
  amount_inr: number | null;
};

export default function VendorsPage() {
  const searchParams = useSearchParams();
  const {
    eventId,
    token,
    event,
    member,
    categories,
    expenses,
    flags,
    lang,
    loading,
    refreshEvent,
  } = useEventContext();
  const { pushToast } = useToast();
  const autoSearchDoneRef = useRef(false);

  const [activeTab, setActiveTab] = useState<"find" | "shortlist">("find");
  const [selectedCategory, setSelectedCategory] =
    useState<VendorCategory>("caterers");
  const [areaQuery, setAreaQuery] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [locating, setLocating] = useState(false);

  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceCandidate[]>([]);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [mapsSearchUrl, setMapsSearchUrl] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [quotes, setQuotes] = useState<SanitizedQuote[]>([]);
  const [loadingShortlist, setLoadingShortlist] = useState(false);
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);

  // Quote Entry Dialog
  const [quoteVendor, setQuoteVendor] = useState<VendorRecord | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteUnit, setQuoteUnit] = useState("total");
  const [quoteDate, setQuoteDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  );
  const [quoteValidTill, setQuoteValidTill] = useState("");
  const [quoteInclusions, setQuoteInclusions] = useState("");
  const [quoteExclusions, setQuoteExclusions] = useState("");
  const [commitCategoryId, setCommitCategoryId] = useState("");
  const [submittingQuote, setSubmittingQuote] = useState(false);

  // Commit Existing Quote Dialog
  const [commitTargetQuote, setCommitTargetQuote] =
    useState<SanitizedQuote | null>(null);
  const [commitExistingCatId, setCommitExistingCatId] = useState("");
  const [committingExisting, setCommittingExisting] = useState(false);

  // P1 Festive Ideas Widget
  const [ideasCategory, setIdeasCategory] = useState("Decor");
  const [ideasVibe, setIdeasVibe] = useState("Warm marigold & brass");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [ideasDisclaimer, setIdeasDisclaimer] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  const authQuery = `eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`;
  const canEdit = member?.role !== "viewer";
  const moduleEnabled = flags?.module_vendor_finder !== false;

  useEffect(() => {
    if (event?.area && !areaQuery) {
      setAreaQuery(event.area);
    }
  }, [event?.area, areaQuery]);

  const loadShortlist = useCallback(async () => {
    if (!eventId || !token) return;
    setLoadingShortlist(true);
    try {
      const res = await fetch(`/api/vendors/shortlist?${authQuery}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
        setQuotes(Array.isArray(data.quotes) ? data.quotes : []);
      }
    } finally {
      setLoadingShortlist(false);
    }
  }, [authQuery, eventId, token]);

  useEffect(() => {
    void loadShortlist();
  }, [loadShortlist]);

  const shortlistedVendors = useMemo(
    () => vendors.filter((v) => v.shortlisted),
    [vendors]
  );

  const shortlistedPlaceIds = useMemo(
    () => new Set(shortlistedVendors.map((v) => v.place_id)),
    [shortlistedVendors]
  );

  async function runVendorSearch(
    cat: VendorCategory = selectedCategory,
    areaOverride?: string,
    queryOverride?: string
  ) {
    if (!moduleEnabled) return;
    setSearching(true);
    setSearchError(null);
    const targetArea = areaOverride ?? (areaQuery.trim() || event?.area || "");
    if (areaOverride) setAreaQuery(areaOverride);
    try {
      const res = await fetch(`/api/vendors/search?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryOverride ?? CATEGORY_LABELS[cat],
          category: cat,
          area: targetArea,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Could not search vendors right now.");
        return;
      }
      setSearchResults(Array.isArray(data.results) ? data.results : []);
      setFallbackUsed(Boolean(data.fallbackUsed));
      setFromCache(Boolean(data.fromCache));
      setMapsSearchUrl(data.mapsSearchUrl ?? null);
    } catch {
      setSearchError("Network error while searching vendors.");
    } finally {
      setSearching(false);
    }
  }

  function handleUseMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      pushToast("Location is not supported by this browser.", "error");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
        pushToast("Location captured for nearby search.", "success");
      },
      () => {
        setLocating(false);
        pushToast(
          "Could not access your location. You can type your area instead.",
          "info"
        );
      },
      { timeout: 8000 }
    );
  }

  async function handleSaveToShortlist(candidate: PlaceCandidate) {
    if (!canEdit) return;
    setSavingPlaceId(candidate.place_id);
    try {
      const res = await fetch(`/api/vendors/shortlist?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          name: candidate.name,
          phone: candidate.phone,
          address: candidate.address,
          rating: candidate.rating,
          user_rating_count: candidate.user_rating_count,
          maps_url: candidate.maps_url,
          place_id: candidate.place_id,
          shortlisted: true,
          source: candidate.source,
          fetched_at: candidate.fetched_at,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not shortlist vendor.", "error");
        return;
      }
      pushToast(`${candidate.name} saved to shortlist.`, "success");
      await loadShortlist();
      await refreshEvent();
    } catch {
      pushToast("Could not reach server.", "error");
    } finally {
      setSavingPlaceId(null);
    }
  }

  async function handleToggleShortlist(vendor: VendorRecord) {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/vendors/shortlist?${authQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: vendor.id,
          shortlisted: !vendor.shortlisted,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        pushToast(data.error || "Could not update shortlist.", "error");
        return;
      }
      await loadShortlist();
    } catch {
      pushToast("Network error while updating shortlist.", "error");
    }
  }

  async function handleSubmitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteVendor) return;
    const amountNum = Number(quoteAmount);
    if (!Number.isInteger(amountNum) || amountNum < 0) {
      pushToast("Enter a valid whole rupee amount.", "error");
      return;
    }

    setSubmittingQuote(true);
    try {
      const res = await fetch(`/api/quotes?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: quoteVendor.id,
          amount_inr: amountNum,
          unit_label: quoteUnit.trim() || "total",
          quote_date: quoteDate,
          valid_till: quoteValidTill || null,
          inclusions: quoteInclusions.trim(),
          exclusions: quoteExclusions.trim(),
          ...(commitCategoryId ? { commitToCategoryId: commitCategoryId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not save quote.", "error");
        return;
      }
      pushToast(
        commitCategoryId
          ? "Quote saved and committed to budget."
          : "Quote saved for comparison.",
        "success"
      );
      setQuoteVendor(null);
      setQuoteAmount("");
      setQuoteInclusions("");
      setQuoteExclusions("");
      setQuoteValidTill("");
      setCommitCategoryId("");
      await loadShortlist();
      await refreshEvent();
    } catch {
      pushToast("Network error while saving quote.", "error");
    } finally {
      setSubmittingQuote(false);
    }
  }

  async function handleCommitExistingQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!commitTargetQuote || !commitExistingCatId) return;
    setCommittingExisting(true);
    try {
      const res = await fetch(`/api/quotes?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitExistingQuoteId: commitTargetQuote.id,
          commitToCategoryId: commitExistingCatId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not commit quote to budget.", "error");
        return;
      }
      pushToast("Committed quote to your budget.", "success");
      setCommitTargetQuote(null);
      setCommitExistingCatId("");
      await refreshEvent();
    } catch {
      pushToast("Network error while committing quote.", "error");
    } finally {
      setCommittingExisting(false);
    }
  }

  async function handleFetchIdeas(
    overrideCategory?: string,
    overrideVibe?: string
  ) {
    const catToSend = overrideCategory ?? ideasCategory;
    const vibeToSend = overrideVibe ?? ideasVibe;
    if (overrideCategory) setIdeasCategory(overrideCategory);
    if (overrideVibe) setIdeasVibe(overrideVibe);
    setLoadingIdeas(true);
    try {
      const res = await fetch(`/api/ideas?${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: catToSend,
          vibe: vibeToSend,
          venueContext: venueBundle?.venueLabel,
          language: lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || "Could not generate festive ideas.", "error");
        return;
      }
      setIdeas(Array.isArray(data.ideas) ? data.ideas : []);
      setIdeasDisclaimer(
        data.disclaimer || "AI idea, not a quote. Get a real price before deciding."
      );
    } catch {
      pushToast("Could not reach Festive Ideas right now.", "error");
    } finally {
      setLoadingIdeas(false);
    }
  }

  // Cheapest quote calculation across shortlisted vendors (only when can_see_amounts)
  const latestQuoteByVendorId = useMemo(() => {
    const map = new Map<string, SanitizedQuote>();
    for (const q of quotes) {
      const existing = map.get(q.vendor_id);
      if (
        !existing ||
        (q.amount_inr !== null &&
          (existing.amount_inr === null || q.amount_inr < existing.amount_inr))
      ) {
        map.set(q.vendor_id, q);
      }
    }
    return map;
  }, [quotes]);

  const venueBundle = useMemo(() => {
    if (!event) return null;
    return buildVenueSuggestions({
      eventType: event.type,
      city: event.city,
      area: event.area,
      guestCount: event.guest_count,
      shortlistedVendors: vendors,
      expenseTitles: expenses.map((e) => e.title),
    });
  }, [event, vendors, expenses]);

  useEffect(() => {
    if (autoSearchDoneRef.current || !event || !moduleEnabled) return;
    const catParam = searchParams.get("cat") as VendorCategory | null;
    const autoParam = searchParams.get("auto");
    if (catParam && VENDOR_CATEGORIES.includes(catParam)) {
      setSelectedCategory(catParam);
      if (autoParam === "1") {
        autoSearchDoneRef.current = true;
        void runVendorSearch(catParam, venueBundle?.searchArea ?? event.area);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, moduleEnabled, searchParams]);

  const cheapestAmount = useMemo(() => {
    if (!member?.can_see_amounts) return null;
    const amounts = shortlistedVendors
      .map((v) => latestQuoteByVendorId.get(v.id)?.amount_inr)
      .filter((a): a is number => typeof a === "number");
    if (amounts.length < 2) return null;
    return Math.min(...amounts);
  }, [shortlistedVendors, latestQuoteByVendorId, member?.can_see_amounts]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink marigold-underline">
              Vendors &amp; Quotes
            </h1>
            <PageGuide
              title="Vendors & Quotes"
              summary="Get suggestions tailored to your venue, discover real local shops & decorators via Google Places, shortlist favorites, and compare written quotes."
              steps={[
                "Review 'Suggestions based on your venue' to see recommended categories and questions to ask decorators or caterers.",
                "Pick any category chip or click 'Find nearby' to search Google Places around your venue.",
                "Save shortlisted vendors, enter real written quotes you collect, and compare them side by side (cheapest highlighted).",
              ]}
              note="Tayyari never guesses prices — search results never show synthetic prices until you enter a real quote."
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Search nearby vendors in {event?.city}, save your shortlist, and
            compare real written quotes side by side.
          </p>
        </div>

        <div className="inline-flex rounded-control border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setActiveTab("find")}
            className={clsx(
              "min-h-[40px] rounded-[9px] px-4 text-sm font-semibold transition-colors",
              activeTab === "find"
                ? "bg-primary text-white"
                : "text-ink-muted hover:text-ink"
            )}
          >
            Find Vendors
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shortlist")}
            className={clsx(
              "min-h-[40px] rounded-[9px] px-4 text-sm font-semibold transition-colors",
              activeTab === "shortlist"
                ? "bg-primary text-white"
                : "text-ink-muted hover:text-ink"
            )}
          >
            Shortlist ({shortlistedVendors.length})
          </button>
        </div>
      </div>

      {!moduleEnabled ? (
        <EmptyState
          icon={<Store className="h-6 w-6" />}
          title="Vendor Finder is currently turned off"
          description="This module is disabled by Flagsmith live controls for this event. You can still view your existing shortlist below."
        />
      ) : null}

      {activeTab === "find" && moduleEnabled ? (
        <div className="space-y-5">
          {/* Venue-based Suggestions Panel */}
          {venueBundle ? (
            <Card className="bg-gradient-to-br from-surface via-surface to-surface-2/60 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                    <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>
                      {venueBundle.venueSource === "shortlist"
                        ? "Based on your shortlisted venue"
                        : venueBundle.venueSource === "expense"
                        ? "Based on your booked venue"
                        : "Based on your event area & guest count"}
                    </span>
                  </div>
                  <h2 className="mt-0.5 font-display text-lg font-bold text-ink">
                    Suggestions for {venueBundle.venueLabel}
                  </h2>
                </div>
                <StatusChip label="Curated checklist — no fake quotes" tone="info" />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {venueBundle.suggestions.map((sug) => (
                  <div
                    key={sug.category}
                    className="flex flex-col justify-between rounded-control border border-border bg-surface p-4 space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <StatusChip label={sug.categoryLabel} tone="accent" />
                        <span className="text-[11px] font-medium text-ink-muted">
                          Near {sug.searchArea}
                        </span>
                      </div>
                      <h3 className="font-semibold text-ink">{sug.headline}</h3>
                      <p className="text-xs text-ink-muted leading-relaxed">
                        {sug.reason}
                      </p>
                      <ul className="space-y-1 pt-1 text-[11px] text-ink-muted">
                        {sug.questionsToAsk.map((q, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-primary font-bold">•</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        className="flex-1 min-h-[40px] whitespace-nowrap"
                        onClick={() => {
                          setSelectedCategory(sug.category);
                          void runVendorSearch(
                            sug.category,
                            sug.searchArea,
                            sug.searchQuery
                          );
                        }}
                      >
                        <Search className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Find {sug.categoryLabel.toLowerCase()}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="min-h-[40px]"
                        onClick={() => {
                          void handleFetchIdeas(sug.categoryLabel, sug.vibeForIdeas);
                        }}
                      >
                        <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                        <span>AI ideas</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Category chip row */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vendor categories">
            {VENDOR_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  void runVendorSearch(cat);
                }}
                className={clsx(
                  "min-h-[40px] rounded-full border px-4 text-sm font-semibold transition-colors",
                  selectedCategory === cat
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-ink hover:bg-surface-2"
                )}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Search bar + geolocation */}
          <Card className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runVendorSearch(selectedCategory);
              }}
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <div className="relative flex-1">
                <MapPin className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-ink-muted" />
                <input
                  type="text"
                  value={areaQuery}
                  onChange={(e) => setAreaQuery(e.target.value)}
                  placeholder={`Area in ${event?.city ?? "city"} (e.g. Jayanagar, Indiranagar)`}
                  className="h-12 w-full rounded-control border border-border bg-bg pl-11 pr-3 text-base text-ink"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={locating}
                onClick={handleUseMyLocation}
              >
                <Navigation className="h-4 w-4" />
                Use my location
              </Button>
              <Button type="submit" loading={searching}>
                <Search className="h-4 w-4" />
                Search {CATEGORY_LABELS[selectedCategory]}
              </Button>
            </form>
            {coords ? (
              <p className="mt-2 text-xs text-success">
                Location bias enabled for nearby results.
              </p>
            ) : null}
          </Card>

          {searchError ? (
            <div
              role="alert"
              className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-danger"
            >
              {searchError}
            </div>
          ) : null}

          {fallbackUsed ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-warning">
              <div>
                <strong>Sample listings, not real vendors.</strong> Live Google
                Places results were unavailable, so sample entries are shown for
                layout preview.
              </div>
              {mapsSearchUrl ? (
                <a
                  href={mapsSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-primary underline underline-offset-2"
                >
                  Search real listings on Google Maps
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          ) : mapsSearchUrl && searchResults.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <span>
                Showing {searchResults.length} results
                {fromCache ? " (cached within 24h)" : ""}. Prices are never
                estimated from listings — collect a real quote.
              </span>
              <a
                href={mapsSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline"
              >
                Open full Google Maps search
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : null}

          {searchResults.length === 0 && !searching ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title={`Find ${CATEGORY_LABELS[selectedCategory]} near ${areaQuery || event?.city || "you"}`}
              description="Choose a category above and click Search to see local vendor listings, phone numbers, and Google Maps links."
              action={
                <Button onClick={() => void runVendorSearch(selectedCategory)}>
                  Search {CATEGORY_LABELS[selectedCategory]}
                </Button>
              }
            />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {searchResults.map((cand) => {
              const isSaved = shortlistedPlaceIds.has(cand.place_id);
              return (
                <Card key={cand.place_id} className="flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-semibold text-ink">
                        {cand.name}
                      </h3>
                      {typeof cand.open_now === "boolean" ? (
                        <StatusChip
                          label={cand.open_now ? "Open now" : "Closed now"}
                          tone={cand.open_now ? "success" : "neutral"}
                        />
                      ) : null}
                    </div>

                    <p className="text-sm text-ink-muted">{cand.address}</p>

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
                      {cand.rating !== null ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Star className="h-4 w-4 fill-accent text-accent" />
                          {cand.rating.toFixed(1)}
                          {cand.user_rating_count !== null ? (
                            <span className="font-normal text-ink-muted">
                              ({cand.user_rating_count})
                            </span>
                          ) : null}
                        </span>
                      ) : null}

                      {cand.phone ? (
                        <a
                          href={`tel:${cand.phone.replace(/\s+/g, "")}`}
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          <Phone className="h-4 w-4" />
                          {cand.phone}
                        </a>
                      ) : null}
                    </div>

                    {cand.source === "sample" ? (
                      <StatusChip label="Sample listing" tone="warning" />
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <a
                      href={cand.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    >
                      Open in Maps
                      <ExternalLink className="h-4 w-4" />
                    </a>

                    {canEdit ? (
                      <Button
                        size="sm"
                        variant={isSaved ? "secondary" : "primary"}
                        disabled={isSaved || savingPlaceId === cand.place_id}
                        loading={savingPlaceId === cand.place_id}
                        onClick={() => void handleSaveToShortlist(cand)}
                      >
                        {isSaved ? (
                          <>
                            <BookmarkCheck className="h-4 w-4 text-success" />
                            Shortlisted
                          </>
                        ) : (
                          <>
                            <Bookmark className="h-4 w-4" />
                            Save to shortlist
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Shortlist & Side-by-Side Quotes */}
      {activeTab === "shortlist" ? (
        <div className="space-y-6">
          {loadingShortlist ? (
            <Skeleton className="h-40 w-full" />
          ) : shortlistedVendors.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="h-6 w-6" />}
              title="No shortlisted vendors yet"
              description="Search for caterers, decorators, or return gift shops and save your favourites here to compare quotes."
              action={
                moduleEnabled ? (
                  <Button onClick={() => setActiveTab("find")}>
                    Browse vendors
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {shortlistedVendors.map((v) => (
                  <Card key={v.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wide text-primary">
                          {CATEGORY_LABELS[v.category as VendorCategory] ??
                            v.category}
                        </span>
                        <h3 className="font-display text-lg font-semibold text-ink">
                          {v.name}
                        </h3>
                      </div>
                      {canEdit && moduleEnabled ? (
                        <button
                          type="button"
                          onClick={() => void handleToggleShortlist(v)}
                          className="text-xs font-semibold text-ink-muted hover:text-danger"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <p className="text-sm text-ink-muted">{v.address}</p>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {v.phone ? (
                        <a
                          href={`tel:${v.phone.replace(/\s+/g, "")}`}
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          <Phone className="h-4 w-4" />
                          {v.phone}
                        </a>
                      ) : null}
                      <a
                        href={v.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Open in Maps
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    {canEdit && member?.can_see_amounts && moduleEnabled ? (
                      <div className="pt-2 border-t border-border">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setQuoteVendor(v)}
                        >
                          <Plus className="h-4 w-4" />
                          Enter written quote
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>

              {/* Side-by-side QuoteTable */}
              <Card className="p-0 overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Side-by-Side Quote Comparison
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Only quotes entered by your family appear here.
                  </p>
                </div>

                {!member?.can_see_amounts ? (
                  <div className="p-5 text-sm text-ink-muted">
                    Quote amounts are hidden for your role.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-2/60">
                          <th className="sticky left-0 z-10 min-w-[140px] bg-surface-2 px-4 py-3 text-left font-semibold text-ink">
                            Comparison
                          </th>
                          {shortlistedVendors.map((v) => (
                            <th
                              key={v.id}
                              className="min-w-[200px] px-4 py-3 text-left font-semibold text-ink"
                            >
                              {v.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium text-ink-muted">
                            Quote amount
                          </td>
                          {shortlistedVendors.map((v) => {
                            const q = latestQuoteByVendorId.get(v.id);
                            const isCheapest =
                              q &&
                              q.amount_inr !== null &&
                              cheapestAmount !== null &&
                              q.amount_inr === cheapestAmount;
                            return (
                              <td
                                key={v.id}
                                className={clsx(
                                  "px-4 py-3 tabular-nums",
                                  isCheapest && "bg-emerald-50/70"
                                )}
                              >
                                {q ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 font-bold text-ink">
                                      <span>{formatINR(q.amount_inr)}</span>
                                      {isCheapest ? (
                                        <StatusChip
                                          label="Lowest quote"
                                          tone="success"
                                        />
                                      ) : null}
                                    </div>
                                    <div className="text-xs text-ink-muted">
                                      From your quote dated {q.quote_date}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-ink-muted">
                                    No quote yet
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium text-ink-muted">
                            Unit
                          </td>
                          {shortlistedVendors.map((v) => {
                            const q = latestQuoteByVendorId.get(v.id);
                            return (
                              <td key={v.id} className="px-4 py-3 text-ink">
                                {q ? q.unit_label : "—"}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium text-ink-muted">
                            Inclusions
                          </td>
                          {shortlistedVendors.map((v) => {
                            const q = latestQuoteByVendorId.get(v.id);
                            return (
                              <td key={v.id} className="px-4 py-3 text-ink-muted">
                                {q && q.inclusions ? q.inclusions : "—"}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium text-ink-muted">
                            Exclusions
                          </td>
                          {shortlistedVendors.map((v) => {
                            const q = latestQuoteByVendorId.get(v.id);
                            return (
                              <td key={v.id} className="px-4 py-3 text-ink-muted">
                                {q && q.exclusions ? q.exclusions : "—"}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium text-ink-muted">
                            Valid till
                          </td>
                          {shortlistedVendors.map((v) => {
                            const q = latestQuoteByVendorId.get(v.id);
                            return (
                              <td key={v.id} className="px-4 py-3 text-ink-muted">
                                {q?.valid_till ?? "—"}
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium text-ink-muted">
                            Action
                          </td>
                          {shortlistedVendors.map((v) => {
                            const q = latestQuoteByVendorId.get(v.id);
                            return (
                              <td key={v.id} className="px-4 py-3">
                                {q && canEdit && moduleEnabled ? (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setCommitTargetQuote(q);
                                      setCommitExistingCatId(
                                        categories[0]?.id ?? ""
                                      );
                                    }}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Commit quote to budget
                                  </Button>
                                ) : (
                                  <span className="text-xs text-ink-muted">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      ) : null}

      {/* P1 Festive Ideas Widget */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">
              Festive Ideas
            </h2>
          </div>
          <StatusChip
            label="AI idea, not a quote. Get a real price before deciding."
            tone="warning"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={ideasCategory}
            onChange={(e) => setIdeasCategory(e.target.value)}
            aria-label="Idea category"
            className="h-12 rounded-control border border-border bg-bg px-3 text-sm text-ink"
          >
            <option value="Decor">Decor</option>
            <option value="Catering">Catering</option>
            <option value="Return gifts">Return gifts</option>
            <option value="Welcome & Puja">Welcome &amp; Puja</option>
          </select>
          <input
            type="text"
            value={ideasVibe}
            onChange={(e) => setIdeasVibe(e.target.value)}
            placeholder="Describe your vibe (e.g. simple eco-friendly banana leaf)"
            className="h-12 flex-1 rounded-control border border-border bg-bg px-3 text-sm text-ink"
          />
          <Button
            type="button"
            variant="secondary"
            loading={loadingIdeas}
            onClick={() => void handleFetchIdeas()}
          >
            Get 5 ideas
          </Button>
        </div>

        {ideas.length > 0 ? (
          <div className="space-y-2 rounded-control bg-surface-2/50 p-4">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
              {ideas.map((idea, idx) => (
                <li key={idx}>{idea}</li>
              ))}
            </ul>
            <p className="pt-1 text-xs font-medium text-warning">
              {ideasDisclaimer}
            </p>
          </div>
        ) : null}
      </Card>

      {/* Quote Entry Dialog */}
      <Dialog
        open={Boolean(quoteVendor)}
        onOpenChange={(open) => {
          if (!open) setQuoteVendor(null);
        }}
        title={quoteVendor ? `Enter quote — ${quoteVendor.name}` : "Enter quote"}
        description="Record a real written or phone quote you received from this vendor."
      >
        <form onSubmit={handleSubmitQuote} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Amount (INR ₹)
              </label>
              <input
                type="number"
                required
                min={0}
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
                placeholder="35000"
                className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Unit label
              </label>
              <input
                type="text"
                value={quoteUnit}
                onChange={(e) => setQuoteUnit(e.target.value)}
                placeholder="total / per plate"
                className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Quote date
              </label>
              <input
                type="date"
                required
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Valid till (optional)
              </label>
              <input
                type="date"
                value={quoteValidTill}
                onChange={(e) => setQuoteValidTill(e.target.value)}
                className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Inclusions
            </label>
            <input
              type="text"
              value={quoteInclusions}
              onChange={(e) => setQuoteInclusions(e.target.value)}
              placeholder="e.g. Stage backdrop, fresh jasmine garlands, setup"
              className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Exclusions
            </label>
            <input
              type="text"
              value={quoteExclusions}
              onChange={(e) => setQuoteExclusions(e.target.value)}
              placeholder="e.g. Generator power, transport outside city"
              className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Commit straight to budget category (optional)
            </label>
            <select
              value={commitCategoryId}
              onChange={(e) => setCommitCategoryId(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
            >
              <option value="">Save quote only (do not commit yet)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  Commit to {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuoteVendor(null)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submittingQuote}>
              Save quote
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Commit Existing Quote Dialog */}
      <Dialog
        open={Boolean(commitTargetQuote)}
        onOpenChange={(open) => {
          if (!open) setCommitTargetQuote(null);
        }}
        title="Commit quote to budget"
        description="Choose which budget category should record this vendor quote as a committed expense."
      >
        <form onSubmit={handleCommitExistingQuote} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Budget category
            </label>
            <select
              required
              value={commitExistingCatId}
              onChange={(e) => setCommitExistingCatId(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-ink"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCommitTargetQuote(null)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={committingExisting}>
              Commit to budget
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
