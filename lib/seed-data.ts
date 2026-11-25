import { randomBytes } from "crypto";
import type {
  CategoryRecord,
  EventRecord,
  ExpenseRecord,
  MemberRecord,
} from "@/lib/contracts";
import type { TayyariRepository } from "@/lib/db/repository";
import {
  addDaysToISODate,
  buildAllocatedCategories,
  TASK_TEMPLATES,
} from "@/lib/domain/budget";

function makeToken(): string {
  return randomBytes(16).toString("hex");
}

function futureISODate(daysAhead: number): string {
  const dt = new Date(Date.now() + daysAhead * 86400 * 1000);
  return dt.toISOString().slice(0, 10);
}

export interface SeedResult {
  event: EventRecord;
  members: MemberRecord[];
  expenses: ExpenseRecord[];
}

export async function seedDemoEvent(
  repo: TayyariRepository
): Promise<SeedResult> {
  const existing = await repo.getDemoEvent();
  if (existing) {
    const [members, expenses] = await Promise.all([
      repo.listMembers(existing.id),
      repo.listExpenses(existing.id),
    ]);
    return { event: existing, members, expenses };
  }

  const eventDate = futureISODate(28);
  const event = await repo.createEvent({
    name: "Ananya & Rohan Engagement",
    type: "engagement",
    city: "Bengaluru",
    area: "Jayanagar",
    event_date: eventDate,
    language: "kn-IN",
    guest_count: 150,
    total_budget_inr: 120000,
    plan: "free",
    pass_expires_at: null,
    is_demo: true,
  });

  const meera = await repo.createMember({
    event_id: event.id,
    display_name: "Meera",
    role: "organizer",
    can_see_amounts: true,
    access_token: makeToken(),
    preferred_language: "en-IN",
  });
  const lakshmi = await repo.createMember({
    event_id: event.id,
    display_name: "Aunt Lakshmi",
    role: "decision_owner",
    can_see_amounts: true,
    access_token: makeToken(),
    preferred_language: "kn-IN",
  });
  const karthik = await repo.createMember({
    event_id: event.id,
    display_name: "Karthik",
    role: "helper",
    can_see_amounts: false,
    access_token: makeToken(),
    preferred_language: "kn-IN",
  });
  const ramesh = await repo.createMember({
    event_id: event.id,
    display_name: "Uncle Ramesh",
    role: "viewer",
    can_see_amounts: false,
    access_token: makeToken(),
    preferred_language: "hi-IN",
  });

  const splitCategories = buildAllocatedCategories("engagement", 120000);
  const createdCategories: CategoryRecord[] = [];
  for (const cat of splitCategories) {
    createdCategories.push(
      await repo.createCategory({
        event_id: event.id,
        name: cat.name,
        allocated_inr: cat.allocated_inr,
        sort: cat.sort,
      })
    );
  }

  const catByName = (name: string) =>
    createdCategories.find((c) => c.name === name)?.id ?? createdCategories[0].id;

  const expCatering = await repo.createExpense({
    event_id: event.id,
    category_id: catByName("Catering"),
    title: "Catering plates (veg festive lunch)",
    vendor_id: null,
    quantity: 150,
    unit_price_inr: 350,
    committed_inr: 52500,
    paid_inr: 15000,
    status: "committed",
    vendor_confirmation: "acknowledged",
    source: "demo_data",
    quote_date: futureISODate(-3),
    version: 1,
    note: "Demo data, not a local market quote",
  });

  const expVenue = await repo.createExpense({
    event_id: event.id,
    category_id: catByName("Venue"),
    title: "Engagement hall rental",
    vendor_id: null,
    quantity: 1,
    unit_price_inr: 30000,
    committed_inr: 30000,
    paid_inr: 10000,
    status: "committed",
    vendor_confirmation: "acknowledged",
    source: "demo_data",
    quote_date: futureISODate(-5),
    version: 1,
    note: "Demo data, not a local market quote",
  });

  const expDecor = await repo.createExpense({
    event_id: event.id,
    category_id: catByName("Decor"),
    title: "Floral mandap & entrance toran",
    vendor_id: null,
    quantity: 1,
    unit_price_inr: 15500,
    committed_inr: 15500,
    paid_inr: 0,
    status: "committed",
    vendor_confirmation: "pending",
    source: "demo_data",
    quote_date: futureISODate(-2),
    version: 1,
    note: "Demo data, not a local market quote",
  });

  const expPhoto = await repo.createExpense({
    event_id: event.id,
    category_id: catByName("Photo and video"),
    title: "Candid photography (half day)",
    vendor_id: null,
    quantity: 1,
    unit_price_inr: 10000,
    committed_inr: 10000,
    paid_inr: 0,
    status: "committed",
    vendor_confirmation: "pending",
    source: "demo_data",
    quote_date: futureISODate(-1),
    version: 1,
    note: "Demo data, not a local market quote",
  });

  const templates = TASK_TEMPLATES.engagement;
  const owners = [meera.id, karthik.id, lakshmi.id];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    await repo.createTask({
      event_id: event.id,
      title: t.title,
      owner_id: owners[i % owners.length],
      due_date: addDaysToISODate(eventDate, t.offsetDays),
      status: i < 2 ? "completed" : i < 5 ? "accepted" : "assigned",
      depends_on: null,
      source: "template",
      time_label: t.time_label ?? null,
      location_label: t.location_label ?? null,
    });
  }

  await repo.createGuest({
    event_id: event.id,
    name: "Sharada & Family",
    group_label: "Maternal relatives",
    count: 6,
    dietary_note: "No onion/garlic for 2 elders",
    rsvp: "yes",
  });
  await repo.createGuest({
    event_id: event.id,
    name: "Prakash & Friends",
    group_label: "Bengaluru neighbours",
    count: 4,
    dietary_note: "",
    rsvp: "yes",
  });

  await repo.createActivity({
    event_id: event.id,
    actor_id: meera.id,
    kind: "event_created",
    summary:
      "Loaded seeded demo engagement (Demo data, not a local market quote).",
    ref_id: event.id,
  });

  return {
    event,
    members: [meera, lakshmi, karthik, ramesh],
    expenses: [expCatering, expVenue, expDecor, expPhoto],
  };
}
