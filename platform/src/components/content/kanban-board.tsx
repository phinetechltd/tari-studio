"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, CalendarClock, Search, UserRound } from "lucide-react";

import { callApi } from "@/components/json-form";
import { Notice } from "@/components/ui";

/**
 * The task board: a kanban over the content workflow with drag-and-drop
 * (@dnd-kit, MIT) and per-task assignment to teammates. Moves and assignments
 * PATCH /api/content/[id] optimistically and revert if the server refuses.
 */

export interface BoardTask {
  id: string;
  taskNumber: string;
  title: string;
  description: string | null;
  contentType: string;
  status: string;
  priority: string;
  dueAt: string | null;
  targetPlatform: string | null;
  brandId: string;
  brandName: string;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface BoardMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface BoardBrand {
  id: string;
  name: string;
}

const COLUMNS: Array<{ status: string; label: string; dot: string }> = [
  { status: "DRAFT", label: "Draft", dot: "bg-muted" },
  { status: "IN_REVIEW", label: "In review", dot: "bg-info" },
  { status: "APPROVED", label: "Approved", dot: "bg-success" },
  { status: "PUBLISHED", label: "Published", dot: "bg-primary" },
  { status: "REJECTED", label: "Rejected", dot: "bg-danger" },
];

const STATUSES = COLUMNS.map((c) => c.status);
const COL_PREFIX = "col:";

const PRIORITY_CLASS: Record<string, string> = {
  LOW: "border-wash/10 bg-wash/[0.05] text-muted",
  MEDIUM: "border-wash/10 bg-wash/[0.05] text-muted",
  HIGH: "border-warning/25 bg-warning/10 text-warning",
  URGENT: "border-danger/25 bg-danger/10 text-danger",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Platform Admin",
  OWNER: "Owner",
  BRAND_MANAGER: "Brand Manager",
  APPROVER: "Approver",
  DESIGNER: "Designer",
  MARKETER: "Marketer",
  ANALYST: "Analyst",
};

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

function dueInfo(task: BoardTask): { text: string; overdue: boolean } | null {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const overdue = due.getTime() < startOfToday && task.status !== "PUBLISHED";
  const text = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(due);
  return { text, overdue };
}

interface BoardProps {
  tasks: BoardTask[];
  members: BoardMember[];
  brands: BoardBrand[];
  canWrite: boolean;
}

export function KanbanBoard(props: BoardProps) {
  const [items, setItems] = useState<BoardTask[]>(props.tasks);
  const [snapshot, setSnapshot] = useState<BoardTask[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((t) => {
      if (assigneeFilter === "none" && t.assigneeId) return false;
      if (assigneeFilter && assigneeFilter !== "none" && t.assigneeId !== assigneeFilter) return false;
      if (brandFilter && t.brandId !== brandFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.taskNumber.toLowerCase().includes(q) ||
        t.brandName.toLowerCase().includes(q) ||
        (t.assigneeName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, assigneeFilter, brandFilter]);

  const groups = useMemo(
    () => COLUMNS.map((c) => ({ ...c, tasks: filtered.filter((t) => t.status === c.status) })),
    [filtered],
  );

  const activeTask = activeId ? items.find((t) => t.id === activeId) ?? null : null;
  const editing = editingId ? items.find((t) => t.id === editingId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setSnapshot(itemsRef.current);
    setError(null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    setItems((prev) => {
      const task = prev.find((t) => t.id === activeId);
      if (!task) return prev;
      const overStatus = overId.startsWith(COL_PREFIX)
        ? overId.slice(COL_PREFIX.length)
        : prev.find((t) => t.id === overId)?.status;
      if (!overStatus || !STATUSES.includes(overStatus) || overStatus === task.status) return prev;

      const without = prev.filter((t) => t.id !== activeId);
      const moved: BoardTask = { ...task, status: overStatus };
      const overTask = overId.startsWith(COL_PREFIX) ? null : without.find((t) => t.id === overId) ?? null;
      if (overTask) {
        const idx = without.findIndex((t) => t.id === overTask.id);
        without.splice(idx < 0 ? without.length : idx, 0, moved);
      } else {
        without.push(moved);
      }
      return without;
    });
  }

  function revertToSnapshot() {
    if (snapshotRef.current) setItems(snapshotRef.current);
  }

  async function persistStatus(id: string, status: string, snap: BoardTask[] | null) {
    const res = await callApi(`/api/content/${id}`, "PATCH", { status });
    if (!res.ok) {
      if (snap) setItems(snap);
      setError(res.error?.message ?? "Could not move the task.");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const draggedId = String(active.id);
    setActiveId(null);

    const snap = snapshotRef.current;
    setSnapshot(null);
    const original = snap?.find((t) => t.id === draggedId) ?? null;

    if (!over) {
      revertToSnapshot();
      return;
    }
    const overId = String(over.id);

    const task = itemsRef.current.find((t) => t.id === draggedId) ?? null;
    if (!task) return;

    // onDragOver already moved the card between columns optimistically; settle
    // the final position, then persist if the column actually changed.
    if (overId.startsWith(COL_PREFIX)) {
      const overStatus = overId.slice(COL_PREFIX.length);
      if (STATUSES.includes(overStatus) && overStatus !== task.status) {
        // A direct drop on the column with no intermediate over-events.
        setItems((prev) => {
          const source = prev.find((t) => t.id === draggedId);
          if (!source) return prev;
          const without = prev.filter((t) => t.id !== draggedId);
          without.push({ ...source, status: overStatus });
          return without;
        });
        void persistStatus(draggedId, overStatus, snap);
        return;
      }
    } else if (overId !== draggedId) {
      const oldIndex = itemsRef.current.findIndex((t) => t.id === draggedId);
      const newIndex = itemsRef.current.findIndex((t) => t.id === overId);
      if (oldIndex >= 0 && newIndex >= 0) setItems((prev) => arrayMove(prev, oldIndex, newIndex));
    }

    if (original && original.status !== task.status) {
      void persistStatus(draggedId, task.status, snap);
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setSnapshot(null);
    revertToSnapshot();
  }

  async function assign(task: BoardTask, assigneeId: string | null) {
    const member = assigneeId ? props.members.find((m) => m.id === assigneeId) ?? null : null;
    const previous = task;
    setItems((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, assigneeId, assigneeName: member?.name ?? null } : t)),
    );
    const res = await callApi(`/api/content/${task.id}`, "PATCH", { assigneeId });
    if (!res.ok) {
      setItems((prev) => prev.map((t) => (t.id === previous.id ? previous : t)));
      setError(res.error?.message ?? "Could not assign the task.");
    }
  }

  async function archive(task: BoardTask) {
    if (!window.confirm(`Archive "${task.title}"? It leaves the board but stays in the records.`)) return;
    setError(null);
    const res = await callApi(`/api/content/${task.id}`, "DELETE");
    if (!res.ok) {
      setError(res.error?.message ?? "Could not archive the task.");
      return;
    }
    setItems((prev) => prev.filter((t) => t.id !== task.id));
  }

  function handleSaved(next: BoardTask) {
    setItems((prev) =>
      next.status === "ARCHIVED"
        ? prev.filter((t) => t.id !== next.id)
        : prev.map((t) => (t.id === next.id ? next : t)),
    );
    setEditingId(null);
  }

  const hasFilters = Boolean(query || assigneeFilter || brandFilter);

  return (
    <div>
      {error ? <Notice tone="danger" title={error}>Your change was rolled back. Try again.</Notice> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, brand, assignee…"
            className="input pl-9"
            aria-label="Search tasks"
          />
        </div>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="input w-auto"
          aria-label="Filter by assignee"
        >
          <option value="">All assignees</option>
          <option value="none">Unassigned</option>
          {props.members.map((m) => (
            <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
          ))}
        </select>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="input w-auto"
          aria-label="Filter by brand"
        >
          <option value="">All brands</option>
          {props.brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-full border border-line bg-wash/[0.05] p-0.5 text-sm">
            <span className="rounded-full bg-primary px-3 py-1.5 font-medium text-onprimary">Board</span>
            <Link href="/app/content/list" className="rounded-full px-3 py-1.5 text-muted hover:text-ink">List</Link>
          </div>
        </div>
      </div>

      {items.length === 0 && !hasFilters ? (
        <div className="rounded-card border border-dashed border-wash/10 bg-wash/[0.02] px-6 py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-wash/[0.06] text-muted">
            <CalendarClock className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-ink">No tasks on the board yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Create your first content task to start the workflow.
          </p>
          {props.canWrite ? (
            <Link href="/app/content/new" className="btn-primary mt-4">+ New Task</Link>
          ) : null}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-wash/10 bg-wash/[0.02] px-6 py-16 text-center">
          <p className="text-base font-semibold text-ink">No tasks match your filters</p>
          <button
            type="button"
            className="btn-quiet mt-4"
            onClick={() => {
              setQuery("");
              setAssigneeFilter("");
              setBrandFilter("");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-3 overflow-x-auto pb-3">
            {groups.map((group) => (
              <BoardColumn
                key={group.status}
                group={group}
                members={props.members}
                canWrite={props.canWrite}
                onOpen={setEditingId}
                onAssign={assign}
                onArchive={archive}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.4, 1)" }}>
            {activeTask ? (
              <div className="w-[228px] rotate-2 scale-[1.02] cursor-grabbing rounded-card border border-primary/50 bg-raised p-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                <TaskCardBody task={activeTask} members={props.members} canWrite={false} staticMode />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {editing ? (
        <TaskEditModal
          task={editing}
          members={props.members}
          canWrite={props.canWrite}
          onClose={() => setEditingId(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}

type ColumnGroup = (typeof COLUMNS)[number] & { tasks: BoardTask[] };

function BoardColumn(props: {
  group: ColumnGroup;
  members: BoardMember[];
  canWrite: boolean;
  onOpen: (id: string) => void;
  onAssign: (task: BoardTask, assigneeId: string | null) => void;
  onArchive: (task: BoardTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${props.group.status}` });
  return (
    <div
      className={`flex min-w-[240px] flex-1 flex-col rounded-card border transition-colors ${
        isOver ? "border-primary/60 bg-primary/[0.06]" : "border-wash/[0.08] bg-wash/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-wash/[0.08] px-3 py-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${props.group.dot}`} />
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wide text-ink">{props.group.label}</h3>
        <span className="rounded-full border border-wash/[0.1] bg-raised px-2 py-0.5 font-mono text-[11px] font-semibold text-muted">
          {props.group.tasks.length}
        </span>
      </div>
      <SortableContext items={props.group.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex max-h-[62vh] min-h-[120px] flex-col gap-2 overflow-y-auto p-2">
          {props.group.tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              members={props.members}
              canWrite={props.canWrite}
              onOpen={props.onOpen}
              onAssign={props.onAssign}
              onArchive={props.onArchive}
            />
          ))}
          {props.group.tasks.length === 0 ? (
            <p className="mx-auto my-8 max-w-[180px] text-center text-xs text-muted">
              {props.group.status === "DRAFT" ? "Nothing here yet — create a task to get started." : "Drop tasks here"}
            </p>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard(props: {
  task: BoardTask;
  members: BoardMember[];
  canWrite: boolean;
  onOpen: (id: string) => void;
  onAssign: (task: BoardTask, assigneeId: string | null) => void;
  onArchive: (task: BoardTask) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
    data: { status: props.task.status },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => props.onOpen(props.task.id)}
      className={`group cursor-grab touch-manipulation rounded-card border border-wash/[0.08] bg-raised p-3 transition-colors hover:border-primary/40 active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <TaskCardBody
        task={props.task}
        members={props.members}
        canWrite={props.canWrite}
        onAssign={props.onAssign}
        onArchive={props.onArchive}
      />
    </div>
  );
}

function TaskCardBody(props: {
  task: BoardTask;
  members: BoardMember[];
  canWrite: boolean;
  onAssign?: (task: BoardTask, assigneeId: string | null) => void;
  onArchive?: (task: BoardTask) => void;
  staticMode?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const due = dueInfo(props.task);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted">{props.task.taskNumber}</p>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-ink">{props.task.title}</p>
        </div>
        {!props.staticMode && props.canWrite && props.onArchive ? (
          <button
            type="button"
            title="Archive task"
            aria-label={`Archive ${props.task.title}`}
            onPointerDown={stop}
            onClick={(e) => {
              stop(e);
              props.onArchive?.(props.task);
            }}
            className="shrink-0 rounded-lg p-1.5 text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Archive className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              PRIORITY_CLASS[props.task.priority] ?? PRIORITY_CLASS.MEDIUM
            }`}
          >
            {props.task.priority}
          </span>
          <span className="truncate text-xs text-muted">{props.task.brandName}</span>
          {due ? (
            <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] ${due.overdue ? "text-danger" : "text-muted"}`}>
              <CalendarClock className="h-3 w-3" />
              Due {due.text}
            </span>
          ) : null}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            title={props.task.assigneeName ? `Assigned to ${props.task.assigneeName}` : "Assign a teammate"}
            aria-label={props.task.assigneeName ? `Assigned to ${props.task.assigneeName}` : "Assign a teammate"}
            disabled={props.staticMode || !props.canWrite}
            onPointerDown={props.staticMode || !props.canWrite ? undefined : stop}
            onClick={
              props.staticMode || !props.canWrite
                ? undefined
                : (e) => {
                    stop(e);
                    setPickerOpen((open) => !open);
                  }
            }
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
              props.task.assigneeId
                ? "bg-primary/15 text-primary"
                : "border border-dashed border-line text-muted hover:border-primary/60 hover:text-primary"
            } ${props.staticMode || !props.canWrite ? "cursor-default" : "cursor-pointer"}`}
          >
            {props.task.assigneeId ? initials(props.task.assigneeName) : <UserRound className="h-3.5 w-3.5" />}
          </button>
          {pickerOpen && props.onAssign ? (
            <>
              <button
                type="button"
                aria-label="Close assignee picker"
                className="fixed inset-0 z-40 cursor-default"
                onPointerDown={stop}
                onClick={(e) => {
                  stop(e);
                  setPickerOpen(false);
                }}
              />
              <div
                className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-line bg-raised p-1 shadow-xl"
                onClick={stop}
              >
                <p className="px-2 py-1 text-xs font-medium text-muted">Assign to</p>
                {props.task.assigneeId ? (
                  <PickerRow
                    label="Unassigned"
                    sub="Nobody owns this task"
                    active={false}
                    onSelect={() => {
                      setPickerOpen(false);
                      props.onAssign?.(props.task, null);
                    }}
                  />
                ) : null}
                {props.members.map((m) => (
                  <PickerRow
                    key={m.id}
                    label={m.name ?? m.email}
                    sub={ROLE_LABEL[m.role] ?? m.role}
                    active={m.id === props.task.assigneeId}
                    onSelect={() => {
                      setPickerOpen(false);
                      props.onAssign?.(props.task, m.id);
                    }}
                  />
                ))}
                {props.members.length === 0 && !props.task.assigneeId ? (
                  <p className="px-2 py-2 text-xs text-muted">No teammates to assign yet.</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function PickerRow(props: { label: string; sub: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-wash/[0.08] ${
        props.active ? "text-primary" : "text-ink"
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
        {initials(props.label)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{props.label}</span>
        <span className="block truncate text-[11px] text-muted">{props.sub}</span>
      </span>
      {props.active ? <span className="text-xs font-semibold">✓</span> : null}
    </button>
  );
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PUBLISHED", label: "Published" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ARCHIVED", label: "Archived" },
];

function TaskEditModal(props: {
  task: BoardTask;
  members: BoardMember[];
  canWrite: boolean;
  onClose: () => void;
  onSaved: (task: BoardTask) => void;
}) {
  const [title, setTitle] = useState(props.task.title);
  const [description, setDescription] = useState(props.task.description ?? "");
  const [status, setStatus] = useState(props.task.status);
  const [priority, setPriority] = useState(props.task.priority);
  const [due, setDue] = useState(props.task.dueAt ? props.task.dueAt.slice(0, 10) : "");
  const [assigneeId, setAssigneeId] = useState(props.task.assigneeId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeModal() {
    if (!pending) props.onClose();
  }

  async function save() {
    setPending(true);
    setError(null);
    const dueIso = due ? new Date(`${due}T00:00:00`).toISOString() : null;
    const res = await callApi<{ task: { id: string } }>(`/api/content/${props.task.id}`, "PATCH", {
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      dueAt: dueIso,
      assigneeId: assigneeId || null,
    });
    if (!res.ok) {
      setPending(false);
      setError(res.error?.message ?? "Could not save the task.");
      return;
    }
    setPending(false);
    const member = assigneeId ? props.members.find((m) => m.id === assigneeId) ?? null : null;
    props.onSaved({
      ...props.task,
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      dueAt: dueIso,
      assigneeId: assigneeId || null,
      assigneeName: member?.name ?? null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={closeModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.canWrite ? "Edit task" : "Task details"}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-wash/[0.08] bg-raised p-6"
      >
        <p className="font-mono text-xs text-muted">{props.task.taskNumber}</p>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
          {props.canWrite ? "Edit task" : "Task details"}
        </h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="kb-title">Title <span className="text-danger">*</span></label>
            <input
              id="kb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              className="input"
              disabled={!props.canWrite}
            />
          </div>
          <div>
            <label className="label" htmlFor="kb-description">Description</label>
            <textarea
              id="kb-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={3000}
              className="input"
              disabled={!props.canWrite}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="kb-status">Status</label>
              <select id="kb-status" value={status} onChange={(e) => setStatus(e.target.value)} className="input" disabled={!props.canWrite}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="kb-priority">Priority</label>
              <select id="kb-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="input" disabled={!props.canWrite}>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="kb-due">Due date</label>
              <input
                id="kb-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="input"
                disabled={!props.canWrite}
              />
            </div>
            <div>
              <label className="label" htmlFor="kb-assignee">Assignee</label>
              <select id="kb-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="input" disabled={!props.canWrite}>
                <option value="">Unassigned</option>
                {props.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          ) : null}

          <div className="flex gap-3 pt-1">
            {props.canWrite ? (
              <button type="button" onClick={save} disabled={pending} className="btn-primary">
                {pending ? "Saving…" : "Save changes"}
              </button>
            ) : null}
            <button type="button" onClick={closeModal} className="btn-ghost">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
