import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { DndContext, closestCenter, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Plus, ArrowLeft, Kanban,
  X, Loader2, CheckCircle, AlertTriangle, Search,
  BarChart2, Edit3, Save, Circle, Pin, Zap, Star,
  Download, Eye, EyeOff, MessageSquare, Link,
  Minimize2, List, Grid, Timer, Activity, Layers,
  CheckSquare, Coffee, Sparkles, AlignLeft, GripVertical,
  PanelLeftOpen, PanelLeftClose,
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import {
  getProjects, createProject, deleteProject,
  getColumns, createColumn, getTasks,
  createTask, updateTask, deleteTask,
  suggestTaskSubtasks, prioritizeTasks,
} from "../../services/api/tasks.api"
import type { Project, Column, Task, UpdateTaskData } from "../../services/api/tasks.api"
import { DeleteButton } from "../../components/DeleteButton"
import { useKeyboard } from "../../hooks/useKeyboard"
import toast from "react-hot-toast"

/* ─── CONSTANTS ────────────────────────────────────────────────────────────── */
const C = {
  bg: "#070B12", surface: "#0C1018", surface2: "#111827",
  border: "rgba(255,255,255,0.06)", border2: "rgba(255,255,255,0.1)",
  text: "#E2E8F0", muted: "#64748B", faint: "#1E293B",
  indigo: "#6366F1", cyan: "#22D3EE", amber: "#F59E0B",
  emerald: "#10B981", rose: "#F43F5E", violet: "#8B5CF6",
  orange: "#F97316", sky: "#0EA5E9",
}

const PRIORITY = {
  low:      { color: "#94A3B8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)", label: "Low",      dot: "#94A3B8", icon: "▽" },
  medium:   { color: "#60A5FA", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.2)",  label: "Medium",   dot: "#60A5FA", icon: "◇" },
  high:     { color: "#FB923C", bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.2)",  label: "High",     dot: "#FB923C", icon: "△" },
  critical: { color: "#F87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)", label: "Critical", dot: "#F87171", icon: "▲" },
}

const COLUMN_COLORS: Record<string, string> = {
  "To Do": "#6366F1", "In Progress": "#F59E0B", "Done": "#10B981",
  "Review": "#8B5CF6", "Blocked": "#F43F5E",
}

const STATUS_MAP: Record<string, string> = {
  "To Do": "todo", "In Progress": "in_progress", "Done": "done",
  "Review": "review", "Blocked": "blocked",
}

const PROJECT_COLORS = [
  "#6366F1","#EC4899","#F59E0B","#10B981","#3B82F6",
  "#EF4444","#8B5CF6","#14B8A6","#F97316","#06B6D4",
  "#84CC16","#E11D48","#0891B2","#7C3AED","#D97706",
]

const TASK_EMOJIS = ["🚀","⚡","🎯","🔥","💎","🛠️","📦","🎨","🔍","✅","⚠️","🐛","📋","💡","🔐"]

/* ─── LOCAL STORAGE HELPERS ────────────────────────────────────────────────── */
interface TaskMeta {
  pinned?: boolean
  starred?: boolean
  archived?: boolean
  emoji?: string
  subtasks?: { id: string; text: string; done: boolean }[]
  comments?: { id: string; text: string; ts: string }[]
  timeTracked?: number // minutes
  timeStart?: number | null
  estimatedTime?: number
  watchers?: string[]
  customFields?: Record<string, string>
  locked?: boolean
  color?: string
  sprint?: string
  storyPoints?: number
  attachments?: { name: string; url: string }[]
  links?: { title: string; url: string }[]
  reminder?: string
}

interface BoardMeta {
  theme?: "dark" | "darker" | "midnight"
  sprintName?: string
  sprintGoal?: string
  wip?: Record<string, number> // WIP limits per column
  collapsed?: string[]
}

function getTaskMeta(id: string): TaskMeta {
  try {
    if (typeof window === "undefined") return {}
    return JSON.parse(localStorage.getItem(`fd_task_${id}`) || "{}")
  } catch { return {} }
}
function setTaskMeta(id: string, patch: Partial<TaskMeta>) {
  try {
    const prev = getTaskMeta(id)
    localStorage.setItem(`fd_task_${id}`, JSON.stringify({ ...prev, ...patch }))
  } catch {
    // Metadata is optional; storage restrictions should not break the board.
  }
}
function getBoardMeta(projectId: string): BoardMeta {
  try {
    if (typeof window === "undefined") return {}
    return JSON.parse(localStorage.getItem(`fd_board_${projectId}`) || "{}")
  } catch { return {} }
}
function setBoardMeta(projectId: string, patch: Partial<BoardMeta>) {
  try {
    const prev = getBoardMeta(projectId)
    localStorage.setItem(`fd_board_${projectId}`, JSON.stringify({ ...prev, ...patch }))
  } catch {
    // Board preferences can safely fall back to in-memory state.
  }
}

/* ─── HELPERS ──────────────────────────────────────────────────────────────── */
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function fmtTime(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return new Date(value)
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatDueDate(value: string) {
  return parseLocalDate(value).toLocaleDateString()
}

function daysUntilDueDate(value: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = parseLocalDate(value)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function isTaskOverdue(task: Pick<Task, "due_date" | "status">) {
  return Boolean(task.due_date && task.status !== "done" && daysUntilDueDate(task.due_date) < 0)
}

function normalizeExternalUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

let localIdSequence = 0

function createLocalId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${localIdSequence++}`
}

function statusForColumn(column: Column | string) {
  const name = typeof column === "string" ? column : column.name
  return STATUS_MAP[name] || name.toLowerCase().trim().replace(/\s+/g, "_")
}

/* ─── MINI COMPONENTS ──────────────────────────────────────────────────────── */
function Btn({ onClick, children, variant = "ghost", title, active, disabled, style: extraStyle, className }: {
  onClick?: () => void; children: React.ReactNode; variant?: "ghost"|"primary"|"danger"|"outline"
  title?: string; active?: boolean; disabled?: boolean; style?: React.CSSProperties; className?: string
}) {
  const styles: Record<string, React.CSSProperties> = {
    ghost: { background: active ? "rgba(99,102,241,0.15)" : "transparent", color: active ? C.indigo : C.muted, border: "none" },
    primary: { background: C.indigo, color: "#fff", border: "none" },
    danger: { background: "rgba(244,63,94,0.1)", color: C.rose, border: `1px solid rgba(244,63,94,0.2)` },
    outline: { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
  }
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={className} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "5px 10px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 13, fontWeight: 500, transition: "all 0.12s", opacity: disabled ? 0.5 : 1,
      ...styles[variant], ...extraStyle,
    }}
    onMouseEnter={e => { if (!active && variant === "ghost") (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)" }}
    onMouseLeave={e => { if (!active && variant === "ghost") (e.currentTarget as HTMLElement).style.background = "transparent" }}
    >{children}</button>
  )
}

/* ─── TASK DETAIL DRAWER ───────────────────────────────────────────────────── */
function TaskDetailDrawer({ task, onClose, onDelete }: {
  task: Task; onClose: () => void
  onDelete: (id: string) => Promise<boolean>
}) {
  const [meta, setMeta] = useState<TaskMeta>(getTaskMeta(task.id))
  const [newSubtask, setNewSubtask] = useState("")
  const [newComment, setNewComment] = useState("")
  const [newLink, setNewLink] = useState({ title: "", url: "" })
  const [aiLoading, setAiLoading] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [activeTab, setActiveTab] = useState<"details"|"subtasks"|"comments"|"links">("details")
  const [timerNow, setTimerNow] = useState(0)

  const patchMeta = (patch: Partial<TaskMeta>) => {
    const next = { ...meta, ...patch }
    setMeta(next)
    setTaskMeta(task.id, patch)
  }

  // Timer
  useEffect(() => {
    if (!meta.timeStart) return
    const updateTimer = () => setTimerNow(Date.now())
    const initialTimer = window.setTimeout(updateTimer, 0)
    const interval = window.setInterval(updateTimer, 1000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
    }
  }, [meta.timeStart])

  const toggleTimer = () => {
    if (meta.timeStart) {
      const elapsed = Math.floor((Date.now() - meta.timeStart) / 60000)
      patchMeta({ timeTracked: (meta.timeTracked || 0) + elapsed, timeStart: null })
    } else {
      patchMeta({ timeStart: Date.now() })
    }
  }

  const liveTracked = meta.timeStart
    ? (meta.timeTracked || 0) + Math.max(0, Math.floor(((timerNow || meta.timeStart) - meta.timeStart) / 60000))
    : (meta.timeTracked || 0)

  const addSubtask = () => {
    if (!newSubtask.trim()) return
    const subtasks = [...(meta.subtasks || []), { id: createLocalId(), text: newSubtask.trim(), done: false }]
    patchMeta({ subtasks }); setNewSubtask("")
  }

  const toggleSubtask = (id: string) => {
    patchMeta({ subtasks: (meta.subtasks || []).map(s => s.id === id ? { ...s, done: !s.done } : s) })
  }

  const addComment = () => {
    if (!newComment.trim()) return
    const comments = [...(meta.comments || []), { id: createLocalId(), text: newComment.trim(), ts: new Date().toISOString() }]
    patchMeta({ comments }); setNewComment("")
  }

  const handleAiSubtasks = async () => {
    setAiLoading(true)
    try {
      const { subtasks: suggestions } = await suggestTaskSubtasks(task.title, task.description || "")
      if (suggestions.length === 0) {
        toast.error("AI did not return any subtasks")
        return
      }
      const subtasks = [...(meta.subtasks || []), ...suggestions.map(text => ({ id: createLocalId(), text, done: false }))]
      patchMeta({ subtasks })
      toast.success(`Added ${suggestions.length} AI subtasks!`)
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      toast.error(detail || "AI unavailable")
    }
    finally { setAiLoading(false) }
  }

  const p = PRIORITY[task.priority as keyof typeof PRIORITY] || PRIORITY.medium
  const subtasksDone = (meta.subtasks || []).filter(s => s.done).length
  const subtasksTotal = (meta.subtasks || []).length

  const TABS = [
    { id: "details", label: "Details", icon: <AlignLeft size={13}/> },
    { id: "subtasks", label: `Subtasks ${subtasksTotal > 0 ? `(${subtasksDone}/${subtasksTotal})` : ""}`, icon: <CheckSquare size={13}/> },
    { id: "comments", label: `Comments ${(meta.comments||[]).length > 0 ? `(${(meta.comments||[]).length})` : ""}`, icon: <MessageSquare size={13}/> },
    { id: "links", label: "Links", icon: <Link size={13}/> },
  ]

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 600, display: "flex",
      background: "rgba(0,0,0,0.7)",
    }} onClick={onClose}>
      <div style={{ flex: 1 }} />
      <div className="task-detail-drawer" onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, height: "100%",
        background: C.surface, borderLeft: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", overflowY: "auto",
        animation: "slideIn 0.2s ease",
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => {
                const emojis = TASK_EMOJIS
                const idx = emojis.indexOf(meta.emoji || "")
                patchMeta({ emoji: emojis[(idx + 1) % emojis.length] })
              }} style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer" }}>
                {meta.emoji || "📋"}
              </button>
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>
                  Task #{task.id.slice(-6).toUpperCase()}
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{task.title}</h2>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
              <Btn onClick={() => patchMeta({ starred: !meta.starred })} active={meta.starred} title="Star">
                <Star size={14} />
              </Btn>
              <Btn onClick={() => patchMeta({ pinned: !meta.pinned })} active={meta.pinned} title="Pin">
                <Pin size={14} />
              </Btn>
              <DeleteButton
                iconSize={14}
                title="Delete task"
                onClick={async () => { if (await onDelete(task.id)) onClose() }}
              />
              <Btn onClick={onClose} title="Close">
                <X size={14} />
              </Btn>
            </div>
          </div>

          {/* Priority + Status badges */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 99,
              background: p.bg, color: p.color, border: `1px solid ${p.border}`,
              fontWeight: 600,
            }}>{p.icon} {p.label}</span>
            {task.due_date && (
              <span style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 99,
                background: "rgba(255,255,255,0.04)", color: C.muted,
                border: `1px solid ${C.border}`,
              }}>📅 {formatDueDate(task.due_date)}</span>
            )}
            {(meta.storyPoints || 0) > 0 && (
              <span style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 99,
                background: "rgba(139,92,246,0.1)", color: C.violet,
                border: `1px solid rgba(139,92,246,0.2)`, fontWeight: 700,
              }}>{meta.storyPoints} pts</span>
            )}
            {meta.sprint && (
              <span style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 99,
                background: "rgba(34,211,238,0.1)", color: C.cyan,
                border: `1px solid rgba(34,211,238,0.2)`,
              }}>🏃 {meta.sprint}</span>
            )}
          </div>
        </div>

        {/* Time Tracker */}
        <div style={{
          padding: "10px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 12, background: "rgba(99,102,241,0.04)",
        }}>
          <Timer size={14} color={C.indigo} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Time tracked</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
              {fmtTime(liveTracked)}
              {meta.estimatedTime ? <span style={{ color: C.muted, fontWeight: 400 }}> / {fmtTime(meta.estimatedTime)}</span> : ""}
            </div>
          </div>
          {meta.estimatedTime && liveTracked > 0 && (
            <div style={{ width: 60, height: 4, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99,
                width: `${Math.min(100, (liveTracked / meta.estimatedTime) * 100)}%`,
                background: liveTracked > meta.estimatedTime ? C.rose : C.emerald,
                transition: "width 1s",
              }} />
            </div>
          )}
          <button onClick={toggleTimer} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: meta.timeStart ? "rgba(244,63,94,0.1)" : "rgba(99,102,241,0.1)",
            border: `1px solid ${meta.timeStart ? "rgba(244,63,94,0.3)" : "rgba(99,102,241,0.3)"}`,
            borderRadius: 8, padding: "5px 12px", cursor: "pointer",
            color: meta.timeStart ? C.rose : C.indigo, fontSize: 12, fontWeight: 600,
          }}>
            {meta.timeStart ? <><X size={12} />Stop</> : <><Timer size={12} />Start</>}
          </button>
        </div>

        {/* Tabs */}
        <div className="task-detail-tabs" style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 12px" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "10px 10px", fontSize: 12, fontWeight: 500,
              color: activeTab === tab.id ? C.indigo : C.muted,
              borderBottom: activeTab === tab.id ? `2px solid ${C.indigo}` : "2px solid transparent",
              background: "none", border: "none", cursor: "pointer", transition: "color 0.12s",
              borderBottomWidth: 2,
            }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>

          {/* DETAILS TAB */}
          {activeTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {task.description && (
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Description</div>
                  <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{task.description}</p>
                </div>
              )}
              {/* Story points */}
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Story Points</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1,2,3,5,8,13].map(pt => (
                    <button key={pt} onClick={() => patchMeta({ storyPoints: pt })} style={{
                      width: 32, height: 32, borderRadius: 6, border: `1px solid ${meta.storyPoints === pt ? C.violet : C.border}`,
                      background: meta.storyPoints === pt ? "rgba(139,92,246,0.15)" : "transparent",
                      color: meta.storyPoints === pt ? C.violet : C.muted, cursor: "pointer", fontSize: 12, fontWeight: 700,
                    }}>{pt}</button>
                  ))}
                </div>
              </div>
              {/* Est. time */}
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Estimated Time</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[15,30,60,120,240,480].map(mins => (
                    <button key={mins} onClick={() => patchMeta({ estimatedTime: mins })} style={{
                      padding: "4px 8px", borderRadius: 6, border: `1px solid ${meta.estimatedTime === mins ? C.cyan : C.border}`,
                      background: meta.estimatedTime === mins ? "rgba(34,211,238,0.1)" : "transparent",
                      color: meta.estimatedTime === mins ? C.cyan : C.muted, cursor: "pointer", fontSize: 11,
                    }}>{fmtTime(mins)}</button>
                  ))}
                </div>
              </div>
              {/* Sprint */}
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Sprint</div>
                <input value={meta.sprint || ""} onChange={e => patchMeta({ sprint: e.target.value })}
                  placeholder="Sprint name..."
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 13, outline: "none",
                    boxSizing: "border-box",
                  }} />
              </div>
              {/* Color accent */}
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Card Color</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["none","#6366F1","#10B981","#F59E0B","#F43F5E","#8B5CF6","#22D3EE"].map(col => (
                    <button key={col} onClick={() => patchMeta({ color: col })} style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: col === "none" ? "transparent" : col,
                      border: `1px solid ${meta.color === col ? "#fff" : C.border}`,
                      cursor: "pointer",
                    }} />
                  ))}
                </div>
              </div>
              {/* Labels */}
              {(task.labels || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Labels</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(task.labels || []).map(l => (
                      <span key={l} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,0.06)", color: C.muted }}>{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Reminder */}
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Reminder</div>
                <input type="datetime-local" value={meta.reminder || ""}
                  onChange={e => patchMeta({ reminder: e.target.value })}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 13, outline: "none",
                    colorScheme: "dark",
                  }} />
              </div>
            </div>
          )}

          {/* SUBTASKS TAB */}
          {activeTab === "subtasks" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSubtask()}
                  placeholder="Add subtask..."
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 13, outline: "none",
                  }} />
                <Btn onClick={addSubtask} variant="primary"><Plus size={14} /></Btn>
                <Btn onClick={handleAiSubtasks} disabled={aiLoading} title="AI generate subtasks" style={{ background: "rgba(99,102,241,0.15)", color: C.indigo, border: `1px solid rgba(99,102,241,0.3)`, borderRadius: 8 }}>
                  {aiLoading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
                </Btn>
              </div>
              {(meta.subtasks || []).length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>
                  No subtasks yet. Add one or use AI ✨
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(meta.subtasks || []).map(s => (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 8,
                      background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                    }}>
                      <button onClick={() => toggleSubtask(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: s.done ? C.emerald : C.muted, display: "flex" }}>
                        {s.done ? <CheckCircle size={15} /> : <Circle size={15} />}
                      </button>
                      <span style={{ flex: 1, fontSize: 13, color: s.done ? C.muted : C.text, textDecoration: s.done ? "line-through" : "none" }}>{s.text}</span>
                      <button onClick={() => patchMeta({ subtasks: (meta.subtasks || []).filter(x => x.id !== s.id) })}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {subtasksTotal > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: C.muted }}>Progress</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{subtasksDone}/{subtasksTotal}</span>
                      </div>
                      <div style={{ height: 4, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 99, transition: "width 0.3s",
                          width: `${subtasksTotal > 0 ? (subtasksDone / subtasksTotal) * 100 : 0}%`,
                          background: subtasksDone === subtasksTotal ? C.emerald : C.indigo,
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* COMMENTS TAB */}
          {activeTab === "comments" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {(meta.comments || []).length === 0 && (
                  <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>No comments yet</div>
                )}
                {(meta.comments || []).map(c => (
                  <div key={c.id} style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>You</span>
                      <span style={{ fontSize: 10, color: C.muted }}>{timeAgo(c.ts)}</span>
                    </div>
                    <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{c.text}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                  placeholder="Add comment..."
                  rows={2}
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none", resize: "none",
                  }} />
                <Btn onClick={addComment} variant="primary" style={{ alignSelf: "flex-end" }}><MessageSquare size={14} /></Btn>
              </div>
            </div>
          )}

          {/* LINKS TAB */}
          {activeTab === "links" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {(meta.links || []).length === 0 && (
                  <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>No links yet</div>
                )}
                {(meta.links || []).map((l, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                  }}>
                    <Link size={13} color={C.indigo} />
                    <a href={l.url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13, color: C.sky, textDecoration: "none" }}>{l.title || l.url}</a>
                    <button onClick={() => patchMeta({ links: (meta.links || []).filter((_, j) => j !== i) })}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {showLinkForm ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={newLink.title} onChange={e => setNewLink(l => ({ ...l, title: e.target.value }))}
                    placeholder="Link title..." style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 13, outline: "none" }} />
                  <input value={newLink.url} onChange={e => setNewLink(l => ({ ...l, url: e.target.value }))}
                    placeholder="https://..." style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 13, outline: "none" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={() => setShowLinkForm(false)} variant="outline">Cancel</Btn>
                    <Btn onClick={() => {
                      const url = normalizeExternalUrl(newLink.url.trim())
                      if (!url) {
                        toast.error("Enter a valid http or https URL")
                        return
                      }
                      patchMeta({ links: [...(meta.links || []), { title: newLink.title.trim(), url }] })
                      setNewLink({ title: "", url: "" }); setShowLinkForm(false)
                    }} variant="primary">Add Link</Btn>
                  </div>
                </div>
              ) : (
                <Btn onClick={() => setShowLinkForm(true)} variant="outline" style={{ width: "100%", justifyContent: "center" }}>
                  <Plus size={13} />Add Link
                </Btn>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
          <DeleteButton
            onClick={async () => { if (await onDelete(task.id)) onClose() }}
            label="Delete task"
            iconSize={14}
            fullWidth
            style={{
              minHeight: 36, padding: "9px 12px", borderRadius: 8, fontSize: 13,
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ─── TASK FORM MODAL ──────────────────────────────────────────────────────── */
interface TaskFormType {
  title: string
  description: string
  priority: string
  due_date: string
  labels: string[]
  labelInput: string
}

interface TaskFormProps {
  isEdit: boolean
  taskForm: TaskFormType
  setTaskForm: React.Dispatch<React.SetStateAction<TaskFormType>>
  onSave: () => void
  onClose: () => void
  saving: boolean
}

function TaskFormModal({ isEdit, taskForm, setTaskForm, onSave, onClose, saving }: TaskFormProps) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16,
    }}>
      <div style={{
        background: C.surface, borderRadius: 16, width: "100%", maxWidth: 520,
        maxHeight: "90dvh", overflowY: "auto",
        border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{isEdit ? "✏️ Edit Task" : "✨ New Task"}</span>
          <Btn onClick={onClose}><X size={15} /></Btn>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Title *</label>
            <input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
              onKeyDown={e => e.key === "Enter" && onSave()}
              autoFocus placeholder="What needs to be done?"
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Description</label>
            <textarea value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
              placeholder="More details..." rows={2}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }} />
          </div>
          <div className="task-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Priority</label>
              <select value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}
                style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, outline: "none" }}>
                <option value="low">▽ Low</option>
                <option value="medium">◇ Medium</option>
                <option value="high">△ High</option>
                <option value="critical">▲ Critical</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Due Date</label>
              <input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })}
                style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, outline: "none", colorScheme: "dark" }} />
            </div>
          </div>
          {/* Labels */}
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Labels</label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
              {taskForm.labels.map(l => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,0.07)", color: C.muted, border: `1px solid ${C.border}` }}>
                  {l}
                  <button onClick={() => setTaskForm({ ...taskForm, labels: taskForm.labels.filter(x => x !== l) })} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex" }}><X size={9} /></button>
                </span>
              ))}
            </div>
            <input value={taskForm.labelInput} onChange={e => setTaskForm({ ...taskForm, labelInput: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Enter" && taskForm.labelInput.trim()) {
                  e.preventDefault()
                  if (!taskForm.labels.includes(taskForm.labelInput.trim())) {
                    setTaskForm({ ...taskForm, labels: [...taskForm.labels, taskForm.labelInput.trim()], labelInput: "" })
                  }
                }
              }}
              placeholder="Type label + Enter..."
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
          <Btn onClick={onClose} variant="outline" style={{ flex: 1, justifyContent: "center" }}>Cancel</Btn>
          <Btn onClick={onSave} disabled={saving} variant="primary" style={{ flex: 2, justifyContent: "center", padding: "9px 0", fontSize: 14, fontWeight: 700 }}>
            {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />Saving…</> : <><Save size={14} />{isEdit ? "Save Changes" : "Create Task"}</>}
          </Btn>
        </div>
      </div>
    </div>
  )
}

/* ─── ANALYTICS PANEL ──────────────────────────────────────────────────────── */
function AnalyticsPanel({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  const total = tasks.length
  const done = tasks.filter(t => t.status === "done").length
  const inProgress = tasks.filter(t => t.status === "in_progress").length
  const overdue = tasks.filter(isTaskOverdue).length
  const critical = tasks.filter(t => t.priority === "critical").length
  const velocity = done > 0 ? Math.round((done / total) * 100) : 0
  const byPriority = Object.entries(PRIORITY).map(([key, val]) => ({
    key, label: val.label, color: val.color, count: tasks.filter(t => t.priority === key).length
  }))
  const totalTime = tasks.reduce((acc, t) => acc + (getTaskMeta(t.id).timeTracked || 0), 0)
  const totalPoints = tasks.reduce((acc, t) => acc + (getTaskMeta(t.id).storyPoints || 0), 0)
  const donePoints = tasks.filter(t => t.status === "done").reduce((acc, t) => acc + (getTaskMeta(t.id).storyPoints || 0), 0)

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 400,
      width: "100%", maxWidth: 360,
      background: C.surface, borderLeft: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={16} color={C.indigo} />Analytics
        </span>
        <Btn onClick={onClose}><X size={14} /></Btn>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Total Tasks", value: total, color: C.indigo },
            { label: "Completed", value: done, color: C.emerald },
            { label: "In Progress", value: inProgress, color: C.amber },
            { label: "Overdue", value: overdue, color: C.rose },
            { label: "Critical", value: critical, color: "#F97316" },
            { label: "Velocity %", value: `${velocity}%`, color: C.cyan },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Overall Progress</span>
            <span style={{ fontSize: 12, color: C.text, fontWeight: 700, fontFamily: "monospace" }}>{velocity}%</span>
          </div>
          <div style={{ height: 8, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 99, width: `${velocity}%`, background: `linear-gradient(90deg, ${C.indigo}, ${C.cyan})`, transition: "width 0.5s" }} />
          </div>
        </div>

        {/* By Priority */}
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>By Priority</div>
          {byPriority.map(p => (
            <div key={p.key} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: C.muted }}>{p.label}</span>
                <span style={{ fontSize: 12, color: p.color, fontFamily: "monospace", fontWeight: 700 }}>{p.count}</span>
              </div>
              <div style={{ height: 4, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, width: `${total > 0 ? (p.count / total) * 100 : 0}%`, background: p.color, transition: "width 0.5s" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Time & Story Points */}
        {(totalTime > 0 || totalPoints > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {totalTime > 0 && (
              <div style={{ background: "rgba(99,102,241,0.06)", borderRadius: 10, padding: "12px 14px", border: `1px solid rgba(99,102,241,0.15)` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>⏱ Total Time Tracked</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.indigo, fontFamily: "monospace" }}>{fmtTime(totalTime)}</div>
              </div>
            )}
            {totalPoints > 0 && (
              <div style={{ background: "rgba(139,92,246,0.06)", borderRadius: 10, padding: "12px 14px", border: `1px solid rgba(139,92,246,0.15)` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>⚡ Story Points</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.violet, fontFamily: "monospace" }}>{donePoints}/{totalPoints} done</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── TASK CARD ────────────────────────────────────────────────────────────── */
function TaskCard({ task, onUpdate, onDelete, onEdit, onDetail, compact, selectionMode, selected, onToggleSelected }: {
  task: Task; onUpdate: (id: string, data: UpdateTaskData) => void
  onDelete: (id: string) => Promise<boolean>; onEdit: (task: Task) => void
  onDetail: (task: Task) => void; compact?: boolean
  selectionMode?: boolean; selected?: boolean; onToggleSelected?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: selectionMode,
    data: { type: "task", status: task.status },
  })
  const meta = getTaskMeta(task.id)
  const p = PRIORITY[task.priority as keyof typeof PRIORITY] || PRIORITY.medium
  const isOverdue = isTaskOverdue(task)
  const isDone = task.status === "done"
  const daysUntilDue = task.due_date ? daysUntilDueDate(task.due_date) : null
  const subtasksDone = (meta.subtasks || []).filter(s => s.done).length
  const subtasksTotal = (meta.subtasks || []).length
  const accentColor = (meta.color && meta.color !== "none") ? meta.color : undefined
  const hasTimer = !!meta.timeStart

  return (
    <div ref={setNodeRef}
      onClick={() => selectionMode ? onToggleSelected?.(task.id) : onDetail(task)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative", borderRadius: 10, border: `1px solid ${C.border}`,
        background: C.surface2, cursor: "pointer",
        borderLeft: accentColor ? `3px solid ${accentColor}` : `3px solid ${p.dot}30`,
        opacity: isDragging ? 0.4 : isDone ? 0.55 : 1,
        boxShadow: isDragging ? `0 12px 40px rgba(0,0,0,0.5)` : "none",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border2 }}
      onMouseLeave={e => {
        const element = e.currentTarget as HTMLElement
        element.style.borderColor = C.border
        element.style.borderLeftColor = accentColor || `${p.dot}30`
      }}
    >
      {/* Timer indicator */}
      {hasTimer && (
        <div style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: "50%", background: C.emerald, animation: "pulse 2s infinite" }} />
      )}

      <div style={{ padding: compact ? "8px 10px" : "10px 12px" }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          {selectionMode ? (
            <input
              type="checkbox"
              checked={selected}
              aria-label={`Select ${task.title}`}
              onClick={e => e.stopPropagation()}
              onChange={() => onToggleSelected?.(task.id)}
              style={{ marginTop: 2, accentColor: C.indigo, cursor: "pointer" }}
            />
          ) : (
            <button onClick={e => { e.stopPropagation(); onUpdate(task.id, { status: isDone ? "todo" : "done" }) }}
              style={{ background: "none", border: "none", cursor: "pointer", color: isDone ? C.emerald : C.muted, display: "flex", flexShrink: 0, marginTop: 1 }}>
              {isDone ? <CheckCircle size={15} /> : <Circle size={15} />}
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {meta.emoji && <span style={{ fontSize: 13 }}>{meta.emoji}</span>}
              {meta.starred && <Star size={10} color={C.amber} />}
              {meta.pinned && <Pin size={10} color={C.cyan} />}
            </div>
            <p style={{
              fontSize: compact ? 12 : 13, fontWeight: 600, color: isDone ? C.muted : C.text,
              textDecoration: isDone ? "line-through" : "none",
              lineHeight: 1.4, margin: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: compact ? "nowrap" : "normal",
              display: compact ? "block" : "-webkit-box",
              WebkitLineClamp: compact ? undefined : 2,
              WebkitBoxOrient: "vertical",
            }}>{task.title}</p>
          </div>
          {/* Actions */}
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {!selectionMode && (
              <button
                {...attributes}
                {...listeners}
                title="Drag task"
                aria-label={`Drag ${task.title}`}
                style={{ background: "none", border: "none", cursor: "grab", color: C.muted, padding: 2, borderRadius: 4, display: "flex", touchAction: "none" }}
              >
                <GripVertical size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        {!compact && task.description && (
          <p style={{ fontSize: 11, color: C.muted, marginBottom: 7, paddingLeft: 22, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.description}
          </p>
        )}

        {/* Subtask progress */}
        {subtasksTotal > 0 && (
          <div style={{ paddingLeft: 22, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 3, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, width: `${(subtasksDone / subtasksTotal) * 100}%`, background: subtasksDone === subtasksTotal ? C.emerald : C.indigo, transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", flexShrink: 0 }}>{subtasksDone}/{subtasksTotal}</span>
            </div>
          </div>
        )}

        {/* Footer row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", paddingLeft: 22 }}>
          <span style={{
            fontSize: 9, padding: "2px 6px", borderRadius: 99,
            background: p.bg, color: p.color, fontWeight: 700,
          }}>{p.icon} {p.label}</span>

          {task.due_date && (
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 99, fontFamily: "monospace",
              background: isOverdue ? "rgba(244,63,94,0.12)" : "rgba(255,255,255,0.04)",
              color: isOverdue ? C.rose : (daysUntilDue !== null && daysUntilDue <= 2 ? C.orange : C.muted),
            }}>
              📅 {isOverdue ? `${Math.abs(daysUntilDue!)}d late` : daysUntilDue === 0 ? "Today" : daysUntilDue === 1 ? "Tomorrow" : formatDueDate(task.due_date)}
            </span>
          )}

          {(meta.storyPoints || 0) > 0 && (
            <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "rgba(139,92,246,0.12)", color: C.violet, fontWeight: 700 }}>{meta.storyPoints}sp</span>
          )}

          {(meta.comments || []).length > 0 && (
            <span style={{ fontSize: 9, color: C.muted, display: "flex", alignItems: "center", gap: 2 }}>
              <MessageSquare size={8} />{(meta.comments || []).length}
            </span>
          )}

          {(meta.links || []).length > 0 && (
            <span style={{ fontSize: 9, color: C.muted, display: "flex", alignItems: "center", gap: 2 }}>
              <Link size={8} />{(meta.links || []).length}
            </span>
          )}

          {(meta.timeTracked || 0) > 0 && (
            <span style={{ fontSize: 9, color: C.muted, display: "flex", alignItems: "center", gap: 2 }}>
              <Timer size={8} />{fmtTime(meta.timeTracked || 0)}
            </span>
          )}

          {(task.labels || []).slice(0, 2).map(l => (
            <span key={l} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: "rgba(255,255,255,0.05)", color: C.muted }}>{l}</span>
          ))}
        </div>

        {!selectionMode && (
          <div
            className="task-card-actions"
            onClick={e => e.stopPropagation()}
            style={{ display: "flex", gap: 6, marginTop: 9, paddingTop: 8, borderTop: `1px solid ${C.border}` }}
          >
            <button
              onClick={() => onEdit(task)}
              title="Edit task"
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                minHeight: 28, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)",
                cursor: "pointer", color: C.indigo, padding: "5px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              }}
            >
              <Edit3 size={12} />Edit
            </button>
            <DeleteButton
              onClick={() => void onDelete(task.id)}
              label="Delete"
              title="Delete task"
              aria-label={`Delete ${task.title}`}
              style={{
                flex: 1,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── KANBAN COLUMN ────────────────────────────────────────────────────────── */
function KanbanColumn({ column, tasks, onAddTask, onUpdateTask, onDeleteTask, onEditTask, onDetailTask, compact, collapsed, onToggleCollapse, wipLimit, selectionMode, selectedIds, onToggleSelected }: {
  column: Column; tasks: Task[]
  onAddTask: (col: string) => void
  onUpdateTask: (id: string, data: UpdateTaskData) => void
  onDeleteTask: (id: string) => Promise<boolean>
  onEditTask: (task: Task) => void
  onDetailTask: (task: Task) => void
  compact?: boolean
  collapsed?: boolean
  onToggleCollapse: () => void
  wipLimit?: number
  selectionMode?: boolean
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column", status: statusForColumn(column) },
  })
  const doneTasks = tasks.filter(t => t.status === "done").length
  const overdueTasks = tasks.filter(isTaskOverdue).length
  const colColor = column.color || COLUMN_COLORS[column.name] || C.indigo
  const isAtWipLimit = wipLimit && tasks.length >= wipLimit
  const totalPoints = tasks.reduce((acc, t) => acc + (getTaskMeta(t.id).storyPoints || 0), 0)

  if (collapsed) {
    return (
      <div ref={setDropRef} className="task-column task-column-collapsed" style={{
        flexShrink: 0, width: 40, background: C.surface, borderRadius: 12,
        border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center",
        padding: "12px 0", gap: 8, cursor: "pointer",
      }} onClick={onToggleCollapse}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: colColor }} />
        <span style={{ fontSize: 11, color: C.muted, writingMode: "vertical-lr", transform: "rotate(180deg)", fontWeight: 600 }}>{column.name}</span>
        <span style={{ fontSize: 10, padding: "2px 5px", borderRadius: 99, background: "rgba(255,255,255,0.05)", color: C.muted }}>{tasks.length}</span>
      </div>
    )
  }

  return (
    <div ref={setDropRef} className="task-column" style={{
      flexShrink: 0, width: 280, display: "flex", flexDirection: "column",
      background: isOver ? "rgba(99,102,241,0.06)" : C.surface,
      borderRadius: 12,
      border: `1px solid ${isOver ? C.indigo : isAtWipLimit ? "rgba(244,63,94,0.4)" : C.border}`,
      transition: "background 0.12s, border-color 0.12s",
    }}>
      {/* Column header */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: colColor }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{column.name}</span>
            <span style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 99,
              background: isAtWipLimit ? "rgba(244,63,94,0.15)" : "rgba(255,255,255,0.06)",
              color: isAtWipLimit ? C.rose : C.muted, fontFamily: "monospace",
            }}>
              {tasks.length}{wipLimit ? `/${wipLimit}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {overdueTasks > 0 && (
              <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 99, background: "rgba(244,63,94,0.1)", color: C.rose }}>
                ⚠ {overdueTasks}
              </span>
            )}
            {totalPoints > 0 && (
              <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 99, background: "rgba(139,92,246,0.1)", color: C.violet }}>
                {totalPoints}sp
              </span>
            )}
            <button onClick={onToggleCollapse} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}>
              <Minimize2 size={11} />
            </button>
          </div>
        </div>
        {tasks.length > 0 && (
          <div style={{ height: 2, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 99, transition: "width 0.5s", width: `${tasks.length > 0 ? (doneTasks / tasks.length) * 100 : 0}%`, background: colColor }} />
          </div>
        )}
        {isAtWipLimit && (
          <div style={{ marginTop: 6, fontSize: 10, color: C.rose, display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={9} />WIP limit reached
          </div>
        )}
      </div>

      {/* Tasks */}
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 48 }}>
          {tasks.length === 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "20px 0", color: C.muted, fontSize: 12,
              border: `2px dashed ${C.border}`, borderRadius: 8,
            }}>Drop here</div>
          )}
          {tasks.map(t => (
            <TaskCard key={t.id} task={t}
              onUpdate={onUpdateTask} onDelete={onDeleteTask} onEdit={onEditTask} onDetail={onDetailTask}
              compact={compact}
              selectionMode={selectionMode}
              selected={selectedIds.has(t.id)}
              onToggleSelected={onToggleSelected}
            />
          ))}
        </div>
      </SortableContext>

      <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.border}` }}>
        <button onClick={() => onAddTask(column.name)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 7,
          background: "none", border: "none", cursor: "pointer",
          color: C.muted, padding: "6px 10px", borderRadius: 7, fontSize: 12,
          transition: "all 0.12s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.08)"; (e.currentTarget as HTMLElement).style.color = C.indigo }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.muted }}
        >
          <Plus size={13} />Add task
        </button>
      </div>
    </div>
  )
}

/* ─── LIST VIEW ────────────────────────────────────────────────────────────── */
function ListView({ tasks, columns, onUpdate, onDelete, onEdit, onDetail, selectionMode, selectedIds, onToggleSelected }: {
  tasks: Task[]; columns: Column[]
  onUpdate: (id: string, data: UpdateTaskData) => void
  onDelete: (id: string) => Promise<boolean>; onEdit: (t: Task) => void; onDetail: (t: Task) => void
  selectionMode?: boolean; selectedIds: Set<string>; onToggleSelected: (id: string) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {columns.map(col => {
        const status = statusForColumn(col)
        const colTasks = tasks.filter(t => t.status === status)
        if (colTasks.length === 0) return null
        const colColor = COLUMN_COLORS[col.name] || C.indigo
        return (
          <div key={col.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: colColor }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>{col.name}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{colTasks.length}</span>
            </div>
            {colTasks.map(t => {
              const p = PRIORITY[t.priority as keyof typeof PRIORITY] || PRIORITY.medium
              const isOverdue = isTaskOverdue(t)
              const meta = getTaskMeta(t.id)
              return (
                <div key={t.id} onClick={() => selectionMode ? onToggleSelected(t.id) : onDetail(t)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                  marginBottom: 3, cursor: "pointer", transition: "all 0.12s",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = C.border2}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.border}
                >
                  {selectionMode ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      aria-label={`Select ${t.title}`}
                      onClick={e => e.stopPropagation()}
                      onChange={() => onToggleSelected(t.id)}
                      style={{ accentColor: C.indigo, cursor: "pointer" }}
                    />
                  ) : (
                    <button onClick={e => { e.stopPropagation(); onUpdate(t.id, { status: t.status === "done" ? "todo" : "done" }) }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: t.status === "done" ? C.emerald : C.muted, display: "flex" }}>
                      {t.status === "done" ? <CheckCircle size={15}/> : <Circle size={15}/>}
                    </button>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.status === "done" ? C.muted : C.text, flex: 1, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span>
                  {meta.emoji && <span>{meta.emoji}</span>}
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: p.bg, color: p.color }}>{p.label}</span>
                  {t.due_date && <span style={{ fontSize: 10, color: isOverdue ? C.rose : C.muted, fontFamily: "monospace" }}>{formatDueDate(t.due_date)}</span>}
                  {(meta.storyPoints || 0) > 0 && <span style={{ fontSize: 10, color: C.violet, fontWeight: 700 }}>{meta.storyPoints}sp</span>}
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => onEdit(t)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><Edit3 size={12}/></button>
                    <DeleteButton
                      onClick={() => void onDelete(t.id)}
                      title="Delete task"
                      aria-label={`Delete ${t.title}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* ─── SPRINT BANNER ────────────────────────────────────────────────────────── */
function SprintBanner({ meta, onChange }: { meta: BoardMeta; onChange: (patch: Partial<BoardMeta>) => void }) {
  const [editing, setEditing] = useState(false)
  if (!meta.sprintName && !editing) return null
  return (
    <div style={{
      padding: "8px 16px", background: "rgba(99,102,241,0.08)",
      borderBottom: `1px solid rgba(99,102,241,0.15)`,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <Zap size={13} color={C.indigo} />
      {editing ? (
        <>
          <input value={meta.sprintName || ""} onChange={e => onChange({ sprintName: e.target.value })}
            placeholder="Sprint name..." autoFocus
            style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, flex: 1 }} />
          <input value={meta.sprintGoal || ""} onChange={e => onChange({ sprintGoal: e.target.value })}
            placeholder="Sprint goal..."
            style={{ background: "transparent", border: "none", outline: "none", color: C.muted, fontSize: 12, flex: 2 }} />
          <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.emerald, fontSize: 12 }}>Done</button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.indigo }}>🏃 {meta.sprintName}</span>
          {meta.sprintGoal && <span style={{ fontSize: 12, color: C.muted }}>— {meta.sprintGoal}</span>}
          <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><Edit3 size={11} /></button>
        </>
      )}
    </div>
  )
}

/* ─── AI DAILY STANDUP ─────────────────────────────────────────────────────── */
function StandupModal({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [suggestion, setSuggestion] = useState("")

  useEffect(() => {
    const items = tasks
      .filter(t => t.status !== "done")
      .map(t => ({ title: t.title, due_date: t.due_date || undefined, priority: t.priority }))
    if (items.length === 0) {
      const timer = window.setTimeout(() => {
        setSuggestion("Everything is complete. There are no open tasks to prioritize.")
        setLoading(false)
      }, 0)
      return () => window.clearTimeout(timer)
    }
    let cancelled = false
    prioritizeTasks(items)
      .then(result => {
        if (!cancelled) setSuggestion(result.response)
      })
      .catch((error: unknown) => {
        const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
        if (!cancelled) setSuggestion(detail || "AI unavailable.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [tasks])

  const inProgress = tasks.filter(t => t.status === "in_progress")
  const overdue = tasks.filter(isTaskOverdue)

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 500, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(99,102,241,0.08)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>☀️ Daily Standup</span>
          <Btn onClick={onClose}><X size={14} /></Btn>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>In Progress ({inProgress.length})</div>
            {inProgress.length === 0 ? <p style={{ fontSize: 13, color: C.muted }}>Nothing in progress</p> : inProgress.map(t => (
              <div key={t.id} style={{ fontSize: 13, color: C.text, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>• {t.title}</div>
            ))}
          </div>
          {overdue.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: C.rose, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>⚠ Overdue ({overdue.length})</div>
              {overdue.map(t => <div key={t.id} style={{ fontSize: 13, color: C.rose, padding: "4px 0" }}>• {t.title}</div>)}
            </div>
          )}
          <div style={{ background: "rgba(99,102,241,0.08)", borderRadius: 10, padding: 14, border: `1px solid rgba(99,102,241,0.15)` }}>
            <div style={{ fontSize: 11, color: C.indigo, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={12} />AI RECOMMENDATION
            </div>
            {loading ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Loader2 size={14} color={C.indigo} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 13, color: C.muted }}>Analyzing your tasks…</span>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: 0 }}>{suggestion}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── MAIN COMPONENT ───────────────────────────────────────────────────────── */
export default function TaskBoard() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const searchRef = useRef<HTMLInputElement>(null)
  const projectRequestRef = useRef(0)

  /* Data */
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [boardLoading, setBoardLoading] = useState(false)

  /* UI State */
  const [search, setSearch] = useState("")
  const [filterPriority, setFilterPriority] = useState("all")
  const [filterLabel, setFilterLabel] = useState("")
  const [showDone, setShowDone] = useState(true)
  const [view, setView] = useState<"kanban"|"list">("kanban")
  const [compactMode, setCompactMode] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)

  /* Panels */
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showStandup, setShowStandup] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showNewTask, setShowNewTask] = useState(false)
  const [showEditTask, setShowEditTask] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [newTaskColumn, setNewTaskColumn] = useState("")

  /* Board meta */
  const [boardMeta, setBoardMetaState] = useState<BoardMeta>({})
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())

  /* Form */
  const [projectName, setProjectName] = useState("")
  const [projectColor, setProjectColor] = useState("#6366F1")
  const [taskForm, setTaskForm] = useState<TaskFormType>({ title: "", description: "", priority: "medium", due_date: "", labels: [], labelInput: "" })
  const [saving, setSaving] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [showBulk, setShowBulk] = useState(false)

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])

  const patchBoardMeta = (patch: Partial<BoardMeta>) => {
    if (!selectedProject) return
    const next = { ...boardMeta, ...patch }
    setBoardMetaState(next)
    setBoardMeta(selectedProject.id, next)
  }

  const selectProject = useCallback(async (project: Project) => {
    const requestId = ++projectRequestRef.current
    setBoardLoading(true)
    setSelectedProject(project)
    setTasks([]); setColumns([])
    setBulkSelected(new Set())
    const meta = getBoardMeta(project.id)
    setBoardMetaState(meta)
    if (window.matchMedia("(max-width: 768px)").matches) setShowSidebar(false)
    try {
      const [colData, taskData] = await Promise.all([getColumns(project.id), getTasks(project.id)])
      if (requestId !== projectRequestRef.current) return
      setColumns(colData.columns || [])
      setTasks(taskData.tasks || [])
      const overdueTasks = (taskData.tasks || []).filter(isTaskOverdue)
      if (overdueTasks.length > 0) {
        toast(`⚠️ ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`, {
          duration: 4000,
          style: { background: "#2D0A0A", color: "#FCA5A5", border: "1px solid #7F1D1D" },
        })
      }
    } catch {
      if (requestId === projectRequestRef.current) toast.error("Failed to load board")
    } finally {
      if (requestId === projectRequestRef.current) setBoardLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getProjects()
      .then(data => {
        if (cancelled) return
        const nextProjects = data.projects || []
        setProjects(nextProjects)
        if (nextProjects.length > 0) void selectProject(nextProjects[0])
        else {
          setSelectedProject(null)
          setColumns([])
          setTasks([])
          setBoardLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load projects")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectProject])

  useKeyboard({
    "ctrl+k": () => searchRef.current?.focus(),
    "ctrl+n": () => {
      if (selectedProject) {
        setNewTaskColumn(columns[0]?.name || "To Do")
        setTaskForm({ title: "", description: "", priority: "medium", due_date: "", labels: [], labelInput: "" })
        setShowNewTask(true)
      }
    },
    "ctrl+shift+l": () => setView(v => v === "kanban" ? "list" : "kanban"),
    "escape": () => { setShowNewProject(false); setShowNewTask(false); setShowEditTask(false); setShowStandup(false); setDetailTask(null) },
  })

  /* Computed */
  const allLabels = useMemo(() => {
    const s = new Set<string>()
    tasks.forEach(t => (t.labels || []).forEach(l => s.add(l)))
    return Array.from(s)
  }, [tasks])

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (!showDone && t.status === "done") return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false
    if (filterPriority !== "all" && t.priority !== filterPriority) return false
    if (filterLabel && !(t.labels || []).includes(filterLabel)) return false
    return true
  }), [tasks, search, filterPriority, filterLabel, showDone])

  const getTasksForColumn = (column: Column) => {
    const status = statusForColumn(column)
    return filteredTasks.filter(t => t.status === status).sort((a, b) => a.position - b.position)
  }

  /* Stats */
  const total = tasks.length
  const done = tasks.filter(t => t.status === "done").length
  const overdue = tasks.filter(isTaskOverdue).length
  const critical = tasks.filter(t => t.priority === "critical" && t.status !== "done").length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  /* Handlers */
  const handleCreateProject = async () => {
    if (!projectName.trim()) { toast.error("Name required"); return }
    setSaving(true)
    try {
      const data = await createProject({ name: projectName, color: projectColor })
      toast.success("Project created! 🚀")
      setShowNewProject(false); setProjectName("")
      setProjects(prev => [data.project, ...prev])
      await selectProject(data.project)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || "Failed")
    } finally { setSaving(false) }
  }

  const handleDeleteProject = async (p: Project) => {
    if (!confirm(`Delete "${p.name}"?`)) return
    try {
      await deleteProject(p.id)
      toast.success("Deleted")
      const remaining = projects.filter(project => project.id !== p.id)
      setProjects(remaining)
      if (selectedProject?.id === p.id) {
        projectRequestRef.current += 1
        if (remaining.length > 0) await selectProject(remaining[0])
        else {
          setSelectedProject(null)
          setColumns([])
          setTasks([])
          setBoardLoading(false)
        }
      }
    } catch { toast.error("Failed") }
  }

  const handleAddTask = (col: string) => {
    setNewTaskColumn(col)
    setTaskForm({ title: "", description: "", priority: "medium", due_date: "", labels: [], labelInput: "" })
    setShowNewTask(true)
  }

  const handleCreateTask = async () => {
    if (!taskForm.title.trim() || !selectedProject) {
      toast.error("Task title is required")
      return
    }
    setSaving(true)
    const status = statusForColumn(newTaskColumn || columns[0]?.name || "To Do")
    try {
      const data = await createTask(selectedProject.id, {
        title: taskForm.title.trim(), description: taskForm.description,
        status, priority: taskForm.priority,
        due_date: taskForm.due_date || null, labels: taskForm.labels,
      })
      setTasks(prev => [...prev, data.task])
      toast.success("Task added ✅")
      setShowNewTask(false)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || "Failed")
    } finally { setSaving(false) }
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskForm({ title: task.title, description: task.description || "", priority: task.priority, due_date: task.due_date || "", labels: task.labels || [], labelInput: "" })
    setShowEditTask(true)
  }

  const handleUpdateTaskForm = async () => {
    if (!editingTask || !taskForm.title.trim()) {
      toast.error("Task title is required")
      return
    }
    setSaving(true)
    try {
      const data = await updateTask(editingTask.id, { title: taskForm.title.trim(), description: taskForm.description, priority: taskForm.priority, due_date: taskForm.due_date || null, labels: taskForm.labels })
      setTasks(prev => prev.map(t => t.id === editingTask.id ? data.task : t))
      setDetailTask(current => current?.id === editingTask.id ? data.task : current)
      toast.success("Updated ✅")
      setShowEditTask(false)
    } catch { toast.error("Failed") }
    finally { setSaving(false) }
  }

  const handleUpdateTask = async (taskId: string, updates: UpdateTaskData) => {
    try {
      const data = await updateTask(taskId, updates)
      setTasks(prev => prev.map(t => t.id === taskId ? data.task : t))
      setDetailTask(current => current?.id === taskId ? data.task : current)
      if (updates.status === "done") toast.success("Completed! 🎉")
    } catch { toast.error("Failed to update") }
  }

  const handleDeleteTask = async (taskId: string): Promise<boolean> => {
    const task = tasks.find(item => item.id === taskId)
    if (!window.confirm(`Delete "${task?.title || "this task"}"? This cannot be undone.`)) {
      return false
    }
    try {
      await deleteTask(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setBulkSelected(prev => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
      setDetailTask(current => current?.id === taskId ? null : current)
      try { localStorage.removeItem(`fd_task_${taskId}`) } catch { /* Optional metadata cleanup. */ }
      toast.success("Task deleted")
      return true
    } catch {
      toast.error("Failed to delete task")
      return false
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const activeTask = tasks.find(t => t.id === activeId)
    const overTask = tasks.find(t => t.id === overId)
    const targetColumn = overId.startsWith("column:")
      ? columns.find(column => column.id === overId.slice("column:".length))
      : columns.find(column => statusForColumn(column) === overTask?.status)
    if (!activeTask || !targetColumn) return

    const targetStatus = statusForColumn(targetColumn)
    const wipLimit = boardMeta.wip?.[targetColumn.id]
    const targetCount = tasks.filter(task => task.status === targetStatus && task.id !== activeTask.id).length
    if (activeTask.status !== targetStatus && wipLimit && targetCount >= wipLimit) {
      toast.error(`${targetColumn.name} has reached its WIP limit`)
      return
    }

    const targetTasks = tasks
      .filter(task => task.status === targetStatus && task.id !== activeTask.id)
      .sort((a, b) => a.position - b.position)
    let insertIndex = targetTasks.length
    if (overTask) {
      const overIndex = targetTasks.findIndex(task => task.id === overTask.id)
      if (overIndex >= 0) {
        insertIndex = overIndex
        if (activeTask.status === targetStatus && activeTask.position < overTask.position) insertIndex += 1
      }
    }
    const before = targetTasks[insertIndex - 1]
    const after = targetTasks[insertIndex]
    const position = before && after
      ? (before.position + after.position) / 2
      : before
        ? before.position + 1
        : after
          ? after.position - 1
          : 0
    const previousTask = activeTask
    setTasks(prev => prev.map(task =>
      task.id === activeTask.id ? { ...task, status: targetStatus, position } : task
    ))
    try {
      const data = await updateTask(activeTask.id, { status: targetStatus, position })
      setTasks(prev => prev.map(task => task.id === activeTask.id ? data.task : task))
    } catch {
      setTasks(prev => prev.map(task => task.id === previousTask.id ? previousTask : task))
      toast.error("Failed to move task")
    }
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${bulkSelected.size} tasks?`)) return
    const ids = Array.from(bulkSelected)
    try {
      await Promise.all(ids.map(id => deleteTask(id)))
      setTasks(prev => prev.filter(task => !bulkSelected.has(task.id)))
      ids.forEach(id => localStorage.removeItem(`fd_task_${id}`))
      setBulkSelected(new Set()); setShowBulk(false)
      toast.success(`Deleted ${ids.length} tasks`)
    } catch {
      toast.error("Some tasks could not be deleted")
      if (selectedProject) await selectProject(selectedProject)
    }
  }

  const handleBulkComplete = async () => {
    const ids = Array.from(bulkSelected)
    try {
      const results = await Promise.all(ids.map(id => updateTask(id, { status: "done" })))
      const updated = new Map(results.map(result => [result.task.id, result.task]))
      setTasks(prev => prev.map(task => updated.get(task.id) || task))
      setBulkSelected(new Set()); setShowBulk(false)
      toast.success(`Completed ${ids.length} tasks`)
    } catch {
      toast.error("Some tasks could not be completed")
      if (selectedProject) await selectProject(selectedProject)
    }
  }

  const toggleBulkSelection = (taskId: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleBulkMode = () => {
    if (showBulk) setBulkSelected(new Set())
    setShowBulk(!showBulk)
  }

  const handleExport = () => {
    const data = JSON.stringify({ project: selectedProject?.name, tasks: tasks.map(t => ({ title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, labels: t.labels })) }, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedProject?.name || "tasks"}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success("Exported!")
  }

  const toggleColCollapse = (colId: string) => {
    const next = new Set(collapsedCols)
    if (next.has(colId)) next.delete(colId); else next.add(colId)
    setCollapsedCols(next)
  }

  const STAT_ITEMS = [
    { label: "Total", value: total, color: C.indigo },
    { label: "Done", value: done, color: C.emerald },
    { label: "Overdue", value: overdue, color: C.rose },
    { label: "Critical", value: critical, color: C.orange },
  ]

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 99px; }
        * { box-sizing: border-box; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.4); }
        .task-mobile-backdrop { display: none; }
        @media (max-width: 768px) { .desktop-only { display: none !important; } }
        @media (min-width: 769px) { .mobile-only { display: none !important; } }
        @media (max-width: 768px) {
          .task-header { padding: 0 8px !important; gap: 6px !important; }
          .task-project-name { max-width: 90px !important; }
          .task-filter-bar { padding: 8px !important; align-content: flex-start; }
          .task-priority-filter { width: 100%; overflow-x: auto; padding-bottom: 2px; }
          .task-priority-filter button { flex-shrink: 0; }
          .task-mobile-backdrop {
            display: block; position: fixed; inset: 52px 0 0; z-index: 250;
            background: rgba(0,0,0,0.58); border: 0;
          }
          .task-sidebar {
            position: fixed !important; top: 52px; bottom: 0; left: 0; z-index: 300;
            width: min(82vw, 280px) !important; box-shadow: 18px 0 48px rgba(0,0,0,0.55);
          }
          .task-board-area { padding: 10px !important; }
          .task-columns { height: auto !important; min-height: 100%; }
          .task-column:not(.task-column-collapsed) { width: min(84vw, 300px) !important; }
          .task-add-column { width: 140px !important; }
          .task-form-grid { grid-template-columns: 1fr !important; }
          .task-detail-drawer { max-width: 100% !important; border-left: 0 !important; }
          .task-detail-tabs { overflow-x: auto; }
          .task-detail-tabs button { flex-shrink: 0; }
          .project-delete { opacity: 1 !important; }
        }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="task-header" style={{ borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "0 14px", height: 52, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}>
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setShowSidebar(open => !open)}
          title={showSidebar ? "Close projects" : "Open projects"}
          aria-label={showSidebar ? "Close project sidebar" : "Open project sidebar"}
          aria-expanded={showSidebar}
          style={{
            background: showSidebar ? "rgba(99,102,241,0.15)" : "transparent",
            border: "none",
            borderRadius: 7,
            color: showSidebar ? C.indigo : C.muted,
            cursor: "pointer",
            display: "flex",
            padding: 5,
          }}
        >
          {showSidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <Kanban className="desktop-only" size={18} color={C.indigo} />
        <span className="desktop-only" style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Tasks</span>

        {selectedProject && (
          <>
            <div className="desktop-only" style={{ width: 1, height: 18, background: C.border }} />
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: selectedProject.color }} />
            <span className="task-project-name" style={{ fontSize: 14, fontWeight: 600, color: C.text, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedProject.name}</span>

            {/* Progress */}
            {total > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }} className="desktop-only">
                <div style={{ width: 80, height: 4, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, background: C.emerald, width: `${progress}%`, transition: "width 0.5s" }} />
                </div>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{progress}%</span>
              </div>
            )}

            {/* Quick stats */}
            <div style={{ display: "flex", gap: 8, marginLeft: 4 }} className="desktop-only">
              {STAT_ITEMS.map(s => (
                <span key={s.label} style={{ fontSize: 11, color: s.value > 0 && (s.label === "Overdue" || s.label === "Critical") ? s.color : C.muted, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 3 }}>
                  {s.value > 0 && (s.label === "Overdue" || s.label === "Critical") && <span style={{ color: s.color }}>●</span>}
                  {s.label}: {s.value}
                </span>
              ))}
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Header actions */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {/* Sprint toggle */}
          {selectedProject && (
            <Btn onClick={() => patchBoardMeta({ sprintName: boardMeta.sprintName ? undefined : "Sprint 1" })} title="Toggle Sprint" active={!!boardMeta.sprintName} className="desktop-only">
              <Zap size={14} />
            </Btn>
          )}

          {/* Standup */}
          {selectedProject && (
            <Btn onClick={() => setShowStandup(true)} title="Daily Standup" className="desktop-only">
              <Coffee size={14} /><span className="desktop-only" style={{ fontSize: 12, marginLeft: 2 }}>Standup</span>
            </Btn>
          )}

          {/* View toggle */}
          {selectedProject && (
            <div className="desktop-only" style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <button onClick={() => setView("kanban")} title="Kanban view" style={{
                padding: "5px 8px", background: view === "kanban" ? "rgba(99,102,241,0.2)" : "transparent",
                border: "none", cursor: "pointer", color: view === "kanban" ? C.indigo : C.muted, display: "flex",
              }}><Grid size={14} /></button>
              <button onClick={() => setView("list")} title="List view" style={{
                padding: "5px 8px", background: view === "list" ? "rgba(99,102,241,0.2)" : "transparent",
                border: "none", cursor: "pointer", color: view === "list" ? C.indigo : C.muted, display: "flex",
              }}><List size={14} /></button>
            </div>
          )}

          {/* Compact */}
          {selectedProject && view === "kanban" && (
            <Btn onClick={() => setCompactMode(c => !c)} active={compactMode} title="Compact mode" className="desktop-only">
              <Minimize2 size={14} />
            </Btn>
          )}

          {/* Analytics */}
          {selectedProject && (
            <Btn onClick={() => setShowAnalytics(a => !a)} active={showAnalytics} title="Analytics" className="desktop-only">
              <BarChart2 size={14} />
            </Btn>
          )}

          {/* Export */}
          {selectedProject && (
            <Btn onClick={handleExport} title="Export JSON" className="desktop-only">
              <Download size={14} />
            </Btn>
          )}

          {/* Bulk mode */}
          {selectedProject && (
            <Btn onClick={toggleBulkMode} active={showBulk} title="Bulk select" className="desktop-only">
              <Layers size={14} />
            </Btn>
          )}

          {/* New project */}
          <button onClick={() => setShowNewProject(true)} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C.indigo, border: "none", borderRadius: 8,
            padding: "6px 12px", color: "#fff", cursor: "pointer",
            fontSize: 13, fontWeight: 700,
          }}>
            <Plus size={14} /><span className="desktop-only">New Project</span>
          </button>

        </div>
      </div>

      {/* Sprint Banner */}
      {selectedProject && boardMeta.sprintName && (
        <SprintBanner meta={boardMeta} onChange={patchBoardMeta} />
      )}

      {/* Bulk action bar */}
      {showBulk && (
        <div style={{ background: "rgba(99,102,241,0.1)", borderBottom: `1px solid rgba(99,102,241,0.2)`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.indigo, fontWeight: 700 }}>
            {bulkSelected.size > 0 ? `${bulkSelected.size} selected` : "Select tasks to run bulk actions"}
          </span>
          <div style={{ flex: 1 }} />
          <Btn onClick={handleBulkComplete} disabled={bulkSelected.size === 0} variant="outline" style={{ fontSize: 12 }}><CheckCircle size={12} />Complete</Btn>
          <DeleteButton onClick={handleBulkDelete} disabled={bulkSelected.size === 0} label="Delete" style={{ fontSize: 12 }} />
          <Btn onClick={toggleBulkMode} style={{ fontSize: 12 }}><X size={12} />Done</Btn>
        </div>
      )}

      {/* Search & Filter bar */}
      {selectedProject && (
        <div className="task-filter-bar" style={{ borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ position: "relative", flex: "1 1 180px", minWidth: 120, maxWidth: 320 }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks… (Ctrl+K)"
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px 6px 28px", color: C.text, fontSize: 13, outline: "none" }} />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={11} /></button>}
          </div>

          {/* Priority filter */}
          <div className="task-priority-filter" style={{ display: "flex", gap: 3 }}>
            {["all","critical","high","medium","low"].map(p => {
              const pr = PRIORITY[p as keyof typeof PRIORITY]
              return (
                <button key={p} onClick={() => setFilterPriority(p)} style={{
                  fontSize: 11, padding: "4px 8px", borderRadius: 99, border: "none", cursor: "pointer",
                  background: filterPriority === p ? (pr ? pr.bg : "rgba(99,102,241,0.15)") : "rgba(255,255,255,0.03)",
                  color: filterPriority === p ? (pr ? pr.color : C.indigo) : C.muted, fontWeight: 600, transition: "all 0.12s",
                }}>{p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}</button>
              )
            })}
          </div>

          {/* Label filter */}
          {allLabels.length > 0 && (
            <div style={{ display: "flex", gap: 3, overflowX: "auto" }}>
              {allLabels.slice(0, 4).map(l => (
                <button key={l} onClick={() => setFilterLabel(filterLabel === l ? "" : l)} style={{
                  fontSize: 11, padding: "4px 8px", borderRadius: 99, border: "none", cursor: "pointer",
                  background: filterLabel === l ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                  color: filterLabel === l ? C.indigo : C.muted,
                }}>#{l}</button>
              ))}
            </div>
          )}

          {/* Show done toggle */}
          <Btn onClick={() => setShowDone(s => !s)} active={!showDone} title={showDone ? "Hide done" : "Show done"}>
            {showDone ? <Eye size={13} /> : <EyeOff size={13} />}
          </Btn>

          {/* Quick add */}
          <Btn onClick={() => { setTaskForm({ title: "", description: "", priority: "medium", due_date: "", labels: [], labelInput: "" }); setNewTaskColumn(columns[0]?.name || "To Do"); setShowNewTask(true) }} variant="primary" title="Ctrl+N">
            <Plus size={13} />Quick Add
          </Btn>

          <div className="mobile-only" style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Btn onClick={() => setView(current => current === "kanban" ? "list" : "kanban")} title="Switch view">
              {view === "kanban" ? <List size={13} /> : <Grid size={13} />}
            </Btn>
            <Btn onClick={() => setShowStandup(true)} title="Daily Standup">
              <Coffee size={13} />
            </Btn>
            <Btn onClick={() => setShowAnalytics(current => !current)} active={showAnalytics} title="Analytics">
              <BarChart2 size={13} />
            </Btn>
            <Btn onClick={handleExport} title="Export JSON">
              <Download size={13} />
            </Btn>
            <Btn onClick={toggleBulkMode} active={showBulk} title="Bulk select">
              <Layers size={13} />
            </Btn>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, position: "relative" }}>
        {showSidebar && (
          <button
            className="task-mobile-backdrop mobile-only"
            aria-label="Close project sidebar"
            onClick={() => setShowSidebar(false)}
          />
        )}
        {/* Sidebar */}
        {showSidebar && (
          <div className="task-sidebar" style={{
            width: 210, flexShrink: 0, borderRight: `1px solid ${C.border}`,
            background: C.surface, display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Projects</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{projects.length}</span>
                <button onClick={() => setShowSidebar(false)} aria-label="Close project sidebar" style={{ background: "none", border: 0, color: C.muted, display: "flex", padding: 2, cursor: "pointer" }}>
                  <X size={14} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                  <Loader2 size={20} color={C.indigo} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : projects.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 12px" }}>
                  <Kanban size={32} color={C.faint} style={{ margin: "0 auto 10px" }} />
                  <p style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>No projects</p>
                  <button onClick={() => setShowNewProject(true)} style={{ color: C.indigo, background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>+ Create one</button>
                </div>
              ) : (
                projects.map(p => {
                  const isSelected = selectedProject?.id === p.id
                  return (
                    <div key={p.id} onClick={() => {
                      void selectProject(p)
                      if (window.matchMedia("(max-width: 768px)").matches) setShowSidebar(false)
                    }} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
                      cursor: "pointer", transition: "all 0.12s", marginBottom: 2,
                      background: isSelected ? "rgba(99,102,241,0.1)" : "transparent",
                      border: `1px solid ${isSelected ? "rgba(99,102,241,0.2)" : "transparent"}`,
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)" }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      <DeleteButton
                        className="project-delete"
                        onClick={e => { e.stopPropagation(); void handleDeleteProject(p) }}
                        title={`Delete ${p.name}`}
                        aria-label={`Delete project ${p.name}`}
                      />
                    </div>
                  )
                })
              )}
            </div>

            {/* Sprint WIP settings */}
            {selectedProject && boardMeta.sprintName && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>WIP Limits</div>
                {columns.map(col => (
                  <div key={col.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>{col.name}</span>
                    <input type="number" min={0} max={20}
                      value={boardMeta.wip?.[col.id] || ""}
                      onChange={e => patchBoardMeta({ wip: { ...boardMeta.wip, [col.id]: parseInt(e.target.value) || 0 } })}
                      placeholder="∞"
                      style={{ width: 40, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 5px", color: C.text, fontSize: 11, outline: "none", textAlign: "center" }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 8px" }}>
              <button onClick={() => setShowNewProject(true)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 7,
                background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "6px 10px", borderRadius: 7, fontSize: 12,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = C.text }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.muted }}
              >
                <Plus size={12} />New Project
              </button>
            </div>
          </div>
        )}

        {/* Board Area */}
        <div className="task-board-area" style={{ flex: 1, overflow: "auto", padding: 14, minHeight: 0 }}>
          {!selectedProject ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 16 }}>
              <Kanban size={64} color={C.faint} />
              <h3 style={{ color: C.muted, fontSize: 18, fontWeight: 700, margin: 0 }}>Enterprise Task Manager</h3>
              <p style={{ color: C.faint, fontSize: 13, margin: 0, textAlign: "center" }}>
                Kanban · List view · Sprints · Analytics · AI standup · Time tracking
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {[["Ctrl+K","Search"],["Ctrl+N","New task"],["Ctrl+Shift+L","Switch view"]].map(([k,l]) => (
                  <span key={k} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: C.muted }}>
                    <span style={{ color: C.indigo, fontFamily: "monospace" }}>{k}</span> {l}
                  </span>
                ))}
              </div>
              <button onClick={() => setShowNewProject(true)} style={{
                display: "flex", alignItems: "center", gap: 8, background: C.indigo, border: "none",
                borderRadius: 10, padding: "10px 20px", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700,
              }}>
                <Plus size={16} />Create First Project
              </button>
            </div>
          ) : boardLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: C.muted, fontSize: 13 }}>
              <Loader2 size={18} color={C.indigo} style={{ animation: "spin 1s linear infinite" }} />
              Loading board...
            </div>
          ) : view === "list" ? (
            <ListView
              tasks={filteredTasks}
              columns={columns}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onEdit={handleEditTask}
              onDetail={setDetailTask}
              selectionMode={showBulk}
              selectedIds={bulkSelected}
              onToggleSelected={toggleBulkSelection}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="task-columns" style={{ display: "flex", gap: 10, alignItems: "flex-start", height: "100%" }}>
                {columns.map(col => (
                  <KanbanColumn key={col.id} column={col}
                    tasks={getTasksForColumn(col)}
                    onAddTask={handleAddTask}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onEditTask={handleEditTask}
                    onDetailTask={setDetailTask}
                    compact={compactMode}
                    collapsed={collapsedCols.has(col.id)}
                    onToggleCollapse={() => toggleColCollapse(col.id)}
                    wipLimit={boardMeta.wip?.[col.id]}
                    selectionMode={showBulk}
                    selectedIds={bulkSelected}
                    onToggleSelected={toggleBulkSelection}
                  />
                ))}
                {/* Add column */}
                <button onClick={async () => {
                  const name = prompt("Column name:")
                  if (!name?.trim() || !selectedProject) return
                  try {
                    const data = await createColumn(selectedProject.id, name.trim())
                    setColumns(prev => [...prev, data.column])
                    toast.success("Column added!")
                  } catch { toast.error("Failed") }
                }} className="task-add-column" style={{
                  flexShrink: 0, width: 160, height: 52,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  border: `2px dashed ${C.border}`, borderRadius: 12,
                  background: "transparent", cursor: "pointer", color: C.muted, fontSize: 12,
                  transition: "all 0.12s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.indigo; (e.currentTarget as HTMLElement).style.color = C.indigo }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted }}
                >
                  <Plus size={14} />Add Column
                </button>
              </div>
            </DndContext>
          )}
        </div>
      </div>

      {/* MODALS & PANELS */}

      {/* New Project */}
      {showNewProject && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}>
          <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 400, border: `1px solid ${C.border}` }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>🚀 New Project</span>
              <Btn onClick={() => setShowNewProject(false)}><X size={15} /></Btn>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <input value={projectName} onChange={e => setProjectName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateProject()}
                placeholder="Project name" autoFocus
                style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 14, outline: "none" }} />
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Color</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PROJECT_COLORS.map(col => (
                    <button key={col} onClick={() => setProjectColor(col)} style={{
                      width: 28, height: 28, borderRadius: "50%", background: col, border: "none", cursor: "pointer",
                      outline: projectColor === col ? `3px solid #fff` : "none", outlineOffset: 2, transition: "all 0.12s",
                    }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
              <Btn onClick={() => setShowNewProject(false)} variant="outline" style={{ flex: 1, justifyContent: "center" }}>Cancel</Btn>
              <Btn onClick={handleCreateProject} disabled={saving} variant="primary" style={{ flex: 2, justifyContent: "center", padding: "9px 0", fontSize: 14, fontWeight: 700 }}>
                {saving ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />Creating…</> : "🚀 Create"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Task form modals */}
      {showNewTask && <TaskFormModal isEdit={false} taskForm={taskForm} setTaskForm={setTaskForm} onSave={handleCreateTask} onClose={() => setShowNewTask(false)} saving={saving} />}
      {showEditTask && <TaskFormModal isEdit={true} taskForm={taskForm} setTaskForm={setTaskForm} onSave={handleUpdateTaskForm} onClose={() => setShowEditTask(false)} saving={saving} />}

      {/* Task Detail Drawer */}
      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Analytics Panel */}
      {showAnalytics && <AnalyticsPanel tasks={tasks} onClose={() => setShowAnalytics(false)} />}

      {/* Standup Modal */}
      {showStandup && <StandupModal tasks={tasks} onClose={() => setShowStandup(false)} />}
    </div>
  )
}
