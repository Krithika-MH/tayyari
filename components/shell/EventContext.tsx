"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_EVENT_FLAGS,
  type ActivityRecord,
  type CategoryRecord,
  type EventFlags,
  type EventRecord,
  type ExpenseRecord,
  type GuestRecord,
  type ImpactReport,
  type LanguageCode,
  type MemberRecord,
  type ProposalRecord,
  type TaskRecord,
  type UsageKind,
} from "@/lib/contracts";
import type {
  CategoryBudgetSummary,
  EventBudgetSummary,
} from "@/lib/domain/budget";

export type SanitizedEvent = Omit<EventRecord, "total_budget_inr"> & {
  total_budget_inr: number | null;
};

export type PublicMember = Omit<MemberRecord, "access_token"> & {
  access_token?: string;
};

export type SanitizedCategory = Omit<CategoryRecord, "allocated_inr"> & {
  allocated_inr: number | null;
};

export type SanitizedExpense = Omit<
  ExpenseRecord,
  "unit_price_inr" | "committed_inr" | "paid_inr"
> & {
  unit_price_inr: number | null;
  committed_inr: number | null;
  paid_inr: number | null;
};

export type SanitizedImpactReport = Omit<
  ImpactReport,
  | "baselineCommittedINR"
  | "deltaINR"
  | "projectedCommittedINR"
  | "overUnderBudgetINR"
> & {
  baselineCommittedINR: number | null;
  deltaINR: number | null;
  projectedCommittedINR: number | null;
  overUnderBudgetINR: number | null;
};

export type SanitizedProposal = Omit<
  ProposalRecord,
  "baseline_unit_price_inr" | "impact"
> & {
  baseline_unit_price_inr: number | null;
  impact: SanitizedImpactReport;
};

export type SanitizedCategoryBudgetSummary = Omit<
  CategoryBudgetSummary,
  "allocatedINR" | "committedINR" | "paidINR" | "remainingToAllocateINR"
> & {
  allocatedINR: number | null;
  committedINR: number | null;
  paidINR: number | null;
  remainingToAllocateINR: number | null;
};

export type SanitizedBudgetSummary = Omit<
  EventBudgetSummary,
  | "totalBudgetINR"
  | "allocatedINR"
  | "committedINR"
  | "paidINR"
  | "remainingUnpaidINR"
  | "remainingToAllocateINR"
  | "remainingOverallINR"
  | "pendingProposalsTotalINR"
  | "categories"
> & {
  amountsHidden?: boolean;
  totalBudgetINR: number | null;
  allocatedINR: number | null;
  committedINR: number | null;
  paidINR: number | null;
  remainingUnpaidINR: number | null;
  remainingToAllocateINR: number | null;
  remainingOverallINR: number | null;
  pendingProposalsTotalINR: number | null;
  categories: SanitizedCategoryBudgetSummary[];
};

export interface EventContextValue {
  eventId: string;
  token: string;
  event: SanitizedEvent | null;
  member: MemberRecord | null;
  members: PublicMember[];
  categories: SanitizedCategory[];
  expenses: SanitizedExpense[];
  tasks: TaskRecord[];
  proposals: SanitizedProposal[];
  guests: GuestRecord[];
  activity: ActivityRecord[];
  budgetSummary: SanitizedBudgetSummary | null;
  flags: EventFlags;
  usage: Record<UsageKind, number>;
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  loading: boolean;
  error: string | null;
  refreshEvent: () => Promise<void>;
  refreshFlags: () => Promise<void>;
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
}

const DEFAULT_USAGE: Record<UsageKind, number> = {
  speech: 0,
  agent: 0,
  search: 0,
  leftover: 0,
};

const INITIAL_FLAGS: EventFlags = {
  ...DEFAULT_EVENT_FLAGS,
  refreshed_at: "",
};

const EventContext = createContext<EventContextValue | null>(null);

export function EventProvider({
  eventId,
  token,
  children,
}: {
  eventId: string;
  token: string;
  children: React.ReactNode;
}) {
  const [event, setEvent] = useState<SanitizedEvent | null>(null);
  const [member, setMember] = useState<MemberRecord | null>(null);
  const [members, setMembers] = useState<PublicMember[]>([]);
  const [categories, setCategories] = useState<SanitizedCategory[]>([]);
  const [expenses, setExpenses] = useState<SanitizedExpense[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [proposals, setProposals] = useState<SanitizedProposal[]>([]);
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [budgetSummary, setBudgetSummary] =
    useState<SanitizedBudgetSummary | null>(null);
  const [flags, setFlags] = useState<EventFlags>(INITIAL_FLAGS);
  const [usage, setUsage] = useState<Record<UsageKind, number>>(DEFAULT_USAGE);
  const [lang, setLangState] = useState<LanguageCode>("en-IN");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState<boolean>(false);

  const userChangedLangRef = useRef(false);

  const setLang = useCallback((next: LanguageCode) => {
    userChangedLangRef.current = true;
    setLangState(next);
  }, []);

  const refreshEvent = useCallback(async () => {
    if (!eventId || !token) {
      setError("Ask the organizer for your personal family link.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}?t=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error ?? "Ask the organizer for your personal family link."
        );
        setLoading(false);
        return;
      }

      setEvent(data.event ?? null);
      setMember(data.member ?? null);
      setMembers(Array.isArray(data.members) ? data.members : []);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setProposals(Array.isArray(data.proposals) ? data.proposals : []);
      setGuests(Array.isArray(data.guests) ? data.guests : []);
      setActivity(Array.isArray(data.activity) ? data.activity : []);
      setBudgetSummary(data.budgetSummary ?? null);
      setUsage(data.usage ?? DEFAULT_USAGE);
      if (data.flags) {
        setFlags(data.flags);
      }
      if (!userChangedLangRef.current && data.member?.preferred_language) {
        setLangState(data.member.preferred_language);
      } else if (!userChangedLangRef.current && data.event?.language) {
        setLangState(data.event.language);
      }
      setError(null);
    } catch {
      setError("Could not load event details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [eventId, token]);

  const refreshFlags = useCallback(async () => {
    if (!eventId || !token) return;
    try {
      const res = await fetch(
        `/api/flags?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setFlags((prev) => ({
          ...prev,
          source: "defaults",
          refreshed_at: new Date().toISOString(),
        }));
        return;
      }
      const data = await res.json();
      const nextFlags: EventFlags | undefined = data?.flags ?? data;
      if (nextFlags && typeof nextFlags.module_vendor_finder === "boolean") {
        setFlags(nextFlags);
      }
    } catch {
      setFlags((prev) => ({
        ...prev,
        source: "defaults",
        refreshed_at: new Date().toISOString(),
      }));
    }
  }, [eventId, token]);

  useEffect(() => {
    setLoading(true);
    userChangedLangRef.current = false;
    void refreshEvent();
  }, [refreshEvent]);

  useEffect(() => {
    if (!eventId || !token) return;
    const interval = setInterval(() => {
      void refreshFlags();
    }, 10000);
    return () => clearInterval(interval);
  }, [eventId, token, refreshFlags]);

  const value: EventContextValue = {
    eventId,
    token,
    event,
    member,
    members,
    categories,
    expenses,
    tasks,
    proposals,
    guests,
    activity,
    budgetSummary,
    flags,
    usage,
    lang,
    setLang,
    loading,
    error,
    refreshEvent,
    refreshFlags,
    agentOpen,
    setAgentOpen,
  };

  return (
    <EventContext.Provider value={value}>{children}</EventContext.Provider>
  );
}

export function useEventContext(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) {
    throw new Error("useEventContext must be used inside an EventProvider.");
  }
  return ctx;
}
