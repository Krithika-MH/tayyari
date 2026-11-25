import type { EventType, VendorCategory } from "@/lib/contracts";

export interface VenueSuggestionItem {
  category: VendorCategory;
  categoryLabel: string;
  headline: string;
  reason: string;
  searchQuery: string;
  searchArea: string;
  questionsToAsk: string[];
  vibeForIdeas: string;
}

export interface VenueSuggestionBundle {
  venueLabel: string;
  venueSource: "shortlist" | "expense" | "area";
  searchArea: string;
  city: string;
  suggestions: VenueSuggestionItem[];
}

export function buildVenueSuggestions(input: {
  eventType: EventType;
  city: string;
  area: string;
  guestCount: number;
  shortlistedVendors?: Array<{
    category: string;
    name: string;
    address: string;
    shortlisted: boolean;
  }>;
  expenseTitles?: string[];
}): VenueSuggestionBundle {
  const shortlistedVenue = (input.shortlistedVendors ?? []).find(
    (v) => v.category === "venues" && v.shortlisted
  );
  const expenseVenueTitle = (input.expenseTitles ?? []).find((t) =>
    /(hall|venue|mandap|resort|lawn|hotel|banquet|auditorium)/i.test(t)
  );

  let venueLabel = input.area
    ? `${input.area}, ${input.city}`
    : input.city;
  let venueSource: VenueSuggestionBundle["venueSource"] = "area";
  let searchArea = input.area || input.city;

  if (shortlistedVenue) {
    venueLabel = shortlistedVenue.name;
    venueSource = "shortlist";
    // Extract locality token if present in address, else keep event area
    const parts = shortlistedVenue.address
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    searchArea = parts.length >= 2 ? parts[1] : input.area || input.city;
  } else if (expenseVenueTitle) {
    venueLabel = expenseVenueTitle;
    venueSource = "expense";
    searchArea = input.area || input.city;
  }

  const eventLabel =
    input.eventType === "housewarming"
      ? "Griha Pravesh"
      : input.eventType === "festival"
      ? "festival gathering"
      : input.eventType;

  const isOutdoorHint = /(lawn|garden|terrace|resort|farm)/i.test(venueLabel);
  const decorHeadline = isOutdoorHint
    ? "Outdoor floral & canopy decorators"
    : "Stage mandap & entrance decorators";

  const suggestions: VenueSuggestionItem[] = [
    {
      category: "decorators",
      categoryLabel: "Decorators",
      headline: decorHeadline,
      reason: `Matched to ${venueLabel} for ~${input.guestCount} guests (${eventLabel}). Look for local teams near ${searchArea} who already know hall timings and setup rules.`,
      searchQuery: isOutdoorHint
        ? "outdoor wedding floral decorators"
        : "mandap floral event decorators",
      searchArea,
      questionsToAsk: [
        "Does the hall allow nails/rigging, or freestanding truss only?",
        "Are dismantling and flower clearing included after the ceremony?",
      ],
      vibeForIdeas: `${eventLabel} stage & entrance near ${venueLabel}`,
    },
    {
      category: "caterers",
      categoryLabel: "Caterers",
      headline: `Festive caterers for ~${input.guestCount} plates`,
      reason: `Find caterers near ${searchArea} experienced with ${input.guestCount}-guest ${eventLabel} service and timely hot delivery to ${venueLabel}.`,
      searchQuery: "vegetarian event caterers",
      searchArea,
      questionsToAsk: [
        "Are banana leaves / buffet counters, servers, and water included?",
        "What is the cutoff time to revise plate count?",
      ],
      vibeForIdeas: `${input.guestCount}-guest ${eventLabel} menu`,
    },
    {
      category: "flowers",
      categoryLabel: "Flowers",
      headline: "Fresh garlands, toran & puja flowers",
      reason: `Source fresh jasmine, marigold, and mango-leaf torans close to ${searchArea} so garlands stay crisp for ${venueLabel}.`,
      searchQuery: "flower market garlands wedding",
      searchArea,
      questionsToAsk: [
        "Early-morning delivery time to the venue?",
        "Extra loose petals and puja flower basket included?",
      ],
      vibeForIdeas: "Fresh marigold & jasmine decor",
    },
    {
      category: "photographers",
      categoryLabel: "Photographers",
      headline: "Candid & family portrait photographers",
      reason: `Book a photographer familiar with lighting inside ${venueLabel} near ${searchArea} for rituals and family group portraits.`,
      searchQuery: "event candid photographer",
      searchArea,
      questionsToAsk: [
        "Half-day vs full-day hours and raw photo delivery timeline?",
        "Does indoor lighting require extra flash stands?",
      ],
      vibeForIdeas: `${eventLabel} family photo moments`,
    },
    {
      category: "return_gifts",
      categoryLabel: "Return gifts",
      headline: "Tambulam & return-gift wholesalers",
      reason: `Save per-box cost by checking wholesale return-gift and brass/bag shops near ${searchArea} for ~${Math.max(25, Math.round(input.guestCount * 0.65))} family packs.`,
      searchQuery: "return gift wholesale shop",
      searchArea,
      questionsToAsk: [
        "Bulk discount tier and custom ribbon/tag packing?",
        "Lead time needed before the event date?",
      ],
      vibeForIdeas: `Thoughtful ${eventLabel} return gifts`,
    },
    {
      category: "rentals",
      categoryLabel: "Rentals",
      headline: "Chairs, brass lamps, fans & sound",
      reason: `Check nearby rental shops in ${searchArea} for extra seating, sound mics, or cooling fans if ${venueLabel} charges high add-ons.`,
      searchQuery: "shamiyana chairs sound rental",
      searchArea,
      questionsToAsk: [
        "Pickup timing the next morning (+1 day)?",
        "Backup mic batteries and operator included?",
      ],
      vibeForIdeas: "Comfortable guest seating & welcome",
    },
  ];

  return {
    venueLabel,
    venueSource,
    searchArea,
    city: input.city,
    suggestions,
  };
}
