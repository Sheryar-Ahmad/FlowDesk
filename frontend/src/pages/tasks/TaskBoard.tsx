import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Plus, Trash2, ArrowLeft, Kanban, Calendar,
  X, Loader2, CheckCircle,
  AlertTriangle, Search, Bell, BarChart2,
  Edit3, Save, Circle, Filter
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import {
  getProjects, createProject, deleteProject,
  getColumns, createColumn, getTasks,
  createTask, updateTask, deleteTask
} from "../../services/api/tasks.api"
import type { Project, Column, Task } from "../../services/api/tasks.api"
import { useKeyboard } from "../../hooks/useKeyboard"
import toast from "react-hot-toast"

const PRIORITY = {
  low:      { color: "text-gray-400",   bg: "bg-gray-800",   border: "border-gray-700",   label: "Low",      dot: "#6b7280" },
  medium:   { color: "text-blue-400",   bg: "bg-blue-950",   border: "border-blue-800",   label: "Medium",   dot: "#3b82f6" },
  high:     { color: "text-orange-400", bg: "bg-orange-950", border: "border-orange-800", label: "High",     dot: "#f97316" },
  critical: { color: "text-red-400",    bg: "bg-red-950",    border: "border-red-800",    label: "Critical", dot: "#ef4444" },
}

const COLUMN_COLORS: Record<string, string> = {
  "To Do": "#6366f1", "In Progress": "#f59e0b", "Done": "#10b981",
}

const STATUS_MAP: Record<string, string> = {
  "To Do": "todo", "In Progress": "in_progress", "Done": "done"
}

// ─── Task Form Modal (outside main component) ────────────────────────────────
interface TaskFormProps {
  isEdit: boolean
  taskForm: { title: string; description: string; priority: string; due_date: string; labels: string[]; labelInput: string }
  setTaskForm: (f: { title: string; description: string; priority: string; due_date: string; labels: string[]; labelInput: string }) => void
  onSave: () => void
  onClose: () => void
  saving: boolean
}

function TaskFormModal({ isEdit, taskForm, setTaskForm, onSave, onClose, saving }: TaskFormProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">{isEdit ? "✏️ Edit Task" : "✨ New Task"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Task Title *</label>
            <input type="text" value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="What needs to be done?" autoFocus />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Description</label>
            <textarea value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Add more details..." rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Priority</label>
              <select value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                <option value="low">🔵 Low</option>
                <option value="medium">🔵 Medium</option>
                <option value="high">🟠 High</option>
                <option value="critical">🔴 Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Due Date</label>
              <input type="date" value={taskForm.due_date}
                onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Labels</label>
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {taskForm.labels.map(label => (
                <span key={label} className="flex items-center gap-1 bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                  {label}
                  <button onClick={() => setTaskForm({ ...taskForm, labels: taskForm.labels.filter((l: string) => l !== label) })}
                    className="hover:text-red-400"><X size={9} /></button>
                </span>
              ))}
            </div>
            <input type="text" value={taskForm.labelInput}
              onChange={(e) => setTaskForm({ ...taskForm, labelInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && taskForm.labelInput.trim()) {
                  e.preventDefault()
                  if (!taskForm.labels.includes(taskForm.labelInput.trim())) {
                    setTaskForm({ ...taskForm, labels: [...taskForm.labels, taskForm.labelInput.trim()], labelInput: "" })
                  }
                }
              }}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              placeholder="Type label and press Enter" />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-800">
          <button onClick={onClose} className="flex-1 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Save size={14} />{isEdit ? "Save Changes" : "Create Task"}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Task Card (outside main component) ──────────────────────────────────────
function TaskCard({ task, onUpdate, onDelete, onEdit }: {
  task: Task
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onEdit: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const p = PRIORITY[task.priority as keyof typeof PRIORITY] || PRIORITY.medium
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done"
  const isDone = task.status === "done"
  const daysUntilDue = task.due_date
    ? Math.ceil((new Date(task.due_date).getTime() - new Date().getTime()) / 86400000)
    : null

  return (
    <div ref={setNodeRef} style={style}
      className={`group relative bg-gray-800 rounded-xl border transition-all duration-200 cursor-grab active:cursor-grabbing ${
        isDragging ? "shadow-2xl shadow-indigo-500/30 border-indigo-500 scale-105" :
        isOverdue ? "border-red-800 hover:border-red-600" :
        `${p.border} hover:border-indigo-500`
      } ${isDone ? "opacity-50" : ""}`}
    >
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: p.dot }} />
      <div className="p-3 pl-4" {...attributes} {...listeners}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 flex-1">
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate(task.id, { status: isDone ? "todo" : "done" }) }}
              className={`mt-0.5 flex-shrink-0 transition-colors ${isDone ? "text-green-500 hover:text-gray-500" : "text-gray-600 hover:text-green-500"}`}
            >
              {isDone ? <CheckCircle size={16} /> : <Circle size={16} />}
            </button>
            <p className={`text-sm font-medium flex-1 leading-snug ${isDone ? "line-through text-gray-500" : "text-white"}`}>
              {task.title}
            </p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onEdit(task) }}
              className="text-gray-500 hover:text-indigo-400 p-0.5 rounded"><Edit3 size={12} /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
              className="text-gray-500 hover:text-red-400 p-0.5 rounded"><X size={12} /></button>
          </div>
        </div>

        {task.description && (
          <p className="text-gray-500 text-xs mb-2 pl-6 line-clamp-2">{task.description}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap pl-6">
          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${p.bg} ${p.color}`}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.dot }} />
            {p.label}
          </span>
          {task.due_date && (
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
              isOverdue ? "bg-red-950 text-red-400" :
              daysUntilDue !== null && daysUntilDue <= 2 ? "bg-orange-950 text-orange-400" :
              "bg-gray-700 text-gray-400"
            }`}>
              <Calendar size={9} />
              {isOverdue ? `${Math.abs(daysUntilDue!)}d overdue` :
               daysUntilDue === 0 ? "Today" : daysUntilDue === 1 ? "Tomorrow" :
               new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          {task.labels?.slice(0, 2).map(label => (
            <span key={label} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Column (outside main component) ───────────────────────────────────
function KanbanColumn({ column, tasks, onAddTask, onUpdateTask, onDeleteTask, onEditTask }: {
  column: Column
  tasks: Task[]
  onAddTask: (columnName: string) => void
  onUpdateTask: (id: string, data: Record<string, unknown>) => void
  onDeleteTask: (id: string) => void
  onEditTask: (task: Task) => void
}) {
  const doneTasks = tasks.filter(t => t.status === "done").length
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length
  const colColor = COLUMN_COLORS[column.name] || "#6366f1"

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-gray-900 rounded-xl border border-gray-800">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colColor }} />
            <h3 className="text-white text-sm font-bold">{column.name}</h3>
            <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{tasks.length}</span>
          </div>
          <div className="flex items-center gap-1">
            {overdueTasks > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400 bg-red-950 px-2 py-0.5 rounded-full">
                <AlertTriangle size={9} />{overdueTasks}
              </span>
            )}
            {column.name === "Done" && doneTasks > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle size={10} />{doneTasks}
              </span>
            )}
          </div>
        </div>
        {tasks.length > 0 && (
          <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(doneTasks / tasks.length) * 100}%`, backgroundColor: colColor }} />
          </div>
        )}
      </div>

      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-3 space-y-2 overflow-y-auto min-h-16">
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-gray-700 border-2 border-dashed border-gray-800 rounded-lg">
              <Circle size={20} className="mb-1" />
              <p className="text-xs">Drop tasks here</p>
            </div>
          )}
          {tasks.map(task => (
            <TaskCard key={task.id} task={task}
              onUpdate={onUpdateTask} onDelete={onDeleteTask} onEdit={onEditTask} />
          ))}
        </div>
      </SortableContext>

      <div className="p-3 border-t border-gray-800">
        <button onClick={() => onAddTask(column.name)}
          className="w-full flex items-center gap-2 text-gray-500 hover:text-white text-xs py-2 px-3 rounded-lg hover:bg-gray-800 transition-all group">
          <Plus size={14} className="group-hover:text-indigo-400" />Add task
        </button>
      </div>
    </div>
  )
}

// ─── Main TaskBoard ───────────────────────────────────────────────────────────
export default function TaskBoard() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterPriority, setFilterPriority] = useState("all")
  const [showStats, setShowStats] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showNewTask, setShowNewTask] = useState(false)
  const [showEditTask, setShowEditTask] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [newTaskColumn, setNewTaskColumn] = useState("")
  const [projectName, setProjectName] = useState("")
  const [projectColor, setProjectColor] = useState("#6366f1")
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium", due_date: "", labels: [] as string[], labelInput: "" })
  const [saving, setSaving] = useState(false)

  const selectProject = useCallback(async (project: Project) => {
    setSelectedProject(project)
    setTasks([])
    setColumns([])
    try {
      const [colData, taskData] = await Promise.all([getColumns(project.id), getTasks(project.id)])
      setColumns(colData.columns || [])
      setTasks(taskData.tasks || [])
    } catch { toast.error("Failed to load board") }
  }, [])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getProjects()
      setProjects(data.projects || [])
      if (data.projects?.length > 0) await selectProject(data.projects[0])
    } catch { toast.error("Failed to load projects") }
    finally { setLoading(false) }
  }, [selectProject])

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])
  useEffect(() => { loadProjects() }, [loadProjects]) // eslint-disable-line react-hooks/set-state-in-effect

  useKeyboard({
    "ctrl+k": () => document.getElementById("task-search")?.focus(),
    "escape": () => { setShowNewProject(false); setShowNewTask(false); setShowEditTask(false) },
  })

  useEffect(() => {
    if (tasks.length === 0) return
    const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done")
    if (overdue.length > 0) {
      toast(`⚠️ ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}!`, {
        duration: 5000,
        style: { background: "#450a0a", color: "#fca5a5", border: "1px solid #7f1d1d" }
      })
    }
  }, [tasks])

  const handleCreateProject = async () => {
    if (!projectName.trim()) { toast.error("Project name required"); return }
    setSaving(true)
    try {
      const data = await createProject({ name: projectName, color: projectColor })
      toast.success("Project created! 🎉")
      setShowNewProject(false)
      setProjectName("")
      await loadProjects()
      await selectProject(data.project)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail || "Failed to create project")
    } finally { setSaving(false) }
  }

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Delete "${project.name}" and all its tasks?`)) return
    try {
      await deleteProject(project.id)
      toast.success("Project deleted")
      setSelectedProject(null); setColumns([]); setTasks([])
      loadProjects()
    } catch { toast.error("Failed to delete") }
  }

  const handleAddTask = (columnName: string) => {
    setNewTaskColumn(columnName)
    setTaskForm({ title: "", description: "", priority: "medium", due_date: "", labels: [], labelInput: "" })
    setShowNewTask(true)
  }

  const handleCreateTask = async () => {
    if (!taskForm.title.trim() || !selectedProject) return
    setSaving(true)
    const status = STATUS_MAP[newTaskColumn] || newTaskColumn.toLowerCase().replace(/\s+/g, "_")
    try {
      const data = await createTask(selectedProject.id, {
        title: taskForm.title, description: taskForm.description,
        status, priority: taskForm.priority,
        due_date: taskForm.due_date || null, labels: taskForm.labels,
      })
      setTasks(prev => [...prev, data.task])
      toast.success("Task added! ✅")
      setShowNewTask(false)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail || "Failed to create task")
    } finally { setSaving(false) }
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskForm({ title: task.title, description: task.description || "", priority: task.priority, due_date: task.due_date || "", labels: task.labels || [], labelInput: "" })
    setShowEditTask(true)
  }

  const handleUpdateTaskForm = async () => {
    if (!editingTask) return
    setSaving(true)
    try {
      const data = await updateTask(editingTask.id, { title: taskForm.title, description: taskForm.description, priority: taskForm.priority, due_date: taskForm.due_date || null, labels: taskForm.labels })
      setTasks(prev => prev.map(t => t.id === editingTask.id ? data.task : t))
      toast.success("Task updated! ✅")
      setShowEditTask(false)
    } catch { toast.error("Failed to update task") }
    finally { setSaving(false) }
  }

  const handleUpdateTask = async (taskId: string, updates: Record<string, unknown>) => {
    try {
      const data = await updateTask(taskId, updates)
      setTasks(prev => prev.map(t => t.id === taskId ? data.task : t))
      if (updates.status === "done") toast.success("Task completed! 🎉")
    } catch { toast.error("Failed to update task") }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
      toast.success("Task deleted")
    } catch { toast.error("Failed to delete task") }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeTask = tasks.find(t => t.id === active.id)
    const overTask = tasks.find(t => t.id === over.id)
    if (!activeTask || !overTask || activeTask.status === overTask.status) return
    setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: overTask.status } : t))
    await handleUpdateTask(activeTask.id, { status: overTask.status, position: overTask.position })
    toast.success(`Moved to ${overTask.status.replace("_", " ")}`)
  }

  const getTasksForColumn = (column: Column) => {
    const status = STATUS_MAP[column.name] || column.name.toLowerCase().replace(/\s+/g, "_")
    return tasks.filter(t =>
      t.status === status &&
      (!search || t.title.toLowerCase().includes(search.toLowerCase())) &&
      (filterPriority === "all" || t.priority === filterPriority)
    ).sort((a, b) => a.position - b.position)
  }

  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === "done").length
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const criticalTasks = tasks.filter(t => t.priority === "critical" && t.status !== "done").length

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <Kanban className="text-indigo-500" size={22} />
            <h1 className="text-xl font-bold text-white">Tasks</h1>
            {selectedProject && (
              <>
                <span className="text-gray-600">|</span>
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedProject.color }} />
                <span className="text-white font-medium text-sm">{selectedProject.name}</span>
                {totalTasks > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{progress}%</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {criticalTasks > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950 px-3 py-1.5 rounded-lg border border-red-800 animate-pulse">
              <Bell size={12} />{criticalTasks} critical
            </span>
          )}
          {overdueTasks > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-950 px-3 py-1.5 rounded-lg border border-orange-800">
              <AlertTriangle size={12} />{overdueTasks} overdue
            </span>
          )}
          <button onClick={() => setShowStats(!showStats)}
            className={`p-2 rounded-lg transition-colors ${showStats ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}>
            <BarChart2 size={16} />
          </button>
          <button onClick={() => setShowNewProject(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} />New Project
          </button>
        </div>
      </div>

      {/* Stats */}
      {showStats && selectedProject && (
        <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 grid grid-cols-5 gap-4">
          {[
            { label: "Total", value: totalTasks, color: "text-indigo-400", bg: "bg-indigo-950" },
            { label: "Done", value: doneTasks, color: "text-green-400", bg: "bg-green-950" },
            { label: "In Progress", value: tasks.filter(t => t.status === "in_progress").length, color: "text-yellow-400", bg: "bg-yellow-950" },
            { label: "Overdue", value: overdueTasks, color: "text-red-400", bg: "bg-red-950" },
            { label: "Critical", value: criticalTasks, color: "text-orange-400", bg: "bg-orange-950" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-lg p-3 border border-gray-800`}>
              <p className="text-gray-500 text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filter */}
      {selectedProject && (
        <div className="border-b border-gray-800 bg-gray-900 px-6 py-2 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input id="task-search" type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks... (Ctrl+K)"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-8 pr-4 py-1.5 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-gray-500" />
            {["all", "critical", "high", "medium", "low"].map(p => (
              <button key={p} onClick={() => setFilterPriority(p)}
                className={`text-xs px-3 py-1 rounded-full transition-colors capitalize ${filterPriority === p ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r border-gray-800 bg-gray-900 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-gray-800">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Projects</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-500" size={20} /></div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8">
                <Kanban className="text-gray-700 mx-auto mb-3" size={32} />
                <p className="text-gray-600 text-xs mb-3">No projects yet</p>
                <button onClick={() => setShowNewProject(true)} className="text-indigo-400 hover:text-indigo-300 text-xs">+ Create one</button>
              </div>
            ) : (
              projects.map(project => (
                <div key={project.id} onClick={() => selectProject(project)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all group mb-1 ${
                    selectedProject?.id === project.id ? "bg-gray-800 border border-gray-700" : "hover:bg-gray-800 border border-transparent"
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                  <span className="text-white text-sm flex-1 truncate font-medium">{project.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteProject(project) }}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 p-0.5 rounded transition-all">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="p-3 border-t border-gray-800">
            <button onClick={() => setShowNewProject(true)}
              className="w-full flex items-center gap-2 text-gray-500 hover:text-white text-xs py-2 px-3 rounded-lg hover:bg-gray-800 transition-colors">
              <Plus size={12} />New Project
            </button>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-auto p-6">
          {!selectedProject ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Kanban className="text-gray-800 mx-auto mb-4" size={80} />
                <h3 className="text-gray-400 text-xl font-semibold mb-2">Your Task Manager</h3>
                <p className="text-gray-600 text-sm mb-6">Organize your work with beautiful Kanban boards</p>
                <div className="flex items-center justify-center gap-3 text-xs text-gray-600 mb-6">
                  <span className="bg-gray-800 px-3 py-1.5 rounded-lg">Ctrl+K to search</span>
                  <span className="bg-gray-800 px-3 py-1.5 rounded-lg">Drag to move tasks</span>
                </div>
                <button onClick={() => setShowNewProject(true)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl mx-auto font-medium">
                  <Plus size={18} />Create Your First Project
                </button>
              </div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="flex gap-5 items-start">
                {columns.map(column => (
                  <KanbanColumn key={column.id} column={column}
                    tasks={getTasksForColumn(column)}
                    onAddTask={handleAddTask}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onEditTask={handleEditTask}
                  />
                ))}
                <button
                  onClick={async () => {
                    if (!selectedProject) return
                    const name = prompt("Column name:")
                    if (!name?.trim()) return
                    try {
                      const data = await createColumn(selectedProject.id, name.trim())
                      setColumns(prev => [...prev, data.column])
                      toast.success("Column added!")
                    } catch { toast.error("Failed to add column") }
                  }}
                  className="flex-shrink-0 w-72 h-14 flex items-center justify-center gap-2 border-2 border-dashed border-gray-800 rounded-xl text-gray-600 hover:text-indigo-400 hover:border-indigo-800 transition-all text-sm group"
                >
                  <Plus size={16} className="group-hover:scale-110 transition-transform" />Add Column
                </button>
              </div>
            </DndContext>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">🚀 New Project</h2>
              <button onClick={() => setShowNewProject(false)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Project Name</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="My awesome project" autoFocus />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-2 font-medium">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#14b8a6","#f97316","#06b6d4"].map(color => (
                    <button key={color} onClick={() => setProjectColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${projectColor === color ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-gray-900" : "hover:scale-110"}`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-800">
              <button onClick={() => setShowNewProject(false)} className="flex-1 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreateProject} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? <><Loader2 size={14} className="animate-spin" />Creating...</> : "🚀 Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Modals */}
      {showNewTask && (
        <TaskFormModal isEdit={false} taskForm={taskForm} setTaskForm={setTaskForm}
          onSave={handleCreateTask} onClose={() => setShowNewTask(false)} saving={saving} />
      )}
      {showEditTask && (
        <TaskFormModal isEdit={true} taskForm={taskForm} setTaskForm={setTaskForm}
          onSave={handleUpdateTaskForm} onClose={() => setShowEditTask(false)} saving={saving} />
      )}
    </div>
  )
}