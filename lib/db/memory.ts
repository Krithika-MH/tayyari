import { randomUUID } from "crypto";
import type {
  ActivityRecord,
  AgentTurnRecord,
  CategoryRecord,
  EventRecord,
  ExpenseRecord,
  GuestRecord,
  LeftoverRecord,
  MemberRecord,
  MessageRecord,
  PlaceCandidate,
  ProposalRecord,
  QuoteRecord,
  TaskRecord,
  UsageKind,
  UsageRecord,
  VendorRecord,
} from "@/lib/contracts";
import type { TayyariRepository } from "@/lib/db/repository";

function nowISO(): string {
  return new Date().toISOString();
}

function todayIST(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

/**
 * In-memory repository for automated self-tests (`npm run selftest`)
 * and optional local testing when ENABLE_DEMO_MEMORY_DB=true.
 * Never used silently in place of Supabase.
 */
export class MemoryRepository implements TayyariRepository {
  readonly kind = "memory" as const;

  events: EventRecord[] = [];
  members: MemberRecord[] = [];
  categories: CategoryRecord[] = [];
  expenses: ExpenseRecord[] = [];
  tasks: TaskRecord[] = [];
  vendors: VendorRecord[] = [];
  quotes: QuoteRecord[] = [];
  proposals: ProposalRecord[] = [];
  leftovers: LeftoverRecord[] = [];
  messages: MessageRecord[] = [];
  agentTurns: AgentTurnRecord[] = [];
  activities: ActivityRecord[] = [];
  guests: GuestRecord[] = [];
  placeCache = new Map<string, { results: PlaceCandidate[]; fetched_at: string }>();
  usages: UsageRecord[] = [];

  async ping(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  async listEvents(): Promise<EventRecord[]> {
    return [...this.events].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }

  async getEvent(eventId: string): Promise<EventRecord | null> {
    return this.events.find((e) => e.id === eventId) ?? null;
  }

  async getDemoEvent(): Promise<EventRecord | null> {
    return this.events.find((e) => e.is_demo) ?? null;
  }

  async createEvent(
    input: Omit<EventRecord, "id" | "created_at">
  ): Promise<EventRecord> {
    const rec: EventRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.events.push(rec);
    return rec;
  }

  async updateEvent(
    eventId: string,
    patch: Partial<EventRecord>
  ): Promise<EventRecord | null> {
    const idx = this.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return null;
    this.events[idx] = { ...this.events[idx], ...patch };
    return this.events[idx];
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    this.events = this.events.filter((e) => e.id !== eventId);
    this.members = this.members.filter((r) => r.event_id !== eventId);
    this.categories = this.categories.filter((r) => r.event_id !== eventId);
    this.expenses = this.expenses.filter((r) => r.event_id !== eventId);
    this.tasks = this.tasks.filter((r) => r.event_id !== eventId);
    this.vendors = this.vendors.filter((r) => r.event_id !== eventId);
    this.quotes = this.quotes.filter((r) => r.event_id !== eventId);
    this.proposals = this.proposals.filter((r) => r.event_id !== eventId);
    this.leftovers = this.leftovers.filter((r) => r.event_id !== eventId);
    this.messages = this.messages.filter((r) => r.event_id !== eventId);
    this.agentTurns = this.agentTurns.filter((r) => r.event_id !== eventId);
    this.activities = this.activities.filter((r) => r.event_id !== eventId);
    this.guests = this.guests.filter((r) => r.event_id !== eventId);
    this.usages = this.usages.filter((r) => r.event_id !== eventId);
    return true;
  }

  async listMembers(eventId: string): Promise<MemberRecord[]> {
    return this.members.filter((m) => m.event_id === eventId);
  }

  async getMemberByToken(
    eventId: string,
    token: string
  ): Promise<MemberRecord | null> {
    return (
      this.members.find(
        (m) => m.event_id === eventId && m.access_token === token
      ) ?? null
    );
  }

  async getMemberById(
    eventId: string,
    memberId: string
  ): Promise<MemberRecord | null> {
    return (
      this.members.find(
        (m) => m.event_id === eventId && m.id === memberId
      ) ?? null
    );
  }

  async createMember(
    input: Omit<MemberRecord, "id" | "created_at">
  ): Promise<MemberRecord> {
    const rec: MemberRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.members.push(rec);
    return rec;
  }

  async listCategories(eventId: string): Promise<CategoryRecord[]> {
    return this.categories
      .filter((c) => c.event_id === eventId)
      .sort((a, b) => a.sort - b.sort);
  }

  async createCategory(
    input: Omit<CategoryRecord, "id" | "created_at">
  ): Promise<CategoryRecord> {
    const rec: CategoryRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.categories.push(rec);
    return rec;
  }

  async updateCategory(
    eventId: string,
    categoryId: string,
    patch: Partial<Pick<CategoryRecord, "name" | "allocated_inr" | "sort">>
  ): Promise<CategoryRecord | null> {
    const idx = this.categories.findIndex(
      (c) => c.event_id === eventId && c.id === categoryId
    );
    if (idx === -1) return null;
    this.categories[idx] = { ...this.categories[idx], ...patch };
    return this.categories[idx];
  }

  async deleteCategory(eventId: string, categoryId: string): Promise<boolean> {
    this.categories = this.categories.filter(
      (c) => !(c.event_id === eventId && c.id === categoryId)
    );
    return true;
  }

  async listExpenses(eventId: string): Promise<ExpenseRecord[]> {
    return this.expenses.filter((e) => e.event_id === eventId);
  }

  async getExpense(
    eventId: string,
    expenseId: string
  ): Promise<ExpenseRecord | null> {
    return (
      this.expenses.find(
        (e) => e.event_id === eventId && e.id === expenseId
      ) ?? null
    );
  }

  async createExpense(
    input: Omit<ExpenseRecord, "id" | "created_at">
  ): Promise<ExpenseRecord> {
    const rec: ExpenseRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.expenses.push(rec);
    return rec;
  }

  async updateExpense(
    eventId: string,
    expenseId: string,
    patch: Partial<ExpenseRecord>
  ): Promise<ExpenseRecord | null> {
    const idx = this.expenses.findIndex(
      (e) => e.event_id === eventId && e.id === expenseId
    );
    if (idx === -1) return null;
    this.expenses[idx] = { ...this.expenses[idx], ...patch };
    return this.expenses[idx];
  }

  async deleteExpense(eventId: string, expenseId: string): Promise<boolean> {
    this.expenses = this.expenses.filter(
      (e) => !(e.event_id === eventId && e.id === expenseId)
    );
    return true;
  }

  async listTasks(eventId: string): Promise<TaskRecord[]> {
    return this.tasks
      .filter((t) => t.event_id === eventId)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }

  async getTask(eventId: string, taskId: string): Promise<TaskRecord | null> {
    return (
      this.tasks.find((t) => t.event_id === eventId && t.id === taskId) ?? null
    );
  }

  async createTask(
    input: Omit<TaskRecord, "id" | "created_at">
  ): Promise<TaskRecord> {
    const rec: TaskRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.tasks.push(rec);
    return rec;
  }

  async updateTask(
    eventId: string,
    taskId: string,
    patch: Partial<TaskRecord>
  ): Promise<TaskRecord | null> {
    const idx = this.tasks.findIndex(
      (t) => t.event_id === eventId && t.id === taskId
    );
    if (idx === -1) return null;
    this.tasks[idx] = { ...this.tasks[idx], ...patch };
    return this.tasks[idx];
  }

  async deleteTask(eventId: string, taskId: string): Promise<boolean> {
    this.tasks = this.tasks.filter(
      (t) => !(t.event_id === eventId && t.id === taskId)
    );
    return true;
  }

  async listVendors(eventId: string): Promise<VendorRecord[]> {
    return this.vendors.filter((v) => v.event_id === eventId);
  }

  async upsertVendor(
    input: Omit<VendorRecord, "id" | "created_at">
  ): Promise<VendorRecord> {
    const idx = this.vendors.findIndex(
      (v) => v.event_id === input.event_id && v.place_id === input.place_id
    );
    if (idx !== -1) {
      this.vendors[idx] = { ...this.vendors[idx], ...input };
      return this.vendors[idx];
    }
    const rec: VendorRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.vendors.push(rec);
    return rec;
  }

  async updateVendor(
    eventId: string,
    vendorId: string,
    patch: Partial<Pick<VendorRecord, "shortlisted">>
  ): Promise<VendorRecord | null> {
    const idx = this.vendors.findIndex(
      (v) => v.event_id === eventId && v.id === vendorId
    );
    if (idx === -1) return null;
    this.vendors[idx] = { ...this.vendors[idx], ...patch };
    return this.vendors[idx];
  }

  async listQuotes(eventId: string): Promise<QuoteRecord[]> {
    return this.quotes
      .filter((q) => q.event_id === eventId)
      .sort((a, b) => a.amount_inr - b.amount_inr);
  }

  async createQuote(
    input: Omit<QuoteRecord, "id" | "created_at">
  ): Promise<QuoteRecord> {
    const rec: QuoteRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.quotes.push(rec);
    return rec;
  }

  async listProposals(eventId: string): Promise<ProposalRecord[]> {
    return this.proposals
      .filter((p) => p.event_id === eventId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getProposal(
    eventId: string,
    proposalId: string
  ): Promise<ProposalRecord | null> {
    return (
      this.proposals.find(
        (p) => p.event_id === eventId && p.id === proposalId
      ) ?? null
    );
  }

  async findProposalById(proposalId: string): Promise<ProposalRecord | null> {
    return this.proposals.find((p) => p.id === proposalId) ?? null;
  }

  async createProposal(
    input: Omit<ProposalRecord, "id" | "created_at">
  ): Promise<ProposalRecord> {
    const rec: ProposalRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.proposals.push(rec);
    return rec;
  }

  async updateProposal(
    eventId: string,
    proposalId: string,
    patch: Partial<ProposalRecord>
  ): Promise<ProposalRecord | null> {
    const idx = this.proposals.findIndex(
      (p) => p.event_id === eventId && p.id === proposalId
    );
    if (idx === -1) return null;
    this.proposals[idx] = { ...this.proposals[idx], ...patch };
    return this.proposals[idx];
  }

  async listLeftovers(eventId: string): Promise<LeftoverRecord[]> {
    return this.leftovers
      .filter((l) => l.event_id === eventId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getLeftover(
    eventId: string,
    leftoverId: string
  ): Promise<LeftoverRecord | null> {
    return (
      this.leftovers.find(
        (l) => l.event_id === eventId && l.id === leftoverId
      ) ?? null
    );
  }

  async findLeftoverById(leftoverId: string): Promise<LeftoverRecord | null> {
    return this.leftovers.find((l) => l.id === leftoverId) ?? null;
  }

  async createLeftover(
    input: Omit<LeftoverRecord, "id" | "created_at">
  ): Promise<LeftoverRecord> {
    const rec: LeftoverRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.leftovers.push(rec);
    return rec;
  }

  async updateLeftover(
    eventId: string,
    leftoverId: string,
    patch: Partial<LeftoverRecord>
  ): Promise<LeftoverRecord | null> {
    const idx = this.leftovers.findIndex(
      (l) => l.event_id === eventId && l.id === leftoverId
    );
    if (idx === -1) return null;
    this.leftovers[idx] = { ...this.leftovers[idx], ...patch };
    return this.leftovers[idx];
  }

  async listMessages(eventId: string): Promise<MessageRecord[]> {
    return this.messages
      .filter((m) => m.event_id === eventId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createMessage(
    input: Omit<MessageRecord, "id" | "created_at">
  ): Promise<MessageRecord> {
    const rec: MessageRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.messages.push(rec);
    return rec;
  }

  async updateMessage(
    eventId: string,
    messageId: string,
    patch: Partial<Pick<MessageRecord, "body" | "status">>
  ): Promise<MessageRecord | null> {
    const idx = this.messages.findIndex(
      (m) => m.event_id === eventId && m.id === messageId
    );
    if (idx === -1) return null;
    this.messages[idx] = { ...this.messages[idx], ...patch };
    return this.messages[idx];
  }

  async listAgentTurns(
    eventId: string,
    memberId: string,
    limit = 20
  ): Promise<AgentTurnRecord[]> {
    return this.agentTurns
      .filter((t) => t.event_id === eventId && t.member_id === memberId)
      .slice(-limit);
  }

  async getAgentTurn(
    eventId: string,
    turnId: string
  ): Promise<AgentTurnRecord | null> {
    return (
      this.agentTurns.find(
        (t) => t.event_id === eventId && t.id === turnId
      ) ?? null
    );
  }

  async createAgentTurn(
    input: Omit<AgentTurnRecord, "id" | "created_at">
  ): Promise<AgentTurnRecord> {
    const rec: AgentTurnRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.agentTurns.push(rec);
    return rec;
  }

  async updateAgentTurn(
    eventId: string,
    turnId: string,
    patch: Partial<Pick<AgentTurnRecord, "action_status" | "pending_action">>
  ): Promise<AgentTurnRecord | null> {
    const idx = this.agentTurns.findIndex(
      (t) => t.event_id === eventId && t.id === turnId
    );
    if (idx === -1) return null;
    this.agentTurns[idx] = { ...this.agentTurns[idx], ...patch };
    return this.agentTurns[idx];
  }

  async listActivity(eventId: string, limit = 25): Promise<ActivityRecord[]> {
    return this.activities
      .filter((a) => a.event_id === eventId)
      .slice(-limit)
      .reverse();
  }

  async createActivity(
    input: Omit<ActivityRecord, "id" | "created_at">
  ): Promise<ActivityRecord> {
    const rec: ActivityRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.activities.push(rec);
    return rec;
  }

  async listGuests(eventId: string): Promise<GuestRecord[]> {
    return this.guests.filter((g) => g.event_id === eventId);
  }

  async createGuest(
    input: Omit<GuestRecord, "id" | "created_at">
  ): Promise<GuestRecord> {
    const rec: GuestRecord = {
      ...input,
      id: randomUUID(),
      created_at: nowISO(),
    };
    this.guests.push(rec);
    return rec;
  }

  async updateGuest(
    eventId: string,
    guestId: string,
    patch: Partial<Pick<GuestRecord, "rsvp" | "count" | "dietary_note">>
  ): Promise<GuestRecord | null> {
    const idx = this.guests.findIndex(
      (g) => g.event_id === eventId && g.id === guestId
    );
    if (idx === -1) return null;
    this.guests[idx] = { ...this.guests[idx], ...patch };
    return this.guests[idx];
  }

  async getPlaceCache(
    queryKey: string
  ): Promise<{ results: PlaceCandidate[]; fetched_at: string } | null> {
    return this.placeCache.get(queryKey) ?? null;
  }

  async setPlaceCache(
    queryKey: string,
    results: PlaceCandidate[]
  ): Promise<void> {
    this.placeCache.set(queryKey, { results, fetched_at: nowISO() });
  }

  async getUsageTotal(eventId: string, kind: UsageKind): Promise<number> {
    return this.usages
      .filter((u) => u.event_id === eventId && u.kind === kind)
      .reduce((s, u) => s + u.count, 0);
  }

  async getUsageToday(eventId: string, kind: UsageKind): Promise<number> {
    const day = todayIST();
    return (
      this.usages.find(
        (u) => u.event_id === eventId && u.kind === kind && u.day === day
      )?.count ?? 0
    );
  }

  async incrementUsage(eventId: string, kind: UsageKind): Promise<UsageRecord> {
    const day = todayIST();
    const existing = this.usages.find(
      (u) => u.event_id === eventId && u.kind === kind && u.day === day
    );
    if (existing) {
      existing.count += 1;
      return existing;
    }
    const rec: UsageRecord = {
      id: randomUUID(),
      created_at: nowISO(),
      event_id: eventId,
      kind,
      day,
      count: 1,
    };
    this.usages.push(rec);
    return rec;
  }

  async getAllUsageTotals(eventId: string): Promise<Record<UsageKind, number>> {
    const totals: Record<UsageKind, number> = {
      speech: 0,
      agent: 0,
      search: 0,
      leftover: 0,
    };
    for (const u of this.usages.filter((r) => r.event_id === eventId)) {
      totals[u.kind] += u.count;
    }
    return totals;
  }
}
