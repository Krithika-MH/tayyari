import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

function todayIST(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

export class SupabaseRepository implements TayyariRepository {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ping(): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.from("events").select("id").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async listEvents(): Promise<EventRecord[]> {
    const { data, error } = await this.client
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as EventRecord[];
  }

  async getEvent(eventId: string): Promise<EventRecord | null> {
    const { data, error } = await this.client
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as EventRecord | null) ?? null;
  }

  async getDemoEvent(): Promise<EventRecord | null> {
    const { data, error } = await this.client
      .from("events")
      .select("*")
      .eq("is_demo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as EventRecord | null) ?? null;
  }

  async createEvent(
    input: Omit<EventRecord, "id" | "created_at">
  ): Promise<EventRecord> {
    const { data, error } = await this.client
      .from("events")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as EventRecord;
  }

  async updateEvent(
    eventId: string,
    patch: Partial<EventRecord>
  ): Promise<EventRecord | null> {
    const { data, error } = await this.client
      .from("events")
      .update(patch)
      .eq("id", eventId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as EventRecord | null) ?? null;
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const { error } = await this.client.from("events").delete().eq("id", eventId);
    if (error) throw new Error(error.message);
    return true;
  }

  async listMembers(eventId: string): Promise<MemberRecord[]> {
    const { data, error } = await this.client
      .from("members")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MemberRecord[];
  }

  async getMemberByToken(
    eventId: string,
    token: string
  ): Promise<MemberRecord | null> {
    const { data, error } = await this.client
      .from("members")
      .select("*")
      .eq("event_id", eventId)
      .eq("access_token", token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MemberRecord | null) ?? null;
  }

  async getMemberById(
    eventId: string,
    memberId: string
  ): Promise<MemberRecord | null> {
    const { data, error } = await this.client
      .from("members")
      .select("*")
      .eq("event_id", eventId)
      .eq("id", memberId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MemberRecord | null) ?? null;
  }

  async createMember(
    input: Omit<MemberRecord, "id" | "created_at">
  ): Promise<MemberRecord> {
    const { data, error } = await this.client
      .from("members")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as MemberRecord;
  }

  async listCategories(eventId: string): Promise<CategoryRecord[]> {
    const { data, error } = await this.client
      .from("categories")
      .select("*")
      .eq("event_id", eventId)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CategoryRecord[];
  }

  async createCategory(
    input: Omit<CategoryRecord, "id" | "created_at">
  ): Promise<CategoryRecord> {
    const { data, error } = await this.client
      .from("categories")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as CategoryRecord;
  }

  async updateCategory(
    eventId: string,
    categoryId: string,
    patch: Partial<Pick<CategoryRecord, "name" | "allocated_inr" | "sort">>
  ): Promise<CategoryRecord | null> {
    const { data, error } = await this.client
      .from("categories")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", categoryId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CategoryRecord | null) ?? null;
  }

  async deleteCategory(eventId: string, categoryId: string): Promise<boolean> {
    const { error } = await this.client
      .from("categories")
      .delete()
      .eq("event_id", eventId)
      .eq("id", categoryId);
    if (error) throw new Error(error.message);
    return true;
  }

  async listExpenses(eventId: string): Promise<ExpenseRecord[]> {
    const { data, error } = await this.client
      .from("expenses")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ExpenseRecord[];
  }

  async getExpense(
    eventId: string,
    expenseId: string
  ): Promise<ExpenseRecord | null> {
    const { data, error } = await this.client
      .from("expenses")
      .select("*")
      .eq("event_id", eventId)
      .eq("id", expenseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ExpenseRecord | null) ?? null;
  }

  async createExpense(
    input: Omit<ExpenseRecord, "id" | "created_at">
  ): Promise<ExpenseRecord> {
    const { data, error } = await this.client
      .from("expenses")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as ExpenseRecord;
  }

  async updateExpense(
    eventId: string,
    expenseId: string,
    patch: Partial<ExpenseRecord>
  ): Promise<ExpenseRecord | null> {
    const { data, error } = await this.client
      .from("expenses")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", expenseId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ExpenseRecord | null) ?? null;
  }

  async deleteExpense(eventId: string, expenseId: string): Promise<boolean> {
    const { error } = await this.client
      .from("expenses")
      .delete()
      .eq("event_id", eventId)
      .eq("id", expenseId);
    if (error) throw new Error(error.message);
    return true;
  }

  async listTasks(eventId: string): Promise<TaskRecord[]> {
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("event_id", eventId)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TaskRecord[];
  }

  async getTask(eventId: string, taskId: string): Promise<TaskRecord | null> {
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("event_id", eventId)
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as TaskRecord | null) ?? null;
  }

  async createTask(
    input: Omit<TaskRecord, "id" | "created_at">
  ): Promise<TaskRecord> {
    const { data, error } = await this.client
      .from("tasks")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as TaskRecord;
  }

  async updateTask(
    eventId: string,
    taskId: string,
    patch: Partial<TaskRecord>
  ): Promise<TaskRecord | null> {
    const { data, error } = await this.client
      .from("tasks")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", taskId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as TaskRecord | null) ?? null;
  }

  async deleteTask(eventId: string, taskId: string): Promise<boolean> {
    const { error } = await this.client
      .from("tasks")
      .delete()
      .eq("event_id", eventId)
      .eq("id", taskId);
    if (error) throw new Error(error.message);
    return true;
  }

  async listVendors(eventId: string): Promise<VendorRecord[]> {
    const { data, error } = await this.client
      .from("vendors")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as VendorRecord[];
  }

  async upsertVendor(
    input: Omit<VendorRecord, "id" | "created_at">
  ): Promise<VendorRecord> {
    const { data, error } = await this.client
      .from("vendors")
      .upsert(input, { onConflict: "event_id,place_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as VendorRecord;
  }

  async updateVendor(
    eventId: string,
    vendorId: string,
    patch: Partial<Pick<VendorRecord, "shortlisted">>
  ): Promise<VendorRecord | null> {
    const { data, error } = await this.client
      .from("vendors")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", vendorId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as VendorRecord | null) ?? null;
  }

  async listQuotes(eventId: string): Promise<QuoteRecord[]> {
    const { data, error } = await this.client
      .from("quotes")
      .select("*")
      .eq("event_id", eventId)
      .order("amount_inr", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as QuoteRecord[];
  }

  async createQuote(
    input: Omit<QuoteRecord, "id" | "created_at">
  ): Promise<QuoteRecord> {
    const { data, error } = await this.client
      .from("quotes")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as QuoteRecord;
  }

  async listProposals(eventId: string): Promise<ProposalRecord[]> {
    const { data, error } = await this.client
      .from("proposals")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProposalRecord[];
  }

  async getProposal(
    eventId: string,
    proposalId: string
  ): Promise<ProposalRecord | null> {
    const { data, error } = await this.client
      .from("proposals")
      .select("*")
      .eq("event_id", eventId)
      .eq("id", proposalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ProposalRecord | null) ?? null;
  }

  async findProposalById(proposalId: string): Promise<ProposalRecord | null> {
    const { data, error } = await this.client
      .from("proposals")
      .select("*")
      .eq("id", proposalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ProposalRecord | null) ?? null;
  }

  async createProposal(
    input: Omit<ProposalRecord, "id" | "created_at">
  ): Promise<ProposalRecord> {
    const { data, error } = await this.client
      .from("proposals")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as ProposalRecord;
  }

  async updateProposal(
    eventId: string,
    proposalId: string,
    patch: Partial<ProposalRecord>
  ): Promise<ProposalRecord | null> {
    const { data, error } = await this.client
      .from("proposals")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", proposalId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ProposalRecord | null) ?? null;
  }

  async listLeftovers(eventId: string): Promise<LeftoverRecord[]> {
    const { data, error } = await this.client
      .from("leftovers")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as LeftoverRecord[];
  }

  async getLeftover(
    eventId: string,
    leftoverId: string
  ): Promise<LeftoverRecord | null> {
    const { data, error } = await this.client
      .from("leftovers")
      .select("*")
      .eq("event_id", eventId)
      .eq("id", leftoverId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as LeftoverRecord | null) ?? null;
  }

  async findLeftoverById(leftoverId: string): Promise<LeftoverRecord | null> {
    const { data, error } = await this.client
      .from("leftovers")
      .select("*")
      .eq("id", leftoverId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as LeftoverRecord | null) ?? null;
  }

  async createLeftover(
    input: Omit<LeftoverRecord, "id" | "created_at">
  ): Promise<LeftoverRecord> {
    const { data, error } = await this.client
      .from("leftovers")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as LeftoverRecord;
  }

  async updateLeftover(
    eventId: string,
    leftoverId: string,
    patch: Partial<LeftoverRecord>
  ): Promise<LeftoverRecord | null> {
    const { data, error } = await this.client
      .from("leftovers")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", leftoverId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as LeftoverRecord | null) ?? null;
  }

  async listMessages(eventId: string): Promise<MessageRecord[]> {
    const { data, error } = await this.client
      .from("messages")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MessageRecord[];
  }

  async createMessage(
    input: Omit<MessageRecord, "id" | "created_at">
  ): Promise<MessageRecord> {
    const { data, error } = await this.client
      .from("messages")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as MessageRecord;
  }

  async updateMessage(
    eventId: string,
    messageId: string,
    patch: Partial<Pick<MessageRecord, "body" | "status">>
  ): Promise<MessageRecord | null> {
    const { data, error } = await this.client
      .from("messages")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", messageId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MessageRecord | null) ?? null;
  }

  async listAgentTurns(
    eventId: string,
    memberId: string,
    limit = 20
  ): Promise<AgentTurnRecord[]> {
    const { data, error } = await this.client
      .from("agent_turns")
      .select("*")
      .eq("event_id", eventId)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as AgentTurnRecord[]).reverse();
  }

  async getAgentTurn(
    eventId: string,
    turnId: string
  ): Promise<AgentTurnRecord | null> {
    const { data, error } = await this.client
      .from("agent_turns")
      .select("*")
      .eq("event_id", eventId)
      .eq("id", turnId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AgentTurnRecord | null) ?? null;
  }

  async createAgentTurn(
    input: Omit<AgentTurnRecord, "id" | "created_at">
  ): Promise<AgentTurnRecord> {
    const { data, error } = await this.client
      .from("agent_turns")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as AgentTurnRecord;
  }

  async updateAgentTurn(
    eventId: string,
    turnId: string,
    patch: Partial<Pick<AgentTurnRecord, "action_status" | "pending_action">>
  ): Promise<AgentTurnRecord | null> {
    const { data, error } = await this.client
      .from("agent_turns")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", turnId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AgentTurnRecord | null) ?? null;
  }

  async listActivity(eventId: string, limit = 25): Promise<ActivityRecord[]> {
    const { data, error } = await this.client
      .from("activity")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityRecord[];
  }

  async createActivity(
    input: Omit<ActivityRecord, "id" | "created_at">
  ): Promise<ActivityRecord> {
    const { data, error } = await this.client
      .from("activity")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as ActivityRecord;
  }

  async listGuests(eventId: string): Promise<GuestRecord[]> {
    const { data, error } = await this.client
      .from("guests")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as GuestRecord[];
  }

  async createGuest(
    input: Omit<GuestRecord, "id" | "created_at">
  ): Promise<GuestRecord> {
    const { data, error } = await this.client
      .from("guests")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as GuestRecord;
  }

  async updateGuest(
    eventId: string,
    guestId: string,
    patch: Partial<Pick<GuestRecord, "rsvp" | "count" | "dietary_note">>
  ): Promise<GuestRecord | null> {
    const { data, error } = await this.client
      .from("guests")
      .update(patch)
      .eq("event_id", eventId)
      .eq("id", guestId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GuestRecord | null) ?? null;
  }

  async getPlaceCache(
    queryKey: string
  ): Promise<{ results: PlaceCandidate[]; fetched_at: string } | null> {
    const { data, error } = await this.client
      .from("place_cache")
      .select("results, fetched_at")
      .eq("query_key", queryKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return data as { results: PlaceCandidate[]; fetched_at: string };
  }

  async setPlaceCache(
    queryKey: string,
    results: PlaceCandidate[]
  ): Promise<void> {
    const { error } = await this.client.from("place_cache").upsert(
      {
        query_key: queryKey,
        results,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "query_key" }
    );
    if (error) throw new Error(error.message);
  }

  async getUsageTotal(eventId: string, kind: UsageKind): Promise<number> {
    const { data, error } = await this.client
      .from("usage")
      .select("count")
      .eq("event_id", eventId)
      .eq("kind", kind);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  }

  async getUsageToday(eventId: string, kind: UsageKind): Promise<number> {
    const day = todayIST();
    const { data, error } = await this.client
      .from("usage")
      .select("count")
      .eq("event_id", eventId)
      .eq("kind", kind)
      .eq("day", day)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Number(data?.count ?? 0);
  }

  async incrementUsage(eventId: string, kind: UsageKind): Promise<UsageRecord> {
    const day = todayIST();
    const { data: existing, error: fetchErr } = await this.client
      .from("usage")
      .select("*")
      .eq("event_id", eventId)
      .eq("kind", kind)
      .eq("day", day)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);

    if (existing) {
      const { data, error } = await this.client
        .from("usage")
        .update({ count: Number(existing.count) + 1 })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as UsageRecord;
    }

    const { data, error } = await this.client
      .from("usage")
      .insert({ event_id: eventId, kind, day, count: 1 })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as UsageRecord;
  }

  async getAllUsageTotals(eventId: string): Promise<Record<UsageKind, number>> {
    const { data, error } = await this.client
      .from("usage")
      .select("kind, count")
      .eq("event_id", eventId);
    if (error) throw new Error(error.message);
    const totals: Record<UsageKind, number> = {
      speech: 0,
      agent: 0,
      search: 0,
      leftover: 0,
    };
    for (const row of data ?? []) {
      const k = row.kind as UsageKind;
      if (k in totals) totals[k] += Number(row.count) || 0;
    }
    return totals;
  }
}
