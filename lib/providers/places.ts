import type { PlaceCandidate, PlacesProvider } from "@/lib/contracts";
import type { TayyariRepository } from "@/lib/db/repository";

const PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,places.location,places.businessStatus,places.currentOpeningHours.openNow";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const SAMPLE_LISTINGS: Record<string, PlaceCandidate[]> = {
  ngo: [
    {
      place_id: "sample-ngo-1",
      name: "Sample Community Kitchen — Jayanagar (Sample listing)",
      address: "4th Block, Jayanagar, Bengaluru 560011",
      phone: null,
      rating: null,
      user_rating_count: null,
      maps_url:
        "https://www.google.com/maps/search/?api=1&query=food+donation+organization+Jayanagar+Bengaluru",
      source: "sample",
      fetched_at: new Date().toISOString(),
    },
    {
      place_id: "sample-ngo-2",
      name: "Sample Annadana Shelter Trust (Sample listing)",
      address: "JP Nagar 2nd Phase, Bengaluru 560078",
      phone: null,
      rating: null,
      user_rating_count: null,
      maps_url:
        "https://www.google.com/maps/search/?api=1&query=food+bank+shelter+Bengaluru",
      source: "sample",
      fetched_at: new Date().toISOString(),
    },
  ],
  default: [
    {
      place_id: "sample-vendor-1",
      name: "Sample Sri Lakshmi Catering & Tiffin (Sample listing)",
      address: "11th Main, Jayanagar 4th Block, Bengaluru 560011",
      phone: null,
      rating: null,
      user_rating_count: null,
      maps_url:
        "https://www.google.com/maps/search/?api=1&query=caterers+Jayanagar+Bengaluru",
      source: "sample",
      fetched_at: new Date().toISOString(),
    },
    {
      place_id: "sample-vendor-2",
      name: "Sample Namma Return Gifts & Wholesale (Sample listing)",
      address: "Chikpet Main Road, Bengaluru 560053",
      phone: null,
      rating: null,
      user_rating_count: null,
      maps_url:
        "https://www.google.com/maps/search/?api=1&query=return+gift+wholesale+Bengaluru",
      source: "sample",
      fetched_at: new Date().toISOString(),
    },
    {
      place_id: "sample-vendor-3",
      name: "Sample Marigold Mandap Decorators (Sample listing)",
      address: "Indiranagar 100 Feet Road, Bengaluru 560038",
      phone: null,
      rating: null,
      user_rating_count: null,
      maps_url:
        "https://www.google.com/maps/search/?api=1&query=event+decorators+Bengaluru",
      source: "sample",
      fetched_at: new Date().toISOString(),
    },
  ],
};

interface GooglePlaceItem {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean };
}

export class GooglePlacesProvider implements PlacesProvider {
  constructor(private repo?: TayyariRepository) {}

  async searchText(input: {
    query: string;
    category: string;
    city: string;
    area: string;
    lat?: number;
    lng?: number;
  }): Promise<{
    results: PlaceCandidate[];
    fromCache: boolean;
    fallbackUsed: boolean;
    mapsSearchUrl: string;
  }> {
    const areaPart = input.area ? `${input.area}, ` : "";
    const textQuery = `${input.query} near ${areaPart}${input.city}`.trim();
    const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(textQuery)}`;
    const queryKey = `${input.category.toLowerCase()}::${textQuery.toLowerCase()}`;

    if (this.repo) {
      const cached = await this.repo.getPlaceCache(queryKey);
      if (
        cached &&
        Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS
      ) {
        return {
          results: cached.results,
          fromCache: true,
          fallbackUsed: cached.results.some((r) => r.source === "sample"),
          mapsSearchUrl,
        };
      }
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) {
      const sample =
        input.category === "ngo"
          ? SAMPLE_LISTINGS.ngo
          : SAMPLE_LISTINGS.default;
      return {
        results: sample,
        fromCache: false,
        fallbackUsed: true,
        mapsSearchUrl,
      };
    }

    try {
      const body: Record<string, unknown> = {
        textQuery,
        maxResultCount: 10,
      };
      if (
        typeof input.lat === "number" &&
        typeof input.lng === "number"
      ) {
        body.locationBias = {
          circle: {
            center: { latitude: input.lat, longitude: input.lng },
            radius: 10000,
          },
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(PLACES_TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Google Places HTTP ${res.status}`);
      }

      const json = (await res.json()) as { places?: GooglePlaceItem[] };
      const now = new Date().toISOString();
      const filtered: PlaceCandidate[] = (json.places ?? [])
        .filter(
          (p) => !p.businessStatus || p.businessStatus === "OPERATIONAL"
        )
        .map((p) => ({
          place_id: p.id || `${p.displayName?.text}-${p.formattedAddress}`,
          name: p.displayName?.text || "Unnamed listing",
          address: p.formattedAddress || `${areaPart}${input.city}`,
          phone: p.nationalPhoneNumber ?? null,
          rating: typeof p.rating === "number" ? p.rating : null,
          user_rating_count:
            typeof p.userRatingCount === "number" ? p.userRatingCount : null,
          maps_url:
            p.googleMapsUri ||
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${p.displayName?.text ?? ""} ${p.formattedAddress ?? input.city}`
            )}`,
          open_now: p.currentOpeningHours?.openNow,
          lat: p.location?.latitude,
          lng: p.location?.longitude,
          source: "places" as const,
          fetched_at: now,
        }));

      if (this.repo && filtered.length > 0) {
        await this.repo.setPlaceCache(queryKey, filtered);
      }

      return {
        results: filtered,
        fromCache: false,
        fallbackUsed: false,
        mapsSearchUrl,
      };
    } catch {
      const sample =
        input.category === "ngo"
          ? SAMPLE_LISTINGS.ngo
          : SAMPLE_LISTINGS.default;
      return {
        results: sample,
        fromCache: false,
        fallbackUsed: true,
        mapsSearchUrl,
      };
    }
  }
}
