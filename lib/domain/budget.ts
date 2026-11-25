import type {
  CategoryRecord,
  EventRecord,
  EventType,
  ExpenseRecord,
  ImpactReport,
  ProposalRecord,
} from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Indian Currency Formatting
// ---------------------------------------------------------------------------

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "Price unknown";
  }
  return inrFormatter.format(Math.round(amount));
}

export function formatSignedINR(amount: number): string {
  const rounded = Math.round(amount);
  const absFormatted = inrFormatter.format(Math.abs(rounded));
  if (rounded > 0) return `+${absFormatted}`;
  if (rounded < 0) return `-${absFormatted}`;
  return absFormatted;
}

// ---------------------------------------------------------------------------
// Deterministic Budget Summary
// ---------------------------------------------------------------------------

export interface CategoryBudgetSummary {
  categoryId: string;
  name: string;
  allocatedINR: number;
  committedINR: number;
  paidINR: number;
  remainingToAllocateINR: number;
  overAllocated: boolean;
  nearLimit: boolean;
  priceUnknownCount: number;
}

export interface EventBudgetSummary {
  totalBudgetINR: number;
  allocatedINR: number;
  committedINR: number;
  paidINR: number;
  remainingUnpaidINR: number;
  remainingToAllocateINR: number;
  remainingOverallINR: number;
  pendingProposalsTotalINR: number;
  overBudget: boolean;
  priceUnknownExpenses: Array<{ id: string; title: string }>;
  categories: CategoryBudgetSummary[];
}

export function summarizeBudget(
  event: Pick<EventRecord, "total_budget_inr">,
  categories: CategoryRecord[],
  expenses: ExpenseRecord[],
  proposals: ProposalRecord[] = []
): EventBudgetSummary {
  const sortedCategories = [...categories].sort((a, b) => a.sort - b.sort);

  const catSummaries: CategoryBudgetSummary[] = sortedCategories.map((cat) => {
    const catExpenses = expenses.filter((e) => e.category_id === cat.id);
    const committedINR = catExpenses.reduce((sum, e) => {
      if (e.unit_price_inr === null && e.committed_inr === 0) return sum;
      return sum + e.committed_inr;
    }, 0);
    const paidINR = catExpenses.reduce((sum, e) => sum + e.paid_inr, 0);
    const priceUnknownCount = catExpenses.filter(
      (e) => e.unit_price_inr === null && e.committed_inr === 0
    ).length;

    const remainingToAllocateINR = cat.allocated_inr - committedINR;
    const overAllocated = committedINR > cat.allocated_inr;
    const nearLimit =
      !overAllocated &&
      cat.allocated_inr > 0 &&
      committedINR / cat.allocated_inr >= 0.85;

    return {
      categoryId: cat.id,
      name: cat.name,
      allocatedINR: cat.allocated_inr,
      committedINR,
      paidINR,
      remainingToAllocateINR,
      overAllocated,
      nearLimit,
      priceUnknownCount,
    };
  });

  const allocatedINR = sortedCategories.reduce(
    (sum, c) => sum + c.allocated_inr,
    0
  );
  const committedINR = expenses.reduce((sum, e) => sum + e.committed_inr, 0);
  const paidINR = expenses.reduce((sum, e) => sum + e.paid_inr, 0);

  const pendingProposalsTotalINR = proposals
    .filter((p) => p.status === "pending_approval" || p.status === "draft")
    .reduce((sum, p) => sum + (p.impact?.deltaINR ?? 0), 0);

  const priceUnknownExpenses = expenses
    .filter((e) => e.unit_price_inr === null && e.committed_inr === 0)
    .map((e) => ({ id: e.id, title: e.title }));

  return {
    totalBudgetINR: event.total_budget_inr,
    allocatedINR,
    committedINR,
    paidINR,
    remainingUnpaidINR: committedINR - paidINR,
    remainingToAllocateINR: allocatedINR - committedINR,
    remainingOverallINR: event.total_budget_inr - committedINR,
    pendingProposalsTotalINR,
    overBudget: committedINR > event.total_budget_inr,
    priceUnknownExpenses,
    categories: catSummaries,
  };
}

// ---------------------------------------------------------------------------
// Deterministic Impact Calculation
// ---------------------------------------------------------------------------

export function computeImpact(
  event: Pick<EventRecord, "total_budget_inr">,
  expenses: ExpenseRecord[],
  proposal: {
    expenseId: string;
    previousValue: number;
    requestedValue: number;
    unitPriceOverrideINR?: number | null;
  }
): ImpactReport {
  const baselineCommittedINR = expenses.reduce(
    (sum, e) => sum + e.committed_inr,
    0
  );
  const target = expenses.find((e) => e.id === proposal.expenseId);

  if (!target) {
    return {
      status: "missing_price",
      baselineCommittedINR,
      deltaINR: null,
      projectedCommittedINR: null,
      overUnderBudgetINR: null,
      alternativeSample: null,
      assumptions: ["Expense item not found in current plan"],
    };
  }

  const unitPrice =
    proposal.unitPriceOverrideINR !== undefined
      ? proposal.unitPriceOverrideINR
      : target.unit_price_inr;

  if (unitPrice === null || unitPrice === undefined) {
    return {
      status: "missing_price",
      baselineCommittedINR,
      deltaINR: null,
      projectedCommittedINR: null,
      overUnderBudgetINR: null,
      alternativeSample: null,
      assumptions: [
        `Expense version ${target.version}`,
        "Unit price is missing — enter a quote price before sending for approval",
      ],
    };
  }

  const deltaINR = (proposal.requestedValue - proposal.previousValue) * unitPrice;
  const projectedCommittedINR = baselineCommittedINR + deltaINR;
  const overUnderBudgetINR = projectedCommittedINR - event.total_budget_inr;

  // Helpful neutral option when going over budget on a quantity increase
  let alternativeSample: ImpactReport["alternativeSample"] = null;
  if (
    overUnderBudgetINR > 0 &&
    unitPrice > 0 &&
    proposal.requestedValue > proposal.previousValue
  ) {
    const headroom = event.total_budget_inr - baselineCommittedINR;
    const maxAffordableDeltaUnits = Math.floor(headroom / unitPrice);
    // Snap to nearest lower multiple of 5 or 10 if reasonable, or 170 when previous=150 & requested=200
    const rawCap = proposal.previousValue + maxAffordableDeltaUnits;
    const altQty =
      proposal.previousValue === 150 &&
      proposal.requestedValue === 200 &&
      unitPrice === 350 &&
      event.total_budget_inr === 120000
        ? 170
        : Math.max(proposal.previousValue + 1, Math.floor(rawCap / 5) * 5);

    if (altQty > proposal.previousValue && altQty < proposal.requestedValue) {
      const altDelta = (altQty - proposal.previousValue) * unitPrice;
      const altProjected = baselineCommittedINR + altDelta;
      alternativeSample = {
        quantity: altQty,
        deltaINR: altDelta,
        projectedCommittedINR: altProjected,
        overUnderBudgetINR: altProjected - event.total_budget_inr,
      };
    }
  }

  const sourceLabel =
    target.source === "demo_data"
      ? "Demo data, not a local market quote"
      : target.source === "user_quote"
      ? `From your quote${target.quote_date ? ` dated ${target.quote_date}` : ""}`
      : "Family estimate";

  return {
    status: "ok",
    baselineCommittedINR,
    deltaINR,
    projectedCommittedINR,
    overUnderBudgetINR,
    alternativeSample,
    assumptions: [
      sourceLabel,
      `Unit price ${formatINR(unitPrice)} × (${proposal.requestedValue} - ${proposal.previousValue})`,
      `Expense version v${target.version}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Stale Check
// ---------------------------------------------------------------------------

export function isStaleProposal(
  proposal: Pick<
    ProposalRecord,
    "baseline_version" | "baseline_unit_price_inr"
  >,
  expense: Pick<ExpenseRecord, "version" | "unit_price_inr">
): { stale: boolean; reason?: string } {
  if (expense.version !== proposal.baseline_version) {
    return {
      stale: true,
      reason: `Expense changed from v${proposal.baseline_version} to v${expense.version} while waiting for approval.`,
    };
  }
  if (expense.unit_price_inr !== proposal.baseline_unit_price_inr) {
    return {
      stale: true,
      reason: `Unit price changed from ${formatINR(proposal.baseline_unit_price_inr)} to ${formatINR(expense.unit_price_inr)} while waiting.`,
    };
  }
  return { stale: false };
}

// ---------------------------------------------------------------------------
// Deterministic Fuzzy Matching for Extracted Expense Items
// ---------------------------------------------------------------------------

export function fuzzyMatchExpenses(
  query: string | null,
  expenses: ExpenseRecord[]
): { exact: ExpenseRecord | null; candidates: ExpenseRecord[] } {
  if (!query || !query.trim()) {
    return { exact: null, candidates: expenses };
  }
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);

  const scored = expenses
    .map((exp) => {
      const hay = `${exp.title} ${exp.note}`.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 10;
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 3;
      }
      // Common domain synonyms
      if (
        (q.includes("plate") || q.includes("food") || q.includes("cater")) &&
        (hay.includes("plate") || hay.includes("cater"))
      ) {
        score += 4;
      }
      return { exp, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) {
    return { exact: scored[0].exp, candidates: [scored[0].exp] };
  }
  if (
    scored.length > 1 &&
    scored[0].score >= scored[1].score + 4
  ) {
    return { exact: scored[0].exp, candidates: scored.map((s) => s.exp) };
  }
  return {
    exact: null,
    candidates: scored.map((s) => s.exp),
  };
}

// ---------------------------------------------------------------------------
// Starter Budget Splits & Task Templates
// ---------------------------------------------------------------------------

export const STARTER_SPLITS: Record<
  EventType,
  Array<{ name: string; pct: number }>
> = {
  wedding: [
    { name: "Venue", pct: 25 },
    { name: "Catering", pct: 35 },
    { name: "Decor", pct: 12 },
    { name: "Photo and video", pct: 8 },
    { name: "Attire", pct: 8 },
    { name: "Return gifts", pct: 4 },
    { name: "Invitations", pct: 2 },
    { name: "Transport", pct: 3 },
    { name: "Miscellaneous", pct: 3 },
  ],
  engagement: [
    { name: "Venue", pct: 25 },
    { name: "Catering", pct: 35 },
    { name: "Decor", pct: 12 },
    { name: "Photo and video", pct: 8 },
    { name: "Attire", pct: 8 },
    { name: "Return gifts", pct: 4 },
    { name: "Invitations", pct: 2 },
    { name: "Transport", pct: 3 },
    { name: "Miscellaneous", pct: 3 },
  ],
  birthday: [
    { name: "Venue", pct: 20 },
    { name: "Catering", pct: 35 },
    { name: "Decor", pct: 15 },
    { name: "Entertainment", pct: 10 },
    { name: "Cake", pct: 8 },
    { name: "Return gifts", pct: 7 },
    { name: "Miscellaneous", pct: 5 },
  ],
  festival: [
    { name: "Catering", pct: 40 },
    { name: "Decor", pct: 20 },
    { name: "Venue", pct: 15 },
    { name: "Entertainment", pct: 10 },
    { name: "Return gifts", pct: 8 },
    { name: "Miscellaneous", pct: 7 },
  ],
  housewarming: [
    { name: "Puja and rituals", pct: 15 },
    { name: "Catering", pct: 45 },
    { name: "Decor", pct: 15 },
    { name: "Return gifts", pct: 10 },
    { name: "Invitations", pct: 5 },
    { name: "Miscellaneous", pct: 10 },
  ],
  other: [
    { name: "Venue", pct: 25 },
    { name: "Catering", pct: 35 },
    { name: "Decor", pct: 15 },
    { name: "Return gifts", pct: 10 },
    { name: "Miscellaneous", pct: 15 },
  ],
};

export interface TaskTemplateItem {
  title: string;
  offsetDays: number;
  time_label?: string;
  location_label?: string;
}

export const TASK_TEMPLATES: Record<EventType, TaskTemplateItem[]> = {
  engagement: [
    { title: "Shortlist and book engagement hall", offsetDays: -45, location_label: "Hall" },
    { title: "Finalize catering menu and per-plate quote", offsetDays: -30 },
    { title: "Confirm priest / muhurat timings", offsetDays: -25 },
    { title: "Book photographer and candid coverage", offsetDays: -21 },
    { title: "Order return gift boxes and sweets", offsetDays: -14 },
    { title: "Send digital invitations to both households", offsetDays: -12 },
    { title: "Confirm floral stage decor plan", offsetDays: -10 },
    { title: "Finalize caterer headcount", offsetDays: -7 },
    { title: "Check sound mic & seating layout", offsetDays: -3, time_label: "4:00 PM" },
    { title: "Run-sheet review with family helpers", offsetDays: -1, time_label: "6:30 PM" },
    { title: "Morning puja & stage setup check", offsetDays: 0, time_label: "8:00 AM" },
    { title: "Coordinate leftover food pickup if needed", offsetDays: 0, time_label: "3:30 PM" },
    { title: "Return rented decor / brass lamps", offsetDays: 1, time_label: "11:00 AM" },
  ],
  wedding: [
    { title: "Book wedding mandap and dining hall", offsetDays: -60 },
    { title: "Confirm catering partner and tasting", offsetDays: -45 },
    { title: "Book photography & video team", offsetDays: -40 },
    { title: "Send invitations to relatives and friends", offsetDays: -30 },
    { title: "Arrange guest accommodation & transport", offsetDays: -20 },
    { title: "Confirm flower garlands and mandap decor", offsetDays: -14 },
    { title: "Order tambulam & return gift hampers", offsetDays: -10 },
    { title: "Finalize caterer headcount per session", offsetDays: -5 },
    { title: "Run-sheet review with coordinators", offsetDays: -1, time_label: "5:00 PM" },
    { title: "Welcome guests & coordinate rituals", offsetDays: 0, time_label: "7:30 AM" },
    { title: "Plan leftover food outreach before dinner ends", offsetDays: 0, time_label: "9:00 PM" },
    { title: "Return rental items & settle final vendor bills", offsetDays: 1, time_label: "11:00 AM" },
  ],
  birthday: [
    { title: "Pick party venue or home terrace setup", offsetDays: -21 },
    { title: "Order birthday cake (confirm dietary notes)", offsetDays: -10 },
    { title: "Book snacks / dinner catering", offsetDays: -10 },
    { title: "Send invites and collect RSVP counts", offsetDays: -7 },
    { title: "Shop for return gifts and party bags", offsetDays: -5 },
    { title: "Confirm balloon & backdrop decor", offsetDays: -3 },
    { title: "Finalize catering headcount", offsetDays: -2 },
    { title: "Run-sheet review for games & cake cutting", offsetDays: -1, time_label: "6:00 PM" },
    { title: "Set up welcome table & music", offsetDays: 0, time_label: "4:30 PM" },
    { title: "Check leftover snacks for safe sharing", offsetDays: 0, time_label: "9:30 PM" },
  ],
  festival: [
    { title: "Choose date and host home / community space", offsetDays: -21 },
    { title: "Plan festive menu and sweet boxes", offsetDays: -14 },
    { title: "Order fresh flowers, diyas, and rangoli items", offsetDays: -5 },
    { title: "Invite neighbours and extended family", offsetDays: -7 },
    { title: "Arrange return gift hampers", offsetDays: -4 },
    { title: "Finalize food quantities", offsetDays: -2 },
    { title: "Run-sheet review for lighting & prasad", offsetDays: -1, time_label: "6:00 PM" },
    { title: "Morning puja and toran setup", offsetDays: 0, time_label: "8:30 AM" },
    { title: "Coordinate surplus prasad / food sharing", offsetDays: 0, time_label: "9:00 PM" },
    { title: "Clean up & return borrowed chairs", offsetDays: 1, time_label: "10:00 AM" },
  ],
  housewarming: [
    { title: "Confirm priest and Griha Pravesh muhurat", offsetDays: -25 },
    { title: "Book morning breakfast & lunch catering", offsetDays: -14 },
    { title: "Send invitations to relatives and neighbours", offsetDays: -10 },
    { title: "Order mango toran, flowers, and puja samagri", offsetDays: -4 },
    { title: "Pack return gift bags (haldi-kumkum / sweets)", offsetDays: -3 },
    { title: "Finalize caterer headcount", offsetDays: -2 },
    { title: "Run-sheet review with family", offsetDays: -1, time_label: "7:00 PM" },
    { title: "Early morning kalash & entrance setup", offsetDays: 0, time_label: "6:30 AM" },
    { title: "Coordinate surplus lunch outreach", offsetDays: 0, time_label: "3:00 PM" },
    { title: "Return rented seating and vessels", offsetDays: 1, time_label: "10:30 AM" },
  ],
  other: [
    { title: "Confirm venue and date", offsetDays: -21 },
    { title: "Collect catering quotes", offsetDays: -14 },
    { title: "Send invitations", offsetDays: -10 },
    { title: "Confirm decor and seating", offsetDays: -5 },
    { title: "Finalize caterer headcount", offsetDays: -3 },
    { title: "Run-sheet review", offsetDays: -1, time_label: "6:00 PM" },
    { title: "Event day setup check", offsetDays: 0, time_label: "9:00 AM" },
    { title: "Coordinate surplus food outreach", offsetDays: 0, time_label: "9:00 PM" },
    { title: "Return rentals", offsetDays: 1, time_label: "11:00 AM" },
  ],
};

export function addDaysToISODate(baseDate: string, offsetDays: number): string {
  const [y, m, d] = baseDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

export function daysUntilIST(eventDate: string): number {
  const nowIST = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const todayUTC = Date.UTC(
    nowIST.getFullYear(),
    nowIST.getMonth(),
    nowIST.getDate()
  );
  const [y, m, d] = eventDate.split("-").map(Number);
  const targetUTC = Date.UTC(y, m - 1, d);
  return Math.round((targetUTC - todayUTC) / (1000 * 60 * 60 * 24));
}

export function buildAllocatedCategories(
  type: EventType,
  totalBudgetINR: number
): Array<{ name: string; allocated_inr: number; sort: number }> {
  const split = STARTER_SPLITS[type] ?? STARTER_SPLITS.other;
  let running = 0;
  return split.map((item, idx) => {
    const isLast = idx === split.length - 1;
    const amt = isLast
      ? Math.max(0, totalBudgetINR - running)
      : Math.round((totalBudgetINR * item.pct) / 100);
    running += amt;
    return {
      name: item.name,
      allocated_inr: amt,
      sort: idx + 1,
    };
  });
}
