import { z } from "zod";

// ---------------------------------------------------------------------------
// Core Enums & Constants
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  "wedding",
  "engagement",
  "birthday",
  "festival",
  "housewarming",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const LANGUAGES = ["en-IN", "kn-IN", "hi-IN"] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const MEMBER_ROLES = [
  "organizer",
  "decision_owner",
  "helper",
  "viewer",
] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const EXPENSE_STATUSES = [
  "estimate",
  "quoted",
  "committed",
  "paid",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const VENDOR_CONFIRMATION_STATES = [
  "not_applicable",
  "pending",
  "acknowledged",
] as const;
export type VendorConfirmationState = (typeof VENDOR_CONFIRMATION_STATES)[number];

export const EXPENSE_SOURCES = ["user_quote", "demo_data", "estimate"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export const TASK_STATUSES = [
  "assigned",
  "accepted",
  "completed",
  "declined",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = [
  "template",
  "user",
  "agent",
  "proposal",
] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const PROPOSAL_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "expired",
  "stale",
  "failed_to_dispatch",
  "needs_discussion",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const LEFTOVER_STATUSES = [
  "logged",
  "outreach_pending_approval",
  "outreach_approved",
  "contacted",
  "accepted",
  "declined",
  "collected",
  "not_collected",
] as const;
export type LeftoverStatus = (typeof LEFTOVER_STATUSES)[number];

export const MESSAGE_RECIPIENT_TYPES = [
  "vendor",
  "relative",
  "helper",
  "ngo",
] as const;
export type MessageRecipientType = (typeof MESSAGE_RECIPIENT_TYPES)[number];

export const MESSAGE_STATUSES = ["prepared", "copied", "shared"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const USAGE_KINDS = ["speech", "agent", "search", "leftover"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export const VENDOR_CATEGORIES = [
  "caterers",
  "decorators",
  "venues",
  "photographers",
  "flowers",
  "sweets",
  "return_gifts",
  "rentals",
  "cake_shops",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Domain Entities
// ---------------------------------------------------------------------------

export interface EventRecord {
  id: string;
  created_at: string;
  name: string;
  type: EventType;
  city: string;
  area: string;
  event_date: string;
  language: LanguageCode;
  guest_count: number;
  total_budget_inr: number;
  plan: "free" | "pass";
  pass_expires_at: string | null;
  is_demo: boolean;
}

export interface MemberRecord {
  id: string;
  created_at: string;
  event_id: string;
  display_name: string;
  role: MemberRole;
  can_see_amounts: boolean;
  access_token: string;
  preferred_language: LanguageCode;
}

export interface CategoryRecord {
  id: string;
  created_at: string;
  event_id: string;
  name: string;
  allocated_inr: number;
  sort: number;
}

export interface ExpenseRecord {
  id: string;
  created_at: string;
  event_id: string;
  category_id: string;
  title: string;
  vendor_id: string | null;
  quantity: number;
  unit_price_inr: number | null;
  committed_inr: number;
  paid_inr: number;
  status: ExpenseStatus;
  vendor_confirmation: VendorConfirmationState;
  source: ExpenseSource;
  quote_date: string | null;
  version: number;
  note: string;
}

export interface TaskRecord {
  id: string;
  created_at: string;
  event_id: string;
  title: string;
  owner_id: string | null;
  due_date: string;
  status: TaskStatus;
  depends_on: string | null;
  source: TaskSource;
  time_label: string | null;
  location_label: string | null;
}

export interface VendorRecord {
  id: string;
  created_at: string;
  event_id: string;
  category: string;
  name: string;
  phone: string | null;
  address: string;
  rating: number | null;
  user_rating_count: number | null;
  maps_url: string;
  place_id: string;
  shortlisted: boolean;
  source: "places" | "sample";
  fetched_at: string;
}

export interface QuoteRecord {
  id: string;
  created_at: string;
  event_id: string;
  vendor_id: string;
  amount_inr: number;
  unit_label: string;
  inclusions: string;
  exclusions: string;
  valid_till: string | null;
  entered_by: string | null;
  quote_date: string;
}

export interface ImpactReport {
  status: "ok" | "missing_price";
  baselineCommittedINR: number;
  deltaINR: number | null;
  projectedCommittedINR: number | null;
  overUnderBudgetINR: number | null;
  alternativeSample?: {
    quantity: number;
    deltaINR: number;
    projectedCommittedINR: number;
    overUnderBudgetINR: number;
  } | null;
  assumptions: string[];
}

export interface HistoryEntry {
  at: string;
  actor: string;
  event: string;
  note?: string;
}

export interface ProposalRecord {
  id: string;
  created_at: string;
  event_id: string;
  expense_id: string;
  baseline_version: number;
  baseline_unit_price_inr: number | null;
  field: "quantity";
  previous_value: number;
  requested_value: number;
  requested_by: string | null;
  source_text: string;
  source_language: LanguageCode;
  status: ProposalStatus;
  decision_owner_id: string | null;
  task_owner_id: string | null;
  impact: ImpactReport;
  workflow_ref: string | null;
  idempotency_keys: string[];
  history: HistoryEntry[];
}

export interface LeftoverRecord {
  id: string;
  created_at: string;
  event_id: string;
  food_type: string;
  approx_portions: number;
  served_at: string;
  storage_notes: string;
  allergen_notes: string | null;
  pickup_location: string;
  ngo_place_id: string | null;
  ngo_name: string | null;
  ngo_phone: string | null;
  ngo_maps_url: string | null;
  status: LeftoverStatus;
  workflow_ref: string | null;
  idempotency_keys: string[];
  history: HistoryEntry[];
}

export interface MessageRecord {
  id: string;
  created_at: string;
  event_id: string;
  to_type: MessageRecipientType;
  to_name: string;
  purpose: string;
  language: LanguageCode;
  body: string;
  status: MessageStatus;
  created_by: string | null;
}

export interface ProposedAgentAction {
  tool:
    | "add_expense"
    | "create_task"
    | "add_vendor_to_shortlist"
    | "draft_message"
    | "create_change_proposal";
  label: string;
  args: Record<string, unknown>;
}

export interface AgentTurnRecord {
  id: string;
  created_at: string;
  event_id: string;
  member_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_name: string | null;
  tool_args: Record<string, unknown> | null;
  tool_result: Record<string, unknown> | null;
  pending_action: ProposedAgentAction | null;
  action_status: "none" | "pending" | "confirmed" | "dismissed";
}

export interface ActivityRecord {
  id: string;
  created_at: string;
  event_id: string;
  actor_id: string | null;
  kind: string;
  summary: string;
  ref_id: string | null;
}

export interface GuestRecord {
  id: string;
  created_at: string;
  event_id: string;
  name: string;
  group_label: string;
  count: number;
  dietary_note: string;
  rsvp: "unknown" | "yes" | "no";
}

export interface UsageRecord {
  id: string;
  created_at: string;
  event_id: string;
  kind: UsageKind;
  day: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Flagsmith & Plan Limits
// ---------------------------------------------------------------------------

export const PlanTierLimitSchema = z.object({
  members: z.number().int().positive(),
  voice_requests: z.number().int().positive(),
  agent_messages: z.number().int().positive(),
  vendor_searches: z.number().int().positive(),
  leftover_outreach: z.number().int().positive(),
});

export const PlanLimitsConfigSchema = z.object({
  free: PlanTierLimitSchema,
  pass_30: PlanTierLimitSchema,
  pass_60: PlanTierLimitSchema,
});

export type PlanTierLimits = z.infer<typeof PlanTierLimitSchema>;
export type PlanLimitsConfig = z.infer<typeof PlanLimitsConfigSchema>;

export const DEFAULT_PLAN_LIMITS: PlanLimitsConfig = {
  free: {
    members: 4,
    voice_requests: 5,
    agent_messages: 20,
    vendor_searches: 10,
    leftover_outreach: 1,
  },
  pass_30: {
    members: 15,
    voice_requests: 60,
    agent_messages: 300,
    vendor_searches: 100,
    leftover_outreach: 3,
  },
  pass_60: {
    members: 25,
    voice_requests: 120,
    agent_messages: 600,
    vendor_searches: 200,
    leftover_outreach: 3,
  },
};

export interface EventFlags {
  decision_card_style: "impact_first" | "compact";
  module_vendor_finder: boolean;
  module_leftover_food: boolean;
  module_planning_agent: boolean;
  free_voice_requests_limit: number;
  free_agent_messages_limit: number;
  plan_limits: PlanLimitsConfig;
  source: "flagsmith" | "defaults";
  refreshed_at: string;
  warning?: string;
}

export const DEFAULT_EVENT_FLAGS: Omit<EventFlags, "refreshed_at"> = {
  decision_card_style: "impact_first",
  module_vendor_finder: true,
  module_leftover_food: true,
  module_planning_agent: true,
  free_voice_requests_limit: 5,
  free_agent_messages_limit: 20,
  plan_limits: DEFAULT_PLAN_LIMITS,
  source: "defaults",
};

// ---------------------------------------------------------------------------
// Zod Input & Output Schemas
// ---------------------------------------------------------------------------

export const CreateEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(EVENT_TYPES),
  city: z.string().trim().min(2).max(80),
  area: z.string().trim().max(80).default(""),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language: z.enum(LANGUAGES).default("en-IN"),
  guest_count: z.number().int().min(1).max(10000),
  total_budget_inr: z.number().int().min(0).max(100000000),
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        allocated_inr: z.number().int().min(0),
      })
    )
    .optional(),
  members: z
    .array(
      z.object({
        display_name: z.string().trim().min(1).max(60),
        role: z.enum(MEMBER_ROLES),
        can_see_amounts: z.boolean().optional(),
        preferred_language: z.enum(LANGUAGES).optional(),
      })
    )
    .optional(),
});

export const ExtractedIntentSchema = z.object({
  intent: z.enum(["change_quantity", "add_expense", "add_task", "unknown"]),
  item: z.string().nullable(),
  newQuantity: z.number().nullable(),
  unitPriceINR: z.number().nullable(),
  missing: z.array(z.string()),
});
export type ExtractedIntent = z.infer<typeof ExtractedIntentSchema>;

export const CreateProposalSchema = z.object({
  expense_id: z.string().uuid(),
  requested_value: z.number().int().positive("Quantity must be a positive whole number"),
  source_text: z.string().trim().min(1).max(1000),
  source_language: z.enum(LANGUAGES).default("en-IN"),
  decision_owner_id: z.string().uuid().nullable().optional(),
  task_owner_id: z.string().uuid().nullable().optional(),
});

export const NudgeBeeCallbackSchema = z.object({
  kind: z.enum(["change_request", "leftover_outreach"]),
  refId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  idempotencyKey: z.string().trim().min(1).max(200),
  workflowRunRef: z.string().optional(),
  note: z.string().optional(),
});
export type NudgeBeeCallbackPayload = z.infer<typeof NudgeBeeCallbackSchema>;

export const CreateExpenseSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  vendor_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive().default(1),
  unit_price_inr: z.number().int().min(0).nullable().optional(),
  committed_inr: z.number().int().min(0).optional(),
  paid_inr: z.number().int().min(0).default(0),
  status: z.enum(EXPENSE_STATUSES).default("quoted"),
  source: z.enum(EXPENSE_SOURCES).default("user_quote"),
  quote_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(400).default(""),
});

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  owner_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_label: z.string().max(40).nullable().optional(),
  location_label: z.string().max(120).nullable().optional(),
  source: z.enum(TASK_SOURCES).default("user"),
});

export const CreateQuoteSchema = z.object({
  vendor_id: z.string().uuid(),
  amount_inr: z.number().int().min(0),
  unit_label: z.string().trim().min(1).max(40).default("total"),
  inclusions: z.string().max(400).default(""),
  exclusions: z.string().max(400).default(""),
  valid_till: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  quote_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const CreateLeftoverSchema = z.object({
  food_type: z.string().trim().min(2).max(160),
  approx_portions: z.number().int().positive(),
  served_at: z.string().trim().min(1).max(80),
  storage_notes: z.string().trim().max(240).default("unknown"),
  allergen_notes: z.string().trim().max(240).nullable().optional(),
  pickup_location: z.string().trim().min(2).max(200),
  ngo_place_id: z.string().nullable().optional(),
  ngo_name: z.string().nullable().optional(),
  ngo_phone: z.string().nullable().optional(),
  ngo_maps_url: z.string().nullable().optional(),
});

export const AgentStepInputSchema = z.object({
  message: z.string().trim().min(1).max(1000).optional(),
  confirmActionTurnId: z.string().uuid().optional(),
  dismissActionTurnId: z.string().uuid().optional(),
});

export const AgentModelOutputSchema = z.object({
  say: z.string().nullable(),
  tool: z.string().nullable(),
  args: z.record(z.unknown()).nullable(),
});
export type AgentModelOutput = z.infer<typeof AgentModelOutputSchema>;

export const READ_TOOLS = [
  "get_budget_summary",
  "list_tasks",
  "list_shortlist",
  "search_vendors",
  "find_ngos",
  "get_run_sheet",
] as const;

export const WRITE_TOOLS = [
  "add_expense",
  "create_task",
  "add_vendor_to_shortlist",
  "draft_message",
  "create_change_proposal",
] as const;

export const FORBIDDEN_AGENT_ACTIONS = [
  "approve_decision",
  "approve_proposal",
  "mark_vendor_confirmed",
  "mark_food_safe",
  "send_message",
  "record_payment",
] as const;

// ---------------------------------------------------------------------------
// Provider Interfaces (lib/providers/*)
// ---------------------------------------------------------------------------

export interface PlaceCandidate {
  place_id: string;
  name: string;
  address: string;
  phone: string | null;
  rating: number | null;
  user_rating_count: number | null;
  maps_url: string;
  open_now?: boolean;
  lat?: number;
  lng?: number;
  source: "places" | "sample";
  fetched_at: string;
}

export interface SpeechProvider {
  transcribe(input: {
    audioBytes: Uint8Array;
    mimeType: string;
    fileName: string;
    languageCode: LanguageCode | "unknown";
    keyterms?: string[];
  }): Promise<{
    transcript: string;
    languageCode: string;
    provider: "sarvam";
  }>;
  synthesize?(input: {
    text: string;
    languageCode: LanguageCode;
  }): Promise<{
    audioBase64: string;
    mimeType: string;
  }>;
}

export interface LlmProvider {
  extractIntent(input: {
    text: string;
    languageCode: LanguageCode;
    expenseTitles: string[];
  }): Promise<ExtractedIntent>;
  draftMessage(input: {
    recipientType: MessageRecipientType;
    recipientName: string;
    purpose: string;
    language: LanguageCode;
    facts: Record<string, string | number | null>;
  }): Promise<string>;
  agentStep(input: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<AgentModelOutput>;
  festiveIdeas(input: {
    eventType: EventType;
    category: string;
    vibe: string;
    language: LanguageCode;
  }): Promise<string[]>;
}

export interface PlacesProvider {
  searchText(input: {
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
  }>;
}

export interface FlagProvider {
  getFlagsForEvent(event: {
    id: string;
    plan: "free" | "pass";
    city: string;
    type: EventType;
    language: LanguageCode;
  }): Promise<EventFlags>;
  updateEventPlanTrait(
    eventId: string,
    plan: "free" | "pass"
  ): Promise<{ ok: boolean; error?: string }>;
}

export interface WorkflowProvider {
  triggerApproval(input: {
    kind: "change_request" | "leftover_outreach";
    refId: string;
    summary: string;
    eventName: string;
    decisionOwnerName: string;
    deltaINR?: number | null;
    projectedOverUnderINR?: number | null;
  }): Promise<{
    ok: boolean;
    workflowRef: string | null;
    error?: string;
  }>;
}
