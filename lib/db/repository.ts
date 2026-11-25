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
import { SupabaseRepository } from "@/lib/db/supabase";
import { MemoryRepository } from "@/lib/db/memory";

export interface TayyariRepository {
  readonly kind: "supabase" | "memory";

  // Health
  ping(): Promise<{ ok: boolean; error?: string }>;

  // Events
  listEvents(): Promise<EventRecord[]>;
  getEvent(eventId: string): Promise<EventRecord | null>;
  getDemoEvent(): Promise<EventRecord | null>;
  createEvent(input: Omit<EventRecord, "id" | "created_at">): Promise<EventRecord>;
  updateEvent(
    eventId: string,
    patch: Partial<
      Pick<
        EventRecord,
        | "name"
        | "city"
        | "area"
        | "event_date"
        | "language"
        | "guest_count"
        | "total_budget_inr"
        | "plan"
        | "pass_expires_at"
      >
    >
  ): Promise<EventRecord | null>;
  deleteEvent(eventId: string): Promise<boolean>;

  // Members
  listMembers(eventId: string): Promise<MemberRecord[]>;
  getMemberByToken(eventId: string, token: string): Promise<MemberRecord | null>;
  getMemberById(eventId: string, memberId: string): Promise<MemberRecord | null>;
  createMember(input: Omit<MemberRecord, "id" | "created_at">): Promise<MemberRecord>;

  // Categories
  listCategories(eventId: string): Promise<CategoryRecord[]>;
  createCategory(input: Omit<CategoryRecord, "id" | "created_at">): Promise<CategoryRecord>;
  updateCategory(
    eventId: string,
    categoryId: string,
    patch: Partial<Pick<CategoryRecord, "name" | "allocated_inr" | "sort">>
  ): Promise<CategoryRecord | null>;
  deleteCategory(eventId: string, categoryId: string): Promise<boolean>;

  // Expenses
  listExpenses(eventId: string): Promise<ExpenseRecord[]>;
  getExpense(eventId: string, expenseId: string): Promise<ExpenseRecord | null>;
  createExpense(input: Omit<ExpenseRecord, "id" | "created_at">): Promise<ExpenseRecord>;
  updateExpense(
    eventId: string,
    expenseId: string,
    patch: Partial<ExpenseRecord>
  ): Promise<ExpenseRecord | null>;
  deleteExpense(eventId: string, expenseId: string): Promise<boolean>;

  // Tasks
  listTasks(eventId: string): Promise<TaskRecord[]>;
  getTask(eventId: string, taskId: string): Promise<TaskRecord | null>;
  createTask(input: Omit<TaskRecord, "id" | "created_at">): Promise<TaskRecord>;
  updateTask(
    eventId: string,
    taskId: string,
    patch: Partial<TaskRecord>
  ): Promise<TaskRecord | null>;
  deleteTask(eventId: string, taskId: string): Promise<boolean>;

  // Vendors & Quotes
  listVendors(eventId: string): Promise<VendorRecord[]>;
  upsertVendor(input: Omit<VendorRecord, "id" | "created_at">): Promise<VendorRecord>;
  updateVendor(
    eventId: string,
    vendorId: string,
    patch: Partial<Pick<VendorRecord, "shortlisted">>
  ): Promise<VendorRecord | null>;
  listQuotes(eventId: string): Promise<QuoteRecord[]>;
  createQuote(input: Omit<QuoteRecord, "id" | "created_at">): Promise<QuoteRecord>;

  // Proposals
  listProposals(eventId: string): Promise<ProposalRecord[]>;
  getProposal(eventId: string, proposalId: string): Promise<ProposalRecord | null>;
  findProposalById(proposalId: string): Promise<ProposalRecord | null>;
  createProposal(input: Omit<ProposalRecord, "id" | "created_at">): Promise<ProposalRecord>;
  updateProposal(
    eventId: string,
    proposalId: string,
    patch: Partial<ProposalRecord>
  ): Promise<ProposalRecord | null>;

  // Leftovers
  listLeftovers(eventId: string): Promise<LeftoverRecord[]>;
  getLeftover(eventId: string, leftoverId: string): Promise<LeftoverRecord | null>;
  findLeftoverById(leftoverId: string): Promise<LeftoverRecord | null>;
  createLeftover(input: Omit<LeftoverRecord, "id" | "created_at">): Promise<LeftoverRecord>;
  updateLeftover(
    eventId: string,
    leftoverId: string,
    patch: Partial<LeftoverRecord>
  ): Promise<LeftoverRecord | null>;

  // Messages
  listMessages(eventId: string): Promise<MessageRecord[]>;
  createMessage(input: Omit<MessageRecord, "id" | "created_at">): Promise<MessageRecord>;
  updateMessage(
    eventId: string,
    messageId: string,
    patch: Partial<Pick<MessageRecord, "body" | "status">>
  ): Promise<MessageRecord | null>;

  // Agent turns
  listAgentTurns(eventId: string, memberId: string, limit?: number): Promise<AgentTurnRecord[]>;
  getAgentTurn(eventId: string, turnId: string): Promise<AgentTurnRecord | null>;
  createAgentTurn(input: Omit<AgentTurnRecord, "id" | "created_at">): Promise<AgentTurnRecord>;
  updateAgentTurn(
    eventId: string,
    turnId: string,
    patch: Partial<Pick<AgentTurnRecord, "action_status" | "pending_action">>
  ): Promise<AgentTurnRecord | null>;

  // Activity
  listActivity(eventId: string, limit?: number): Promise<ActivityRecord[]>;
  createActivity(input: Omit<ActivityRecord, "id" | "created_at">): Promise<ActivityRecord>;

  // Guests
  listGuests(eventId: string): Promise<GuestRecord[]>;
  createGuest(input: Omit<GuestRecord, "id" | "created_at">): Promise<GuestRecord>;
  updateGuest(
    eventId: string,
    guestId: string,
    patch: Partial<Pick<GuestRecord, "rsvp" | "count" | "dietary_note">>
  ): Promise<GuestRecord | null>;

  // Place cache
  getPlaceCache(queryKey: string): Promise<{ results: PlaceCandidate[]; fetched_at: string } | null>;
  setPlaceCache(queryKey: string, results: PlaceCandidate[]): Promise<void>;

  // Usage & rate limit
  getUsageTotal(eventId: string, kind: UsageKind): Promise<number>;
  getUsageToday(eventId: string, kind: UsageKind): Promise<number>;
  incrementUsage(eventId: string, kind: UsageKind): Promise<UsageRecord>;
  getAllUsageTotals(eventId: string): Promise<Record<UsageKind, number>>;
}

let cachedRepo: TayyariRepository | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

export function getRepository(): TayyariRepository {
  if (cachedRepo) return cachedRepo;
  if (isSupabaseConfigured()) {
    cachedRepo = new SupabaseRepository(
      process.env.SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
    );
    return cachedRepo;
  }
  if (process.env.ENABLE_DEMO_MEMORY_DB === "true") {
    cachedRepo = new MemoryRepository();
    return cachedRepo;
  }
  throw new Error(
    "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables."
  );
}

export function setRepositoryForTests(repo: TayyariRepository | null): void {
  cachedRepo = repo;
}
