"use client";

import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useEventContext } from "@/components/shell/EventContext";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  StatCard,
  StatusChip,
  useToast,
} from "@/components/ui/primitives";
import type { TaskRecord, TaskStatus } from "@/lib/contracts";
import { addDaysToISODate } from "@/lib/domain/budget";
import { tr } from "@/lib/i18n";

function todayISTISO(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);
}

type TaskFilter = "all" | "mine" | "overdue";
type ActiveTab = "timeline" | "guests";

export default function PlanPage() {
  const { pushToast } = useToast();
  const {
    eventId,
    token,
    event,
    member,
    members,
    tasks,
    guests,
    lang,
    refreshEvent,
  } = useEventContext();

  const [tab, setTab] = useState<ActiveTab>("timeline");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Record<string, TaskStatus>
  >({});

  // Add Task Dialog
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(() => todayISTISO());
  const [taskOwnerId, setTaskOwnerId] = useState("");
  const [taskTime, setTaskTime] = useState("");
  const [taskLocation, setTaskLocation] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Shift Template Dates Dialog
  const [shiftOpen, setShiftOpen] = useState(false);
  const [newEventDate, setNewEventDate] = useState(event?.event_date ?? "");
  const [shifting, setShifting] = useState(false);

  // Add Guest Dialog
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestGroup, setGuestGroup] = useState("Family");
  const [guestCount, setGuestCount] = useState(2);
  const [guestDietary, setGuestDietary] = useState("");
  const [savingGuest, setSavingGuest] = useState(false);

  const todayISO = useMemo(() => todayISTISO(), []);
  const weekAheadISO = useMemo(() => addDaysToISODate(todayISO, 7), [todayISO]);

  if (!event || !member) return null;

  const memberNameById = new Map(members.map((m) => [m.id, m.display_name]));
  const canManagePlan =
    member.role === "organizer" || member.role === "decision_owner";
  const canEditTasks = member.role !== "viewer";

  const mergedTasks = tasks.map((t) => ({
    ...t,
    status: optimisticStatuses[t.id] ?? t.status,
  }));

  const filteredTasks = mergedTasks.filter((t) => {
    if (filter === "mine") {
      return t.owner_id === member.id;
    }
    if (filter === "overdue") {
      return (
        t.status !== "completed" &&
        t.status !== "declined" &&
        t.due_date < todayISO
      );
    }
    return true;
  });

  const thisWeekTasks = filteredTasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "declined" &&
      t.due_date <= weekAheadISO
  );
  const laterTasks = filteredTasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "declined" &&
      t.due_date > weekAheadISO
  );
  const doneTasks = filteredTasks.filter(
    (t) => t.status === "completed" || t.status === "declined"
  );

  const handleTaskStatusChange = async (
    task: TaskRecord,
    nextStatus: TaskStatus
  ) => {
    setOptimisticStatuses((prev) => ({ ...prev, [task.id]: nextStatus }));
    try {
      const res = await fetch(
        `/api/tasks?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, status: nextStatus }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setOptimisticStatuses((prev) => {
          const copy = { ...prev };
          delete copy[task.id];
          return copy;
        });
        pushToast(data?.error ?? "Could not update task.", "error");
        return;
      }
      await refreshEvent();
      setOptimisticStatuses((prev) => {
        const copy = { ...prev };
        delete copy[task.id];
        return copy;
      });
    } catch {
      setOptimisticStatuses((prev) => {
        const copy = { ...prev };
        delete copy[task.id];
        return copy;
      });
      pushToast("Network error updating task.", "error");
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    try {
      const res = await fetch(
        `/api/tasks?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: taskTitle.trim(),
            due_date: taskDueDate,
            owner_id: taskOwnerId || null,
            time_label: taskTime.trim() || null,
            location_label: taskLocation.trim() || null,
            source: "user",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(data?.error ?? "Could not add task.", "error");
        return;
      }
      setTaskTitle("");
      setTaskTime("");
      setTaskLocation("");
      setAddTaskOpen(false);
      pushToast("Task added to plan.", "success");
      await refreshEvent();
    } catch {
      pushToast("Network error adding task.", "error");
    } finally {
      setSavingTask(false);
    }
  };

  const handleShiftTemplateDates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventDate) return;
    setShifting(true);
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}?t=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_date: newEventDate,
            shift_task_dates: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(data?.error ?? "Could not shift dates.", "error");
        return;
      }
      setShiftOpen(false);
      pushToast("Event date updated and template tasks shifted.", "success");
      await refreshEvent();
    } catch {
      pushToast("Network error shifting dates.", "error");
    } finally {
      setShifting(false);
    }
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setSavingGuest(true);
    try {
      const res = await fetch(
        `/api/guests?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: guestName.trim(),
            group_label: guestGroup.trim() || "Family",
            count: Math.max(1, guestCount),
            dietary_note: guestDietary.trim(),
            rsvp: "unknown",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        pushToast(data?.error ?? "Could not add guest.", "error");
        return;
      }
      setGuestName("");
      setGuestDietary("");
      setGuestCount(2);
      setAddGuestOpen(false);
      pushToast("Guest group added.", "success");
      await refreshEvent();
    } catch {
      pushToast("Network error adding guest.", "error");
    } finally {
      setSavingGuest(false);
    }
  };

  const handleToggleRsvp = async (
    guestId: string,
    rsvp: "yes" | "no" | "unknown"
  ) => {
    try {
      const res = await fetch(
        `/api/guests?eventId=${encodeURIComponent(eventId)}&t=${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: guestId, rsvp }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        pushToast(data?.error ?? "Could not update RSVP.", "error");
        return;
      }
      await refreshEvent();
    } catch {
      pushToast("Network error updating RSVP.", "error");
    }
  };

  const confirmedHeadcount = guests
    .filter((g) => g.rsvp === "yes")
    .reduce((sum, g) => sum + g.count, 0);
  const totalInvitedHeadcount = guests.reduce((sum, g) => sum + g.count, 0);
  const awaitingHeadcount = guests
    .filter((g) => g.rsvp === "unknown")
    .reduce((sum, g) => sum + g.count, 0);

  const renderTaskRow = (task: TaskRecord) => {
    const ownerName = task.owner_id
      ? memberNameById.get(task.owner_id) ?? "Family"
      : "Unassigned";
    const isOverdue =
      task.status !== "completed" &&
      task.status !== "declined" &&
      task.due_date < todayISO;
    const canHelperAct =
      member.role !== "viewer" &&
      (canManagePlan || !task.owner_id || task.owner_id === member.id);

    const chipTone =
      task.status === "completed"
        ? "success"
        : task.status === "accepted"
        ? "info"
        : task.status === "declined"
        ? "danger"
        : isOverdue
        ? "danger"
        : "neutral";

    const chipLabel =
      task.status === "assigned" && isOverdue ? "Overdue" : task.status;

    return (
      <div
        key={task.id}
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                "font-semibold text-ink",
                task.status === "completed" && "line-through text-ink-muted"
              )}
            >
              {task.title}
            </span>
            <StatusChip label={chipLabel} tone={chipTone} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>Owner: {ownerName}</span>
            <span className={clsx("tabular-nums", isOverdue && "text-danger font-semibold")}>
              Due: {task.due_date}
            </span>
            {task.time_label ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {task.time_label}
              </span>
            ) : null}
            {task.location_label ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {task.location_label}
              </span>
            ) : null}
          </div>
        </div>

        {canEditTasks && canHelperAct ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {task.status === "assigned" ? (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[48px]"
                onClick={() => handleTaskStatusChange(task, "accepted")}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Accept</span>
              </Button>
            ) : null}
            {task.status !== "completed" ? (
              <Button
                variant="primary"
                size="sm"
                className="min-h-[48px]"
                onClick={() => handleTaskStatusChange(task, "completed")}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Complete</span>
              </Button>
            ) : null}
            {task.status !== "declined" && task.status !== "completed" ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[48px] text-danger"
                onClick={() => handleTaskStatusChange(task, "declined")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Decline</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink marigold-underline">
            Event Plan &amp; Guest List
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Event date: <strong className="text-ink tabular-nums">{event.event_date}</strong> · Planned guests:{" "}
            <strong className="text-ink tabular-nums">{event.guest_count}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {member.role === "organizer" ? (
            <Button
              variant="secondary"
              onClick={() => {
                setNewEventDate(event.event_date);
                setShiftOpen(true);
              }}
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              <span>Shift template dates</span>
            </Button>
          ) : null}
          {tab === "timeline" && canEditTasks ? (
            <Button variant="primary" onClick={() => setAddTaskOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add task</span>
            </Button>
          ) : null}
          {tab === "guests" && canEditTasks ? (
            <Button variant="primary" onClick={() => setAddGuestOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              <span>Add guest</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Section Tabs: Timeline vs Guest List */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setTab("timeline")}
          className={clsx(
            "min-h-[48px] rounded-control px-4 text-sm font-semibold transition-colors",
            tab === "timeline"
              ? "bg-primary text-white"
              : "bg-surface border border-border text-ink hover:bg-surface-2"
          )}
        >
          Tasks Timeline ({tasks.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("guests")}
          className={clsx(
            "min-h-[48px] rounded-control px-4 text-sm font-semibold transition-colors inline-flex items-center gap-2",
            tab === "guests"
              ? "bg-primary text-white"
              : "bg-surface border border-border text-ink hover:bg-surface-2"
          )}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>Guest List &amp; RSVP ({confirmedHeadcount} confirmed)</span>
        </button>
      </div>

      {tab === "timeline" ? (
        <div className="space-y-6">
          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Task filters">
            {(
              [
                { id: "all", label: tr(lang, "allTasks") },
                { id: "mine", label: tr(lang, "myTasks") },
                { id: "overdue", label: tr(lang, "overdue") },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={clsx(
                  "min-h-[48px] rounded-full border px-4 text-sm font-semibold transition-colors",
                  filter === chip.id
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-ink hover:bg-surface-2"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState
              title="No tasks match this filter"
              description="Try switching to All tasks or add a new task for your family."
            />
          ) : (
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-ink">
                  This week ({thisWeekTasks.length})
                </h2>
                {thisWeekTasks.length === 0 ? (
                  <p className="text-sm text-ink-muted">No open tasks due in the next 7 days.</p>
                ) : (
                  <div className="space-y-2.5">{thisWeekTasks.map(renderTaskRow)}</div>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-ink">
                  Later ({laterTasks.length})
                </h2>
                {laterTasks.length === 0 ? (
                  <p className="text-sm text-ink-muted">No later tasks scheduled.</p>
                ) : (
                  <div className="space-y-2.5">{laterTasks.map(renderTaskRow)}</div>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-ink">
                  Done ({doneTasks.length})
                </h2>
                {doneTasks.length === 0 ? (
                  <p className="text-sm text-ink-muted">No completed or declined tasks yet.</p>
                ) : (
                  <div className="space-y-2.5">{doneTasks.map(renderTaskRow)}</div>
                )}
              </section>
            </div>
          )}
        </div>
      ) : (
        /* Guest List Tab */
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Confirmed RSVP"
              value={`${confirmedHeadcount}`}
              hint="Feeds catering headcount planning"
              tone="success"
            />
            <StatCard
              label="Awaiting reply"
              value={`${awaitingHeadcount}`}
              hint="RSVP unknown"
              tone="warning"
            />
            <StatCard
              label="Total listed"
              value={`${totalInvitedHeadcount}`}
              hint={`Event target: ${event.guest_count} guests`}
            />
          </div>

          {guests.length === 0 ? (
            <EmptyState
              title="No guests listed yet"
              description="Add families and friend groups to track confirmed headcount and dietary notes."
              action={
                canEditTasks ? (
                  <Button variant="primary" onClick={() => setAddGuestOpen(true)}>
                    Add first guest group
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-2.5">
              {guests.map((g) => (
                <Card
                  key={g.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{g.name}</span>
                      <StatusChip
                        label={`${g.count} ${g.count === 1 ? "person" : "people"}`}
                        tone="neutral"
                      />
                      <span className="text-xs text-ink-muted">{g.group_label}</span>
                    </div>
                    {g.dietary_note ? (
                      <div className="mt-1 text-xs text-ink-muted">
                        Dietary: {g.dietary_note}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(["yes", "unknown", "no"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={!canEditTasks}
                        onClick={() => handleToggleRsvp(g.id, status)}
                        className={clsx(
                          "min-h-[48px] rounded-control border px-3.5 text-xs font-semibold transition-colors disabled:opacity-50",
                          g.rsvp === status
                            ? status === "yes"
                              ? "border-success bg-emerald-50 text-success"
                              : status === "no"
                              ? "border-danger bg-red-50 text-danger"
                              : "border-primary bg-surface-2 text-primary"
                            : "border-border bg-bg text-ink-muted hover:text-ink"
                        )}
                      >
                        {status === "yes"
                          ? "Confirmed"
                          : status === "no"
                          ? "Not coming"
                          : "Unknown"}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Task Dialog */}
      <Dialog
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        title="Add a task"
        description="Assign an owner and due date so everyone knows what is next."
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-ink">Task title</span>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Confirm brass lamp return timing"
              className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Due date</span>
              <input
                type="date"
                required
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Owner</span>
              <select
                value={taskOwnerId}
                onChange={(e) => setTaskOwnerId(e.target.value)}
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} ({m.role.replace("_", " ")})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">
                Time (optional)
              </span>
              <input
                type="text"
                value={taskTime}
                onChange={(e) => setTaskTime(e.target.value)}
                placeholder="e.g. 10:30 AM"
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">
                Location (optional)
              </span>
              <input
                type="text"
                value={taskLocation}
                onChange={(e) => setTaskLocation(e.target.value)}
                placeholder="e.g. Main dining hall"
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddTaskOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingTask}>
              Save task
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Shift Template Dates Dialog */}
      <Dialog
        open={shiftOpen}
        onOpenChange={setShiftOpen}
        title="Change event date & shift template tasks"
        description={`Current event date is ${event.event_date}. Template tasks will move by the same number of days.`}
      >
        <form onSubmit={handleShiftTemplateDates} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-ink">New event date</span>
            <input
              type="date"
              required
              value={newEventDate}
              onChange={(e) => setNewEventDate(e.target.value)}
              className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShiftOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={shifting}>
              Update date &amp; shift tasks
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Guest Dialog */}
      <Dialog
        open={addGuestOpen}
        onOpenChange={setAddGuestOpen}
        title="Add guest or household"
      >
        <form onSubmit={handleAddGuest} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-ink">
              Name / Household
            </span>
            <input
              type="text"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Suresh & Family"
              className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Group</span>
              <input
                type="text"
                value={guestGroup}
                onChange={(e) => setGuestGroup(e.target.value)}
                placeholder="Maternal relatives"
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink">Headcount</span>
              <input
                type="number"
                min={1}
                max={200}
                value={guestCount}
                onChange={(e) =>
                  setGuestCount(Math.max(1, Number(e.target.value) || 1))
                }
                className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink tabular-nums"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-ink">
              Dietary note (optional)
            </span>
            <input
              type="text"
              value={guestDietary}
              onChange={(e) => setGuestDietary(e.target.value)}
              placeholder="e.g. Jain food for 2 elders"
              className="min-h-[48px] w-full rounded-control border border-border bg-bg px-3.5 text-sm text-ink"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddGuestOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingGuest}>
              Add guest
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
