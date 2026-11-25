"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  CalendarCheck2,
  Check,
  Copy,
  CreditCard,
  Home,
  MessageSquare,
  MoreHorizontal,
  Scale,
  Store,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import { clsx } from "clsx";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  Dialog,
  FlagChip,
  LanguageToggle,
  PlanBadge,
  Skeleton,
  StatusChip,
  useToast,
} from "@/components/ui/primitives";
import { daysUntilIST } from "@/lib/domain/budget";
import { isIndicLanguage, tr } from "@/lib/i18n";

export function InvalidTokenScreen({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-bg kolam-pattern flex items-center justify-center px-4 py-12">
      <Card className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-primary">
          <Users className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Ask the organizer for your personal family link.
        </h1>
        <p className="text-sm text-ink-muted">
          {message ||
            "Each family member gets a private link so everyone sees only what matches their role."}
        </p>
        <div className="pt-2">
          <Link href="/">
            <Button variant="primary" className="w-full">
              Go back to Tayyari Home
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { pushToast } = useToast();
  const {
    eventId,
    token,
    event,
    member,
    members,
    flags,
    lang,
    setLang,
    loading,
    error,
    refreshEvent,
    refreshFlags,
    agentOpen,
    setAgentOpen,
  } = useEventContext();

  const [moreOpen, setMoreOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [flagsRefreshing, setFlagsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (loading && !event) {
    return (
      <div className="min-h-screen bg-bg p-6">
        <div className="mx-auto max-w-[1120px] space-y-4">
          <Skeleton className="h-14 w-full" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !event || !member) {
    return <InvalidTokenScreen message={error ?? undefined} />;
  }

  const qs = `?t=${encodeURIComponent(token)}`;
  const base = `/e/${eventId}`;

  const primaryNav = [
    { href: `${base}${qs}`, matchPath: base, label: tr(lang, "navHome"), icon: Home, show: true },
    { href: `${base}/plan${qs}`, matchPath: `${base}/plan`, label: tr(lang, "navPlan"), icon: CalendarCheck2, show: true },
    { href: `${base}/budget${qs}`, matchPath: `${base}/budget`, label: tr(lang, "navBudget"), icon: Wallet, show: true },
    {
      href: `${base}/vendors${qs}`,
      matchPath: `${base}/vendors`,
      label: tr(lang, "navVendors"),
      icon: Store,
      show: flags.module_vendor_finder,
    },
  ].filter((item) => item.show);

  const secondaryNav = [
    { href: `${base}/decisions${qs}`, matchPath: `${base}/decisions`, label: tr(lang, "navDecisions"), icon: Scale, show: true },
    { href: `${base}/messages${qs}`, matchPath: `${base}/messages`, label: tr(lang, "navMessages"), icon: MessageSquare, show: true },
    {
      href: `${base}/leftovers${qs}`,
      matchPath: `${base}/leftovers`,
      label: tr(lang, "navLeftovers"),
      icon: Utensils,
      show: flags.module_leftover_food,
    },
    { href: `${base}/pricing${qs}`, matchPath: `${base}/pricing`, label: tr(lang, "navPricing"), icon: CreditCard, show: true },
    { href: `/status?returnTo=${encodeURIComponent(`${base}${qs}`)}`, matchPath: `/status`, label: tr(lang, "navStatus"), icon: Activity, show: true },
  ].filter((item) => item.show);

  const allNav = [...primaryNav, ...secondaryNav];
  const daysLeft = daysUntilIST(event.event_date);
  const daysLabel =
    daysLeft > 0
      ? `${daysLeft} ${tr(lang, "daysToGo")}`
      : daysLeft === 0
      ? "Today"
      : `${Math.abs(daysLeft)}d ago`;

  const handleManualFlagRefresh = async () => {
    setFlagsRefreshing(true);
    try {
      await refreshFlags();
    } finally {
      setFlagsRefreshing(false);
    }
  };

  const handleCopyMemberLink = async (memberId: string, memberToken: string) => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/e/${eventId}?t=${encodeURIComponent(memberToken)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(memberId);
      pushToast("Personal family link copied.", "success");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      pushToast("Copy failed — please select and copy the link manually.", "error");
    }
  };

  const roleLabel = (role: string) =>
    role === "decision_owner"
      ? "Decision Owner"
      : role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div
      className={clsx(
        "min-h-screen bg-bg text-ink flex flex-col lg:flex-row",
        isIndicLanguage(lang) && "indic-leading"
      )}
    >
      {/* Desktop Left Sidebar (>=1024px) */}
      <aside className="no-print hidden lg:flex lg:w-[264px] lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-surface lg:sticky lg:top-0 lg:h-screen">
        <div className="kolam-pattern border-b border-border p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={`${base}${qs}`} className="font-display text-2xl font-bold text-primary">
              {tr(lang, "appName")}
            </Link>
            <PlanBadge plan={event.plan} />
          </div>
          <div>
            <div className="font-semibold text-ink truncate" title={event.name}>
              {event.name}
            </div>
            <div className="text-xs text-ink-muted tabular-nums">
              {event.city}
              {event.area ? `, ${event.area}` : ""} · {daysLabel}
            </div>
          </div>
          <LanguageToggle value={lang} onChange={setLang} />
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Event navigation">
          {allNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.matchPath;
            return (
              <Link
                key={item.matchPath}
                href={item.href}
                className={clsx(
                  "flex min-h-[48px] items-center gap-3 rounded-control px-3.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "text-ink hover:bg-surface-2"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4 space-y-3">
          {flags.module_planning_agent ? (
            <Button
              variant="accent"
              className="w-full"
              onClick={() => setAgentOpen(true)}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>{tr(lang, "askTayyari")}</span>
            </Button>
          ) : null}

          <div className="rounded-control border border-border bg-bg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink truncate">
                  {member.display_name}
                </div>
                <div className="text-xs text-ink-muted">{roleLabel(member.role)}</div>
              </div>
              <StatusChip
                label={member.can_see_amounts ? "Amounts" : "Hidden"}
                tone={member.can_see_amounts ? "success" : "neutral"}
              />
            </div>

            {member.role === "organizer" ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full min-h-[48px]"
                onClick={() => setLinksOpen(true)}
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                <span>Family links / Switch</span>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-full min-h-[48px]"
                onClick={() => handleCopyMemberLink(member.id, token)}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>Copy my link</span>
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Sticky Top Bar (<1024px) */}
      <header className="no-print sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur px-4 py-2.5 lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-bold text-ink truncate">
                {event.name}
              </span>
              <PlanBadge plan={event.plan} />
            </div>
            <div className="text-xs font-medium text-ink-muted tabular-nums">
              {daysLabel} · {member.display_name}
            </div>
          </div>
          <LanguageToggle value={lang} onChange={setLang} />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 mx-auto w-full max-w-[1120px] px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-10">
          {children}
        </main>

        {/* Footer FlagChip */}
        <footer className="no-print mx-auto w-full max-w-[1120px] px-4 pb-24 lg:px-8 lg:pb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-ink-muted">
            <FlagChip
              source={flags.source}
              refreshedAt={flags.refreshed_at}
              onRefresh={handleManualFlagRefresh}
              loading={flagsRefreshing}
            />
            <span>
              Tayyari · {member.display_name} ({roleLabel(member.role)})
            </span>
          </div>
        </footer>
      </div>

      {/* Mobile Floating "Ask Tayyari" Button (<1024px) */}
      {flags.module_planning_agent ? (
        <button
          type="button"
          onClick={() => setAgentOpen(true)}
          className="no-print fixed bottom-20 right-4 z-30 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-bold text-ink shadow-soft hover:brightness-95 lg:hidden"
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
          <span>{tr(lang, "askTayyari")}</span>
        </button>
      ) : null}

      {/* Mobile Bottom Nav (<1024px) */}
      <nav
        aria-label="Mobile navigation"
        className="no-print fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
      >
        <div
          className={clsx(
            "grid h-16 items-center",
            primaryNav.length === 4 ? "grid-cols-5" : "grid-cols-4"
          )}
        >
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.matchPath;
            return (
              <Link
                key={item.matchPath}
                href={item.href}
                className={clsx(
                  "flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  active ? "text-primary" : "text-ink-muted hover:text-ink"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate max-w-[68px]">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink-muted hover:text-ink"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Drawer */}
      <Dialog
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title="More event tools"
        description={`${event.name} · ${member.display_name}`}
      >
        <div className="space-y-2">
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.matchPath;
            return (
              <Link
                key={item.matchPath}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={clsx(
                  "flex min-h-[48px] items-center gap-3 rounded-control border px-4 text-sm font-semibold",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-bg text-ink hover:bg-surface-2"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {member.role === "organizer" ? (
            <Button
              variant="secondary"
              className="w-full mt-2"
              onClick={() => {
                setMoreOpen(false);
                setLinksOpen(true);
              }}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>Family links &amp; Member switcher</span>
            </Button>
          ) : null}
        </div>
      </Dialog>

      {/* Organizer Family Links / Member Switcher Dialog */}
      <Dialog
        open={linksOpen}
        onOpenChange={setLinksOpen}
        title="Family member links"
        description="Share each personal link privately. Helpers and viewers never see rupee amounts."
      >
        <div className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-bg p-3"
            >
              <div>
                <div className="font-semibold text-ink">{m.display_name}</div>
                <div className="text-xs text-ink-muted">
                  {roleLabel(m.role)} ·{" "}
                  {m.can_see_amounts ? "Can see amounts" : "Amounts hidden"}
                </div>
              </div>
              {m.access_token ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-[48px]"
                    onClick={() => handleCopyMemberLink(m.id, m.access_token!)}
                  >
                    {copiedId === m.id ? (
                      <Check className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{copiedId === m.id ? "Copied" : "Copy link"}</span>
                  </Button>
                  <Link
                    href={`/e/${eventId}?t=${encodeURIComponent(m.access_token)}`}
                    onClick={() => setLinksOpen(false)}
                  >
                    <Button variant="primary" size="sm" className="min-h-[48px]">
                      Switch
                    </Button>
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Dialog>

      {/* Planning Agent Slide-over Panel */}
      {flags.module_planning_agent ? (
        <AgentPanel
          open={agentOpen}
          onClose={() => setAgentOpen(false)}
          eventId={eventId}
          token={token}
          language={lang}
          canSeeAmounts={member.can_see_amounts}
          onActionConfirmed={refreshEvent}
        />
      ) : null}
    </div>
  );
}
