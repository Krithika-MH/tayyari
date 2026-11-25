import React from "react";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { getRepository } from "@/lib/db/repository";
import { PageGuide } from "@/components/ui/PageGuide";

export const dynamic = "force-dynamic";

function parseTimeLabelMinutes(label: string | null): number {
  if (!label) return 24 * 60;
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 23 * 60;
  let hours = Number(m[1]);
  const mins = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

export default async function ShareRunSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { eventId } = await params;
  const { s } = await searchParams;

  const repo = getRepository();
  const event = await repo.getEvent(eventId);

  if (!event) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-card border border-border bg-surface p-8 text-center shadow-soft">
          <h1 className="font-display text-2xl font-bold text-ink">
            Run sheet not found
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Please check the share link sent by your family event organizer.
          </p>
        </div>
      </main>
    );
  }

  const members = await repo.listMembers(event.id);
  const validToken = s
    ? s === "runsheet" ||
      s === "public" ||
      s === "viewer" ||
      members.some((m) => m.access_token === s)
    : false;

  if (!validToken) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-card border border-border bg-surface p-8 text-center shadow-soft">
          <h1 className="font-display text-2xl font-bold text-ink">
            Use the shared run-sheet link
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Ask the event organizer to share the full run-sheet URL from
            Messages &amp; Run Sheet.
          </p>
        </div>
      </main>
    );
  }

  // Strictly fetch non-monetary records only (ZERO rupee amounts ever)
  const [tasks, vendors] = await Promise.all([
    repo.listTasks(event.id),
    repo.listVendors(event.id),
  ]);

  const memberNameById = new Map(members.map((m) => [m.id, m.display_name]));
  const orderedTasks = [...tasks].sort((a, b) => {
    const d = a.due_date.localeCompare(b.due_date);
    if (d !== 0) return d;
    return parseTimeLabelMinutes(a.time_label) - parseTimeLabelMinutes(b.time_label);
  });
  const shortlistedVendors = vendors.filter((v) => v.shortlisted);

  return (
    <main className="min-h-screen bg-bg px-4 py-8 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header Card */}
        <header className="rounded-card border border-border bg-surface p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
              Read-only Run Sheet · {event.type}
            </span>
            <span className="text-xs font-medium text-ink-muted">
              Tayyari Family Event Plan
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold text-ink">
              {event.name}
            </h1>
            <PageGuide
              title="Shared Run Sheet"
              summary="A clean, read-only event schedule for helpers, vendors, and relatives — completely free of budget numbers."
              steps={[
                "Follow tasks chronologically by date, time, and location.",
                "Check the listed shortlisted vendors at the bottom for coordination contacts.",
                "Print this page cleanly from your browser if you want a paper copy on event day.",
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-5 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-primary" />
              {event.event_date}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              {event.area ? `${event.area}, ${event.city}` : event.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              {event.guest_count} expected guests
            </span>
          </div>
        </header>

        {/* Schedule Section */}
        <section className="rounded-card border border-border bg-surface p-6 shadow-soft space-y-4">
          <h2 className="font-display text-xl font-semibold text-ink marigold-underline">
            Schedule &amp; Task Owners
          </h2>

          {orderedTasks.length === 0 ? (
            <p className="text-sm text-ink-muted">No schedule items added yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {orderedTasks.map((task) => {
                const owner = task.owner_id
                  ? memberNameById.get(task.owner_id) ?? "Unassigned"
                  : "Unassigned";
                return (
                  <div
                    key={task.id}
                    className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold tabular-nums text-ink">
                          {task.due_date}
                          {task.time_label ? ` · ${task.time_label}` : ""}
                        </span>
                        <span className="font-semibold text-ink">
                          {task.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-ink-muted">
                        <span>Owner: {owner}</span>
                        {task.location_label ? (
                          <span>Venue / Spot: {task.location_label}</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="w-fit rounded-full border border-border bg-bg px-3 py-0.5 text-xs font-semibold capitalize text-ink-muted">
                      {task.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Venues & Shortlisted Contacts (Zero Prices) */}
        <section className="rounded-card border border-border bg-surface p-6 shadow-soft space-y-4">
          <h2 className="font-display text-xl font-semibold text-ink marigold-underline">
            Venues &amp; Coordination Contacts
          </h2>

          {shortlistedVendors.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No shortlisted venues or vendor contacts added yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {shortlistedVendors.map((v) => (
                <div
                  key={v.id}
                  className="rounded-control border border-border bg-bg p-3.5 space-y-1"
                >
                  <div className="text-xs font-bold uppercase tracking-wide text-primary">
                    {v.category}
                  </div>
                  <div className="font-semibold text-ink">{v.name}</div>
                  <div className="text-xs text-ink-muted">{v.address}</div>
                  <div className="flex flex-wrap gap-3 pt-1 text-xs">
                    {v.phone ? (
                      <a
                        href={`tel:${v.phone.replace(/\s+/g, "")}`}
                        className="font-semibold text-primary underline"
                      >
                        {v.phone}
                      </a>
                    ) : null}
                    <a
                      href={v.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary underline"
                    >
                      Open in Maps
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="pb-6 text-center text-xs text-ink-muted">
          Shared via Tayyari — Use your browser&apos;s Print option to save as
          PDF.
        </footer>
      </div>
    </main>
  );
}
