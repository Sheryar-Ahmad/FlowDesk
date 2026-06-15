

import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft, Play, Pause, RotateCcw, Settings,
  Coffee, Brain,
  SkipForward, Volume2, VolumeX, Timer,
  CheckCircle, BarChart2, Plus,
  Maximize2, Minimize2, Download,
  FileText, AlertTriangle,
  Calendar, Target, Zap,
  HelpCircle, List, Bell, Minimize
} from "lucide-react"
import { DeleteButton } from "../../components/DeleteButton"
import { useAuthStore } from "../../store/authStore"
import axios from "axios"
import toast from "react-hot-toast"


const api = axios.create({ baseURL: "http://localhost:8000/api/v1", timeout: 10000 })
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})


type TimerMode = "focus" | "short_break" | "long_break"
type Theme = "midnight" | "forest" | "sunset" | "ocean"
type AmbientSound =
  | "none"
  | "rain"
  | "forest"
  | "cafe"
  | "waves"
  | "fireplace"
  | "river"
  | "night"
  | "wind"
type FocusLabel = "Deep Work" | "Reading" | "Coding" | "Meetings" | "Writing" | "Learning" | "Other"

interface TimerSettings {
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  sessionsBeforeLongBreak: number
  soundEnabled: boolean
  autoStartBreaks: boolean
  autoStartFocus: boolean
  autoPauseOnHide: boolean
  notificationsEnabled: boolean
  dailyGoalMinutes: number
}

interface Task {
  id: string
  text: string
  label: FocusLabel
  completed: boolean
  sessionId?: string
  createdAt: string
}

interface SessionLog {
  id: string
  mode: TimerMode
  minutes: number
  completedAt: string
  rating?: number
  note?: string
  taskId?: string
  distractions: number
  label?: FocusLabel
}

interface DayStats {
  sessions: number
  focusMinutes: number
  streak: number
  distractions: number
  focusScore: number
  weeklyData: number[]
}

interface WeeklyHeatmapDay {
  date: string
  minutes: number
}


const DEFAULT_SETTINGS: TimerSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
  soundEnabled: true,
  autoStartBreaks: false,
  autoStartFocus: false,
  autoPauseOnHide: true,
  notificationsEnabled: false,
  dailyGoalMinutes: 120,
}

const THEMES: Record<Theme, {
  primary: string; secondary: string; accent: string; accentText: string;
  bg: string; surface: string; ring: string; label: string;
}> = {
  midnight: {
    primary: "#6366f1", secondary: "#818cf8", accent: "#4f46e5",
    accentText: "#a5b4fc", bg: "#030712", surface: "#0f172a",
    ring: "rgba(99,102,241,0.4)", label: "Midnight"
  },
  forest: {
    primary: "#10b981", secondary: "#34d399", accent: "#059669",
    accentText: "#6ee7b7", bg: "#022c22", surface: "#064e3b",
    ring: "rgba(16,185,129,0.4)", label: "Forest"
  },
  sunset: {
    primary: "#f59e0b", secondary: "#fbbf24", accent: "#d97706",
    accentText: "#fde68a", bg: "#1c0a00", surface: "#27180a",
    ring: "rgba(245,158,11,0.4)", label: "Sunset"
  },
  ocean: {
    primary: "#0ea5e9", secondary: "#38bdf8", accent: "#0284c7",
    accentText: "#7dd3fc", bg: "#0a1628", surface: "#0c1f3d",
    ring: "rgba(14,165,233,0.4)", label: "Ocean"
  },
}

const MODE_CONFIG = {
  focus: {
    label: "Focus Time", shortLabel: "Focus",
    icon: Brain,
    message: "Deep work in progress. Phone down, brain on.",
  },
  short_break: {
    label: "Short Break", shortLabel: "Break",
    icon: Coffee,
    message: "Breathe. Stretch. Look out a window.",
  },
  long_break: {
    label: "Long Break", shortLabel: "Long Break",
    icon: Coffee,
    message: "Outstanding session. You've earned this.",
  },
}

const FOCUS_LABELS: { value: FocusLabel; color: string }[] = [
  { value: "Deep Work", color: "#6366f1" },
  { value: "Coding", color: "#10b981" },
  { value: "Reading", color: "#f59e0b" },
  { value: "Writing", color: "#ec4899" },
  { value: "Meetings", color: "#ef4444" },
  { value: "Learning", color: "#0ea5e9" },
  { value: "Other", color: "#6b7280" },
]

const MOTIVATIONAL_QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "Energy, not time, is the fundamental currency of high performance.", author: "Jim Loehr" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Either you run the day, or the day runs you.", author: "Jim Rohn" },
]

const BREAK_SUGGESTIONS = [
  "Do 10 jumping jacks",
  "Make a cup of tea or water",
  "Step outside for fresh air",
  "Do a 5-minute neck stretch",
  "Write down 3 things going well",
  "Close your eyes and breathe deeply",
  "Walk around the room 3 times",
]

const AMBIENT_SOUNDS: Record<AmbientSound, { label: string; emoji: string }> = {
  none: { label: "Silent", emoji: "🔇" },
  rain: { label: "Rain", emoji: "🌧️" },
  forest: { label: "Forest", emoji: "🌲" },
  cafe: { label: "Café", emoji: "☕" },
  waves: { label: "Waves", emoji: "🌊" },
  fireplace: { label: "Fireplace", emoji: "🔥" },
  river: { label: "River", emoji: "🏞️" },
  night: { label: "Night Crickets", emoji: "🌙" },
  wind: { label: "Gentle Wind", emoji: "🍃" },
}



const AMBIENT_AUDIO: Record<Exclude<AmbientSound, "none">, { src: string; volume: number }> = {
  rain: { src: "/audio/rain.mp3", volume: 0.32 },
  forest: { src: "/audio/forest.mp3", volume: 0.4 },
  cafe: { src: "/audio/cafe.mp3", volume: 0.24 },
  waves: { src: "/audio/waves.mp3", volume: 0.38 },
  fireplace: { src: "/audio/fireplace.mp3", volume: 0.35 },
  river: { src: "/audio/river.mp3", volume: 0.32 },
  night: { src: "/audio/night.mp3", volume: 0.28 },
  wind: { src: "/audio/wind.mp3", volume: 0.3 },
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

function getWeeklyHeatmap(): WeeklyHeatmapDay[] {
  const days: WeeklyHeatmapDay[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `flowdesk_day_${d.toDateString()}`
    const saved = localStorage.getItem(key)
    days.push({
      date: d.toDateString(),
      minutes: saved ? parseInt(saved) || 0 : 0,
    })
  }
  return days
}

function exportSessionsCSV(sessions: SessionLog[]) {
  const headers = ["Date", "Mode", "Minutes", "Rating", "Distractions", "Label", "Note"]
  const rows = sessions.map(s => [
    s.completedAt,
    s.mode,
    s.minutes,
    s.rating ?? "",
    s.distractions,
    s.label ?? "",
    `"${(s.note ?? "").replace(/"/g, '""')}"`,
  ])
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `flowdesk_sessions_${new Date().toISOString().split("T")[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}


export default function FocusTimer() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()


  const [mode, setMode] = useState<TimerMode>("focus")
  const [isRunning, setIsRunning] = useState(false)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)


  const [activePanel, setActivePanel] = useState<
    "stats" | "tasks" | "log" | "heatmap" | "settings" | "shortcuts" | null
  >(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMini, setIsMini] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<Theme>("midnight")
  const [ambientSound, setAmbientSound] = useState<AmbientSound>("none")
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [pendingSession, setPendingSession] = useState<Partial<SessionLog> | null>(null)
  const [distractionCount, setDistractionCount] = useState(0)
  const [activeLabel, setActiveLabel] = useState<FocusLabel>("Deep Work")
  const [breakSuggestion] = useState(() =>
    BREAK_SUGGESTIONS[Math.floor(Math.random() * BREAK_SUGGESTIONS.length)]
  )


  const loadSettings = (): TimerSettings => {
    try {
      const s = localStorage.getItem("flowdesk_timer_settings_v2")
      return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS
    } catch { return DEFAULT_SETTINGS }
  }
  const [settings, setSettings] = useState<TimerSettings>(loadSettings)
  const [tempSettings, setTempSettings] = useState<TimerSettings>(loadSettings)


  const [timeLeft, setTimeLeft] = useState(() => loadSettings().focusDuration * 60)


  const loadDayStats = (): DayStats => {
    try {
      const saved = localStorage.getItem("flowdesk_timer_stats_v2")
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.date === new Date().toDateString()) return parsed.stats
      }
    } catch {
      return { sessions: 0, focusMinutes: 0, streak: 0, distractions: 0, focusScore: 0, weeklyData: [] }
    }
    return { sessions: 0, focusMinutes: 0, streak: 0, distractions: 0, focusScore: 0, weeklyData: [] }
  }
  const [dayStats, setDayStats] = useState<DayStats>(loadDayStats)


  const loadTasks = (): Task[] => {
    try { return JSON.parse(localStorage.getItem("flowdesk_tasks") || "[]") } catch { return [] }
  }
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  const [newTaskText, setNewTaskText] = useState("")
  const [newTaskLabel, setNewTaskLabel] = useState<FocusLabel>("Deep Work")


  const loadSessionLog = (): SessionLog[] => {
    try { return JSON.parse(localStorage.getItem("flowdesk_session_log") || "[]") } catch { return [] }
  }
  const [sessionLog, setSessionLog] = useState<SessionLog[]>(loadSessionLog)


  const intervalRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null)

  const theme = THEMES[currentTheme]
  const flowLevel = Math.min(5, Math.floor(sessionsCompleted / 2))


  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])


  useEffect(() => {
    document.title = isRunning
      ? `${formatTime(timeLeft)} · ${MODE_CONFIG[mode].shortLabel} — FlowDesk`
      : "FlowDesk Focus"
    return () => { document.title = "FlowDesk" }
  }, [timeLeft, isRunning, mode])


  useEffect(() => {
    if (!settings.autoPauseOnHide) return
    const handler = () => {
      if (document.hidden && isRunning) setIsRunning(false)
    }
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }, [isRunning, settings.autoPauseOnHide])



  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioRef.current) audioRef.current = new AudioContext()
    return audioRef.current
  }, [])

  const stopAmbientSound = useCallback(() => {
    const audio = ambientAudioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
    ambientAudioRef.current = null
  }, [])

  const startAmbientSound = useCallback(async (type: AmbientSound) => {
    stopAmbientSound()
    if (type === "none") return

    const config = AMBIENT_AUDIO[type]
    const audio = new Audio(config.src)
    audio.loop = true
    audio.preload = "auto"
    audio.volume = config.volume
    ambientAudioRef.current = audio

    try {
      await audio.play()
    } catch (error) {
      if (ambientAudioRef.current === audio) {
        stopAmbientSound()
        setAmbientSound("none")
        toast.error("This browser could not play the selected ambience.")
      }
      console.error("Ambient recording error", error)
    }
  }, [stopAmbientSound])

  const handleAmbientChange = (type: AmbientSound) => {
    setAmbientSound(type)
    if (type === "none" || !settings.soundEnabled) {
      stopAmbientSound()
      return
    }
    void startAmbientSound(type)
  }

  useEffect(() => {
    return stopAmbientSound
  }, [stopAmbientSound])

  const playSound = useCallback((type: "start" | "complete" | "break" | "tick") => {
    if (!settings.soundEnabled) return
    try {
      const ctx = getAudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t = ctx.currentTime

      if (type === "complete") {
        const freqs = [523, 659, 784, 1047]
        freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * 0.12))
        gain.gain.setValueAtTime(0.25, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
        osc.start(t); osc.stop(t + 0.6)
      } else if (type === "break") {
        osc.frequency.setValueAtTime(440, t)
        osc.frequency.setValueAtTime(330, t + 0.15)
        gain.gain.setValueAtTime(0.2, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        osc.start(t); osc.stop(t + 0.35)
      } else if (type === "tick") {
        osc.frequency.setValueAtTime(880, t)
        gain.gain.setValueAtTime(0.05, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
        osc.start(t); osc.stop(t + 0.05)
      } else {
        osc.frequency.setValueAtTime(660, t)
        gain.gain.setValueAtTime(0.12, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
        osc.start(t); osc.stop(t + 0.15)
      }
    } catch (err) {
      console.error("Audio error", err)
    }
  }, [settings.soundEnabled, getAudioCtx])


  const sendNotification = useCallback((title: string, body: string) => {
    if (!settings.notificationsEnabled) return
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" })
    }
  }, [settings.notificationsEnabled])


  useEffect(() => {
    localStorage.setItem("flowdesk_tasks", JSON.stringify(tasks))
  }, [tasks])


  useEffect(() => {
    localStorage.setItem("flowdesk_session_log", JSON.stringify(sessionLog.slice(-200)))
  }, [sessionLog])



  const saveSession = useCallback(async (minutes: number) => {
    try {
      await api.post("/timer/sessions", {
        duration_minutes: minutes,
        completed: true,
        session_date: new Date().toISOString().split("T")[0],
        label: activeLabel,
      })
    } catch (err) {
      console.error("Failed to save session to server", err)
    }

    const today = new Date().toDateString()
    const newStats: DayStats = {
      sessions: dayStats.sessions + 1,
      focusMinutes: dayStats.focusMinutes + minutes,
      streak: dayStats.streak,
      distractions: dayStats.distractions + distractionCount,
      focusScore: Math.min(100, Math.round(
        ((dayStats.focusMinutes + minutes) /
          Math.max(1, dayStats.focusMinutes + minutes + (dayStats.distractions + distractionCount) * 5)) * 100
      )),
      weeklyData: dayStats.weeklyData,
    }
    setDayStats(newStats)
    localStorage.setItem("flowdesk_timer_stats_v2", JSON.stringify({ date: today, stats: newStats }))

    const prev = parseInt(localStorage.getItem(`flowdesk_day_${today}`) || "0")
    localStorage.setItem(`flowdesk_day_${today}`, String(prev + minutes))

    const session: Partial<SessionLog> = {
      id: generateId(),
      mode: "focus",
      minutes,
      completedAt: new Date().toLocaleString(),
      distractions: distractionCount,
      label: activeLabel,
    }
    setPendingSession(session)
    setDistractionCount(0)
    setShowRatingModal(true)
    setQuoteIndex(i => (i + 1) % MOTIVATIONAL_QUOTES.length)
  }, [dayStats, distractionCount, activeLabel])


  const finalizeSession = useCallback((rating?: number, note?: string) => {
    if (!pendingSession) return
    const full: SessionLog = {
      id: pendingSession.id!,
      mode: pendingSession.mode!,
      minutes: pendingSession.minutes!,
      completedAt: pendingSession.completedAt!,
      distractions: pendingSession.distractions!,
      label: pendingSession.label,
      rating,
      note,
    }
    setSessionLog(prev => [full, ...prev])
    setPendingSession(null)
    setShowRatingModal(false)
    setShowNoteModal(false)
  }, [pendingSession])


  const handleTimerComplete = useCallback(async () => {
    setIsRunning(false)
    playSound("complete")

    if (mode === "focus") {
      const minutes = settings.focusDuration
      const newSessions = sessionsCompleted + 1
      setSessionsCompleted(newSessions)
      await saveSession(minutes)
      sendNotification("Focus session complete! 🎉", `You focused for ${minutes} minutes.`)
      toast.success(`🎉 Focus session complete! +${minutes} min`, { duration: 4000 })

      if (newSessions % settings.sessionsBeforeLongBreak === 0) {
        setMode("long_break")
        setTimeLeft(settings.longBreakDuration * 60)
        if (settings.autoStartBreaks) setIsRunning(true)
      } else {
        setMode("short_break")
        setTimeLeft(settings.shortBreakDuration * 60)
        if (settings.autoStartBreaks) setIsRunning(true)
      }
    } else {
      playSound("break")
      setMode("focus")
      setTimeLeft(settings.focusDuration * 60)
      sendNotification("Break over!", "Time to focus again. You got this.")
      toast("🧠 Back to focus!", { duration: 3000 })
      if (settings.autoStartFocus) setIsRunning(true)
    }
  }, [mode, settings, sessionsCompleted, playSound, saveSession, sendNotification])


  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            handleTimerComplete()
            return 0
          }

          if (prev <= 11 && settings.soundEnabled) playSound("tick")
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning, handleTimerComplete, playSound, settings.soundEnabled])


  const handleStart = () => {
    if (!isRunning) playSound("start")
    setIsRunning(r => !r)
  }

  const handleReset = () => {
    setIsRunning(false)
    const durations = {
      focus: settings.focusDuration,
      short_break: settings.shortBreakDuration,
      long_break: settings.longBreakDuration,
    }
    setTimeLeft(durations[mode] * 60)
    setDistractionCount(0)
  }

  const handleSkip = () => {
    setIsRunning(false)
    if (mode === "focus") {
      const newSessions = sessionsCompleted + 1
      setSessionsCompleted(newSessions)
      if (newSessions % settings.sessionsBeforeLongBreak === 0) {
        setMode("long_break"); setTimeLeft(settings.longBreakDuration * 60)
      } else {
        setMode("short_break"); setTimeLeft(settings.shortBreakDuration * 60)
      }
    } else {
      setMode("focus"); setTimeLeft(settings.focusDuration * 60)
    }
  }

  const handleModeChange = (newMode: TimerMode) => {
    setIsRunning(false)
    setMode(newMode)
    const durations = {
      focus: settings.focusDuration,
      short_break: settings.shortBreakDuration,
      long_break: settings.longBreakDuration,
    }
    setTimeLeft(durations[newMode] * 60)
    setDistractionCount(0)
  }

  const handleDistraction = () => {
    setDistractionCount(c => c + 1)
    toast("📝 Distraction logged — back to it!", { duration: 2000 })
  }


  const toggleSoundEnabled = () => {
    const enabled = !settings.soundEnabled
    const updated = { ...settings, soundEnabled: enabled }
    setSettings(updated)
    setTempSettings(current => ({ ...current, soundEnabled: enabled }))
    localStorage.setItem("flowdesk_timer_settings_v2", JSON.stringify(updated))

    if (enabled && ambientSound !== "none") {
      void startAmbientSound(ambientSound)
    } else {
      stopAmbientSound()
    }
  }

  const saveSettings = () => {
    if (tempSettings.soundEnabled !== settings.soundEnabled) {
      if (tempSettings.soundEnabled && ambientSound !== "none") {
        void startAmbientSound(ambientSound)
      } else {
        stopAmbientSound()
      }
    }
    setSettings(tempSettings)
    localStorage.setItem("flowdesk_timer_settings_v2", JSON.stringify(tempSettings))
    setTimeLeft(tempSettings.focusDuration * 60)
    setMode("focus")
    setIsRunning(false)
    setActivePanel(null)
    toast.success("Settings saved!")
  }


  const requestNotifications = async () => {
    const perm = await Notification.requestPermission()
    if (perm === "granted") {
      setSettings(s => ({ ...s, notificationsEnabled: true }))
      toast.success("Notifications enabled!")
    } else {
      toast.error("Notification permission denied")
    }
  }


  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => { })
    } else {
      document.exitFullscreen?.().catch(() => { })
    }
    setIsFullscreen(f => !f)
  }


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      switch (e.key.toLowerCase()) {
        case " ": e.preventDefault(); handleStart(); break
        case "r": handleReset(); break
        case "s": handleSkip(); break
        case "m": toggleSoundEnabled(); break
        case "f": toggleFullscreen(); break
        case "t": setActivePanel(p => p === "tasks" ? null : "tasks"); break
        case "?": setActivePanel(p => p === "shortcuts" ? null : "shortcuts"); break
        case "1": handleModeChange("focus"); break
        case "2": handleModeChange("short_break"); break
        case "3": handleModeChange("long_break"); break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  })

  const addTask = () => {
    if (!newTaskText.trim()) return
    const task: Task = {
      id: generateId(),
      text: newTaskText.trim(),
      label: newTaskLabel,
      completed: false,
      createdAt: new Date().toISOString(),
    }
    setTasks(t => [task, ...t])
    setNewTaskText("")
  }

  const toggleTask = (id: string) => {
    setTasks(t => t.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ))
  }

  const deleteTask = (id: string) => {
    setTasks(t => t.filter(task => task.id !== id))
  }


  const totalSeconds = mode === "focus"
    ? settings.focusDuration * 60
    : mode === "short_break"
    ? settings.shortBreakDuration * 60
    : settings.longBreakDuration * 60

  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100
  const radius = 130
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference
  const ModeIcon = MODE_CONFIG[mode].icon
  const heatmap = getWeeklyHeatmap()
  const goalProgress = Math.min(100, (dayStats.focusMinutes / settings.dailyGoalMinutes) * 100)
  const activeTasks = tasks.filter(t => !t.completed)
  const quote = MOTIVATIONAL_QUOTES[quoteIndex]


  const isUrgent = timeLeft <= 300 && mode === "focus" && isRunning


  if (isMini) {
    return (
      <div
        className="focus-mini"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: theme.surface, border: `1px solid ${theme.primary}`,
          borderRadius: 16, padding: "12px 18px", cursor: "pointer",
          boxShadow: `0 0 20px ${theme.ring}`,
          display: "flex", alignItems: "center", gap: 12,
        }}
        onClick={() => setIsMini(false)}
      >
        <span style={{ color: theme.primary, fontFamily: "monospace", fontSize: 22, fontWeight: 700 }}>
          {formatTime(timeLeft)}
        </span>
        <button
          onClick={e => { e.stopPropagation(); handleStart() }}
          style={{
            background: theme.primary, border: "none", borderRadius: 8,
            padding: "4px 10px", color: "#fff", cursor: "pointer",
          }}
        >
          {isRunning ? "⏸" : "▶"}
        </button>
        <button
          onClick={e => { e.stopPropagation(); setIsMini(false) }}
          style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16 }}
        >
          ✕
        </button>
      </div>
    )
  }


  const togglePanel = (p: typeof activePanel) =>
    setActivePanel(prev => (prev === p ? null : p))


  return (
    <div
      className="focus-timer-page"
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: "#e5e7eb",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >

      {!isFullscreen && (
        <header className="focus-header" style={{
          borderBottom: `1px solid rgba(255,255,255,0.07)`,
          background: theme.surface,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <div className="focus-header-brand" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                background: "none", border: "none", color: "#6b7280",
                cursor: "pointer", padding: 6, borderRadius: 8,
                display: "flex", alignItems: "center",
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Timer size={20} style={{ color: theme.primary }} />
              <span style={{ fontWeight: 600, fontSize: 16, color: "#f9fafb" }}>Focus Timer</span>

              {flowLevel > 0 && (
                <span style={{
                  background: theme.primary, color: "#fff",
                  fontSize: 11, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 99, display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Zap size={10} /> Flow {flowLevel}/5
                </span>
              )}
            </div>
          </div>


          <div className="focus-header-controls scrollbar-hide" style={{ display: "flex", alignItems: "center", gap: 4 }}>

            <div style={{ position: "relative" }}>
              <select
                className="focus-ambient"
                value={ambientSound}
                onChange={e => handleAmbientChange(e.target.value as AmbientSound)}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#9ca3af", borderRadius: 8, padding: "4px 8px",
                  fontSize: 12, cursor: "pointer",
                }}
              >
                {Object.entries(AMBIENT_SOUNDS).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
            </div>


            <div className="focus-themes" style={{ display: "flex", gap: 4, marginLeft: 4 }}>
              {(Object.keys(THEMES) as Theme[]).map(t => (
                <button
                  key={t}
                  title={THEMES[t].label}
                  onClick={() => setCurrentTheme(t)}
                  style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: THEMES[t].primary, border: "none", cursor: "pointer",
                    outline: currentTheme === t ? `2px solid #fff` : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>

            <div className="focus-header-divider" style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />

            {(
              [
                { id: "tasks", icon: <List size={15} />, label: "Tasks" },
                { id: "stats", icon: <BarChart2 size={15} />, label: "Stats" },
                { id: "log", icon: <FileText size={15} />, label: "Log" },
                { id: "heatmap", icon: <Calendar size={15} />, label: "Heatmap" },
                { id: "settings", icon: <Settings size={15} />, label: "Settings" },
                { id: "shortcuts", icon: <HelpCircle size={15} />, label: "Shortcuts" },
              ] as const
            ).map(({ id, icon, label }) => (
              <button
                className="focus-panel-button"
                key={id}
                title={label}
                onClick={() => togglePanel(id as typeof activePanel)}
                style={{
                  background: activePanel === id ? theme.primary : "rgba(255,255,255,0.05)",
                  border: "none", borderRadius: 8, padding: 7,
                  color: activePanel === id ? "#fff" : "#6b7280",
                  cursor: "pointer", display: "flex",
                }}
              >
                {icon}
              </button>
            ))}

            <button
              className="focus-utility-button"
              title={settings.soundEnabled ? "Mute" : "Unmute"}
              onClick={toggleSoundEnabled}
              style={{
                background: "rgba(255,255,255,0.05)", border: "none",
                borderRadius: 8, padding: 7, color: "#6b7280", cursor: "pointer", display: "flex",
              }}
            >
              {settings.soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>

            <button
              className="focus-utility-button"
              title="Mini mode"
              onClick={() => setIsMini(true)}
              style={{
                background: "rgba(255,255,255,0.05)", border: "none",
                borderRadius: 8, padding: 7, color: "#6b7280", cursor: "pointer", display: "flex",
              }}
            >
              <Minimize size={15} />
            </button>

            <button
              className="focus-utility-button"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
              style={{
                background: "rgba(255,255,255,0.05)", border: "none",
                borderRadius: 8, padding: 7, color: "#6b7280", cursor: "pointer", display: "flex",
              }}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </header>
      )}


      {activePanel === "stats" && (
        <div className="focus-panel focus-stats-panel" style={{
          background: theme.surface, borderBottom: `1px solid rgba(255,255,255,0.07)`,
          padding: "16px 20px", display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12,
        }}>
          {[
            { label: "Sessions Today", value: dayStats.sessions, color: "#10b981" },
            { label: "Minutes Focused", value: `${dayStats.focusMinutes}m`, color: theme.primary },
            { label: "Focus Score", value: `${dayStats.focusScore}%`, color: "#f59e0b" },
            { label: "Distractions", value: dayStats.distractions, color: "#ef4444" },
            { label: "Daily Goal", value: `${Math.round(goalProgress)}%`, color: "#0ea5e9" },
            { label: "Current Streak", value: sessionsCompleted, color: "#f97316" },
          ].map(stat => (
            <div key={stat.label} style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 10,
              padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}


      {activePanel === "tasks" && (
        <div className="focus-panel" style={{
          background: theme.surface, borderBottom: `1px solid rgba(255,255,255,0.07)`,
          padding: "16px 20px", maxHeight: 320, overflowY: "auto",
        }}>
          <div className="focus-task-form" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={newTaskText}
              onChange={e => setNewTaskText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()}
              placeholder="Add a task for this session…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "8px 12px", color: "#f9fafb", fontSize: 14, outline: "none",
              }}
            />
            <select
              value={newTaskLabel}
              onChange={e => setNewTaskLabel(e.target.value as FocusLabel)}
              style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#9ca3af", borderRadius: 8, padding: "4px 8px", fontSize: 12,
              }}
            >
              {FOCUS_LABELS.map(l => <option key={l.value} value={l.value}>{l.value}</option>)}
            </select>
            <button
              onClick={addTask}
              style={{
                background: theme.primary, border: "none", borderRadius: 8,
                padding: "8px 14px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center",
              }}
            >
              <Plus size={16} />
            </button>
          </div>

          {tasks.length === 0 && (
            <p style={{ color: "#4b5563", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
              No tasks yet — add one above
            </p>
          )}

          {tasks.map(task => {
            const labelMeta = FOCUS_LABELS.find(l => l.value === task.label)
            return (
              <div key={task.id} style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
                background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 12px",
                border: "1px solid rgba(255,255,255,0.05)",
                opacity: task.completed ? 0.5 : 1,
              }}>
                <button
                  onClick={() => toggleTask(task.id)}
                  style={{
                    background: task.completed ? "#10b981" : "transparent",
                    border: `1px solid ${task.completed ? "#10b981" : "rgba(255,255,255,0.2)"}`,
                    borderRadius: "50%", width: 20, height: 20,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {task.completed && <CheckCircle size={12} color="#fff" />}
                </button>
                <span style={{
                  flex: 1, fontSize: 14,
                  textDecoration: task.completed ? "line-through" : "none",
                  color: task.completed ? "#6b7280" : "#e5e7eb",
                }}>{task.text}</span>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 99,
                  background: `${labelMeta?.color}22`, color: labelMeta?.color,
                }}>{task.label}</span>
                <DeleteButton
                  onClick={() => deleteTask(task.id)}
                  title={`Delete ${task.text}`}
                  aria-label={`Delete focus task ${task.text}`}
                  iconSize={14}
                />
              </div>
            )
          })}
        </div>
      )}


      {activePanel === "log" && (
        <div className="focus-panel" style={{
          background: theme.surface, borderBottom: `1px solid rgba(255,255,255,0.07)`,
          padding: "16px 20px", maxHeight: 300, overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>{sessionLog.length} sessions logged</span>
            <button
              onClick={() => exportSessionsCSV(sessionLog)}
              style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "4px 12px", color: "#9ca3af",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12,
              }}
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
          {sessionLog.length === 0 && (
            <p style={{ color: "#4b5563", textAlign: "center", padding: "16px 0", fontSize: 14 }}>
              No sessions yet — complete your first one!
            </p>
          )}
          {sessionLog.slice(0, 20).map(s => (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
              background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 12px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}>
              <span style={{ fontSize: 11, color: "#4b5563", minWidth: 130 }}>{s.completedAt}</span>
              <span style={{ fontSize: 12, color: theme.primary, fontWeight: 600 }}>{s.minutes}m</span>
              {s.label && (
                <span style={{
                  fontSize: 11, padding: "2px 6px", borderRadius: 99,
                  background: `${FOCUS_LABELS.find(l => l.value === s.label)?.color}22`,
                  color: FOCUS_LABELS.find(l => l.value === s.label)?.color,
                }}>{s.label}</span>
              )}
              {s.rating && (
                <span style={{ fontSize: 11, color: "#f59e0b" }}>{"★".repeat(s.rating)}</span>
              )}
              {s.distractions > 0 && (
                <span style={{ fontSize: 11, color: "#ef4444" }}>⚡ {s.distractions}</span>
              )}
              {s.note && (
                <span style={{ fontSize: 11, color: "#6b7280", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  "{s.note}"
                </span>
              )}
            </div>
          ))}
        </div>
      )}


      {activePanel === "heatmap" && (
        <div className="focus-panel" style={{
          background: theme.surface, borderBottom: `1px solid rgba(255,255,255,0.07)`,
          padding: "16px 20px",
        }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: "#6b7280" }}>Last 7 days</div>
          <div style={{ display: "flex", gap: 8 }}>
            {heatmap.map(day => {
              const intensity = Math.min(1, day.minutes / 120)
              const bg = intensity > 0
                ? `rgba(${theme.primary.slice(1).match(/.{2}/g)!.map(h => parseInt(h, 16)).join(",")},${0.15 + intensity * 0.85})`
                : "rgba(255,255,255,0.05)"
              return (
                <div key={day.date} style={{ textAlign: "center" }}>
                  <div title={`${day.minutes}m`} style={{
                    width: 52, height: 52, borderRadius: 10,
                    background: bg, border: "1px solid rgba(255,255,255,0.07)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", cursor: "default",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: intensity > 0.5 ? "#fff" : theme.primary }}>
                      {day.minutes > 0 ? `${day.minutes}m` : "—"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4 }}>
                    {new Date(day.date).toLocaleDateString("en", { weekday: "short" })}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#6b7280" }}>
              <span><Target size={12} style={{ display: "inline", marginRight: 4 }} />Daily goal</span>
              <span style={{ color: "#f9fafb" }}>{dayStats.focusMinutes} / {settings.dailyGoalMinutes} min</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${goalProgress}%`,
                background: goalProgress >= 100 ? "#10b981" : theme.primary,
                borderRadius: 99, transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        </div>
      )}


      {activePanel === "shortcuts" && (
        <div className="focus-panel" style={{
          background: theme.surface, borderBottom: `1px solid rgba(255,255,255,0.07)`,
          padding: "16px 20px", display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8,
        }}>
          {[
            ["Space", "Play / Pause"],
            ["R", "Reset timer"],
            ["S", "Skip session"],
            ["M", "Toggle sound"],
            ["F", "Fullscreen"],
            ["T", "Toggle task panel"],
            ["1", "Focus mode"],
            ["2", "Short break"],
            ["3", "Long break"],
            ["?", "Toggle shortcuts"],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <kbd style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6, padding: "2px 8px", fontSize: 12, fontFamily: "monospace",
                color: theme.accentText, minWidth: 28, textAlign: "center",
              }}>{key}</kbd>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{desc}</span>
            </div>
          ))}
        </div>
      )}


      {activePanel === "settings" && (
        <div className="focus-panel focus-settings-panel" style={{
          background: theme.surface, borderBottom: `1px solid rgba(255,255,255,0.07)`,
          padding: "20px", maxHeight: 400, overflowY: "auto",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                Durations
              </div>
              {[
                { label: "Focus (min)", key: "focusDuration", min: 1, max: 90 },
                { label: "Short break (min)", key: "shortBreakDuration", min: 1, max: 30 },
                { label: "Long break (min)", key: "longBreakDuration", min: 5, max: 60 },
                { label: "Sessions before long break", key: "sessionsBeforeLongBreak", min: 1, max: 10 },
                { label: "Daily goal (min)", key: "dailyGoalMinutes", min: 15, max: 480 },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, color: "#9ca3af" }}>
                    <span>{f.label}</span>
                    <span style={{ color: "#f9fafb", fontWeight: 600 }}>
                      {tempSettings[f.key as keyof TimerSettings] as number}
                    </span>
                  </div>
                  <input type="range" min={f.min} max={f.max}
                    value={tempSettings[f.key as keyof TimerSettings] as number}
                    onChange={e => setTempSettings(s => ({ ...s, [f.key]: parseInt(e.target.value) }))}
                    style={{ width: "100%", accentColor: theme.primary }}
                  />
                </div>
              ))}
            </div>


            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                Behaviour
              </div>
              {[
                { label: "Sound notifications", key: "soundEnabled" },
                { label: "Auto-start breaks", key: "autoStartBreaks" },
                { label: "Auto-start focus sessions", key: "autoStartFocus" },
                { label: "Pause when tab hidden", key: "autoPauseOnHide" },
              ].map(toggle => (
                <div key={toggle.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: "#d1d5db" }}>{toggle.label}</span>
                  <button
                    onClick={() => setTempSettings(s => ({ ...s, [toggle.key]: !s[toggle.key as keyof TimerSettings] }))}
                    style={{
                      position: "relative", width: 40, height: 22, borderRadius: 99, border: "none",
                      background: tempSettings[toggle.key as keyof TimerSettings] ? theme.primary : "rgba(255,255,255,0.1)",
                      cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3,
                      left: tempSettings[toggle.key as keyof TimerSettings] ? 20 : 3,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.15s",
                    }} />
                  </button>
                </div>
              ))}


              <button
                onClick={requestNotifications}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                  padding: "8px 14px", color: "#9ca3af", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12,
                }}
              >
                <Bell size={14} /> Request browser notifications
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              onClick={() => setActivePanel(null)}
              style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "8px", color: "#6b7280", cursor: "pointer", fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveSettings}
              style={{
                flex: 2, background: theme.primary, border: "none",
                borderRadius: 8, padding: "8px", color: "#fff", cursor: "pointer",
                fontWeight: 600, fontSize: 13,
              }}
            >
              Save settings
            </button>
          </div>
        </div>
      )}


      <main className="focus-main" style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "32px 20px",
      }}>

        <div className="focus-modes" style={{ display: "flex", gap: 8, marginBottom: 36 }}>
          {(["focus", "short_break", "long_break"] as TimerMode[]).map(m => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              style={{
                padding: "8px 18px", borderRadius: 12, border: "none",
                background: mode === m ? theme.primary : "rgba(255,255,255,0.06)",
                color: mode === m ? "#fff" : "#6b7280",
                cursor: "pointer", fontWeight: mode === m ? 600 : 400,
                fontSize: 13, transition: "all 0.2s",
              }}
            >
              {m === "focus" ? "Focus" : m === "short_break" ? "Short break" : "Long break"}
            </button>
          ))}
        </div>


        {mode === "focus" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {FOCUS_LABELS.map(l => (
              <button
                key={l.value}
                onClick={() => setActiveLabel(l.value)}
                style={{
                  padding: "4px 12px", borderRadius: 99, border: "none",
                  background: activeLabel === l.value ? `${l.color}33` : "rgba(255,255,255,0.04)",
                  color: activeLabel === l.value ? l.color : "#4b5563",
                  cursor: "pointer", fontSize: 12,
                  outline: activeLabel === l.value ? `1px solid ${l.color}66` : "none",
                }}
              >
                {l.value}
              </button>
            ))}
          </div>
        )}


        <div style={{ position: "relative", marginBottom: 24 }}>
          <svg className="focus-ring" width="320" height="320" viewBox="0 0 320 320" style={{ transform: "rotate(-90deg)" }}>

            <circle cx="160" cy="160" r={radius} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth="10" />

            {isUrgent && (
              <circle cx="160" cy="160" r={radius} fill="none"
                stroke="#ef444422" strokeWidth="20" />
            )}

            <circle cx="160" cy="160" r={radius} fill="none"
              stroke={isUrgent ? "#ef4444" : theme.primary}
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
            />
          </svg>


          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <ModeIcon size={26} style={{ color: theme.primary, marginBottom: 10 }} />
            <span className="focus-time" style={{
              fontSize: 64, fontWeight: 700, fontFamily: "monospace",
              color: isUrgent ? "#ef4444" : "#f9fafb",
              letterSpacing: -2,
              textShadow: isUrgent ? `0 0 30px rgba(239,68,68,0.5)` : `0 0 30px ${theme.ring}`,
              animation: isRunning && timeLeft <= 10 ? "pulse 1s infinite" : "none",
            }}>
              {formatTime(timeLeft)}
            </span>
            <span style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>
              {MODE_CONFIG[mode].label}
            </span>


            {isRunning && (
              <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                {[0, 150, 300].map(d => (
                  <div key={d} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: theme.primary, opacity: 0.8,
                    animation: `bounce 1s ${d}ms infinite`,
                  }} />
                ))}
              </div>
            )}


            {distractionCount > 0 && (
              <div style={{
                marginTop: 8, fontSize: 11, color: "#ef4444",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <AlertTriangle size={10} /> {distractionCount} distraction{distractionCount > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>


        <p style={{
          fontSize: 13, color: "#4b5563", marginBottom: 28, textAlign: "center",
          maxWidth: 360, lineHeight: 1.5,
        }}>
          "{quote.text}"
          <span style={{ color: "#374151", display: "block", marginTop: 2, fontSize: 11 }}>
            — {quote.author}
          </span>
        </p>


        <div className="focus-controls" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={handleReset}
            title="Reset (R)"
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, padding: 13, color: "#6b7280", cursor: "pointer",
              display: "flex", transition: "all 0.15s",
            }}
          >
            <RotateCcw size={20} />
          </button>

          <button
            className="focus-start"
            onClick={handleStart}
            title="Play/Pause (Space)"
            style={{
              background: theme.primary, border: "none",
              borderRadius: 18, padding: "16px 44px",
              color: "#fff", fontWeight: 700, fontSize: 18,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
              boxShadow: `0 0 30px ${theme.ring}`,
              transition: "all 0.15s",
            }}
          >
            {isRunning ? <Pause size={24} /> : <Play size={24} />}
            {isRunning ? "Pause" : "Start"}
          </button>

          <button
            onClick={handleSkip}
            title="Skip (S)"
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, padding: 13, color: "#6b7280", cursor: "pointer",
              display: "flex", transition: "all 0.15s",
            }}
          >
            <SkipForward size={20} />
          </button>
        </div>


        {mode === "focus" && isRunning && (
          <button
            onClick={handleDistraction}
            style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "6px 16px", color: "#ef4444",
              cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6,
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={12} /> I got distracted
          </button>
        )}


        {mode === "long_break" && (
          <div style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "#9ca3af",
            marginBottom: 16, textAlign: "center",
          }}>
            💡 Suggestion: {breakSuggestion}
          </div>
        )}


        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#374151" }}>Session</span>
          <div style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: settings.sessionsBeforeLongBreak }).map((_, i) => (
              <div key={i} style={{
                width: 12, height: 12, borderRadius: "50%",
                background: i < (sessionsCompleted % settings.sessionsBeforeLongBreak)
                  ? theme.primary : "rgba(255,255,255,0.1)",
                transform: i < (sessionsCompleted % settings.sessionsBeforeLongBreak) ? "scale(1.2)" : "scale(1)",
                transition: "all 0.3s",
              }} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: "#374151" }}>Long break</span>
        </div>


        {activeTasks.length > 0 && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 6 }}>Active tasks</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {activeTasks.slice(0, 3).map(t => {
                const labelMeta = FOCUS_LABELS.find(l => l.value === t.label)
                return (
                  <span key={t.id} style={{
                    fontSize: 12, padding: "3px 10px", borderRadius: 99,
                    background: `${labelMeta?.color}18`, color: labelMeta?.color,
                    border: `1px solid ${labelMeta?.color}33`,
                  }}>{t.text}</span>
                )
              })}
              {activeTasks.length > 3 && (
                <span style={{ fontSize: 12, color: "#4b5563" }}>+{activeTasks.length - 3} more</span>
              )}
            </div>
          </div>
        )}


        {flowLevel > 0 && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 6 }}>
              <Zap size={10} style={{ display: "inline", marginRight: 4 }} />Flow state
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{
                  width: 20, height: 6, borderRadius: 99,
                  background: i <= flowLevel ? theme.primary : "rgba(255,255,255,0.08)",
                  transition: "background 0.4s",
                }} />
              ))}
            </div>
          </div>
        )}
      </main>


      {showRatingModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, padding: 20,
        }}>
          <div style={{
            background: theme.surface, borderRadius: 18,
            border: `1px solid rgba(255,255,255,0.1)`,
            padding: 28, width: "100%", maxWidth: 380, textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f9fafb", marginBottom: 6 }}>
              Session complete!
            </h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
              {pendingSession?.minutes}m focused · {pendingSession?.distractions || 0} distractions
            </p>


            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>How was your focus?</div>
              <RatingStars
                onRate={(rating) => {
                  setPendingSession(s => s ? { ...s, rating } : s)
                  setShowRatingModal(false)
                  setShowNoteModal(true)
                }}
                color={theme.primary}
              />
            </div>

            <button
              onClick={() => { setShowRatingModal(false); setShowNoteModal(true) }}
              style={{
                background: "none", border: "none", color: "#4b5563",
                cursor: "pointer", fontSize: 12,
              }}
            >
              Skip rating
            </button>
          </div>
        </div>
      )}


      {showNoteModal && (
        <NoteModal
          onSave={(note) => finalizeSession(pendingSession?.rating, note)}
          onSkip={() => finalizeSession(pendingSession?.rating)}
          theme={theme}
        />
      )}


      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @media (max-width: 760px) {
          .focus-timer-page {
            min-height: 100dvh !important;
          }
          .focus-header {
            padding: 10px 12px !important;
            align-items: center !important;
            flex-wrap: wrap;
            gap: 8px;
          }
          .focus-header-brand {
            min-width: 0;
          }
          .focus-header-controls {
            width: 100%;
            overflow-x: auto;
            padding-bottom: 2px;
          }
          .focus-header-controls > * {
            flex-shrink: 0;
          }
          .focus-header-divider {
            display: none;
          }
          .focus-ambient {
            max-width: 126px;
          }
          .focus-panel {
            padding: 14px 12px !important;
            max-height: min(42dvh, 360px) !important;
            overflow-y: auto !important;
          }
          .focus-stats-panel {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          .focus-settings-panel > div {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 14px !important;
          }
          .focus-task-form {
            flex-wrap: wrap;
          }
          .focus-task-form input {
            flex-basis: 100% !important;
          }
          .focus-main {
            justify-content: flex-start !important;
            padding: 24px 12px 30px !important;
          }
          .focus-modes {
            width: 100%;
            gap: 6px !important;
            margin-bottom: 26px !important;
          }
          .focus-modes button {
            flex: 1;
            padding: 8px 7px !important;
            white-space: nowrap;
          }
          .focus-ring {
            width: min(84vw, 290px);
            height: auto;
          }
          .focus-time {
            font-size: clamp(48px, 17vw, 60px) !important;
          }
          .focus-controls {
            gap: 8px !important;
          }
          .focus-start {
            padding: 14px 30px !important;
          }
          .focus-mini {
            right: 12px !important;
            bottom: 12px !important;
            max-width: calc(100vw - 24px);
          }
        }
        @media (max-width: 390px) {
          .focus-themes {
            display: none !important;
          }
          .focus-stats-panel {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .focus-ring {
            width: min(82vw, 270px);
          }
          .focus-start {
            padding-inline: 24px !important;
          }
        }
      `}</style>
    </div>
  )
}


function RatingStars({ onRate, color }: { onRate: (r: number) => void; color: string }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onClick={() => onRate(i)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 32, color: i <= hovered ? color : "rgba(255,255,255,0.15)",
            transition: "color 0.1s, transform 0.1s",
            transform: i <= hovered ? "scale(1.2)" : "scale(1)",
          }}
        >★</button>
      ))}
    </div>
  )
}


function NoteModal({
  onSave, onSkip, theme,
}: {
  onSave: (note: string) => void
  onSkip: () => void
  theme: typeof THEMES[Theme]
}) {
  const [note, setNote] = useState("")
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: 20,
    }}>
      <div style={{
        background: theme.surface, borderRadius: 18,
        border: `1px solid rgba(255,255,255,0.1)`,
        padding: 28, width: "100%", maxWidth: 380,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#f9fafb", marginBottom: 12 }}>
          Session note (optional)
        </h3>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What did you accomplish? Any blockers?"
          autoFocus
          rows={3}
          style={{
            width: "100%", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
            padding: "10px 12px", color: "#f9fafb", fontSize: 13,
            resize: "none", outline: "none", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={onSkip}
            style={{
              flex: 1, background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
              padding: "8px", color: "#6b7280", cursor: "pointer", fontSize: 13,
            }}
          >Skip</button>
          <button
            onClick={() => onSave(note)}
            style={{
              flex: 2, background: theme.primary, border: "none",
              borderRadius: 8, padding: "8px", color: "#fff",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}
          >Save note</button>
        </div>
      </div>
    </div>
  )
}
