/**
 * FocusTimer.tsx - Beast Mode Pomodoro Timer
 * FRONTEND FILE: src/pages/timer/FocusTimer.tsx
 * Features:
 * - Pomodoro timer (25/5/15 min cycles)
 * - Custom timer settings
 * - Session tracking and streaks
 * - Daily stats
 * - Sound notifications
 * - Keyboard shortcuts
 * - Beautiful animations
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft, Play, Pause, RotateCcw, Settings,
  Coffee, Brain, Trophy, Flame,
  SkipForward, Volume2, VolumeX, Timer,
  CheckCircle, BarChart2, X
} from "lucide-react"
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

interface TimerSettings {
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  sessionsBeforeLongBreak: number
  soundEnabled: boolean
  autoStartBreaks: boolean
  autoStartFocus: boolean
}

interface DayStats {
  sessions: number
  focusMinutes: number
  streak: number
}

const DEFAULT_SETTINGS: TimerSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
  soundEnabled: true,
  autoStartBreaks: false,
  autoStartFocus: false,
}

const MODE_CONFIG = {
  focus: {
    label: "Focus Time",
    color: "text-indigo-400",
    bg: "bg-indigo-950",
    border: "border-indigo-700",
    ring: "ring-indigo-500",
    gradient: "from-indigo-600 to-purple-600",
    icon: Brain,
    message: "Stay focused. You got this! 💪",
  },
  short_break: {
    label: "Short Break",
    color: "text-green-400",
    bg: "bg-green-950",
    border: "border-green-700",
    ring: "ring-green-500",
    gradient: "from-green-600 to-teal-600",
    icon: Coffee,
    message: "Take a breather. Stretch a bit! ☕",
  },
  long_break: {
    label: "Long Break",
    color: "text-blue-400",
    bg: "bg-blue-950",
    border: "border-blue-700",
    ring: "ring-blue-500",
    gradient: "from-blue-600 to-cyan-600",
    icon: Coffee,
    message: "Great work! Take a proper break! 🎉",
  },
}

export default function FocusTimer() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  const [mode, setMode] = useState<TimerMode>("focus")
  const [isRunning, setIsRunning] = useState(false)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)

  const loadSettings = () => {
    const savedSettings = localStorage.getItem("flowdesk_timer_settings")
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings) as TimerSettings
      } catch {
        return DEFAULT_SETTINGS
      }
    }
    return DEFAULT_SETTINGS
  }

  const loadDayStats = () => {
    const saved = localStorage.getItem("flowdesk_timer_stats")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const today = new Date().toDateString()
        if (parsed.date === today) {
          return parsed.stats as DayStats
        }
      } catch {
        // Ignore malformed saved stats
      }
    }
    return { sessions: 0, focusMinutes: 0, streak: 0 }
  }

  const initialSettings = loadSettings()
  const [settings, setSettings] = useState<TimerSettings>(initialSettings)
  const [tempSettings, setTempSettings] = useState<TimerSettings>(initialSettings)
  const [timeLeft, setTimeLeft] = useState(initialSettings.focusDuration * 60)
  const [dayStats, setDayStats] = useState<DayStats>(loadDayStats())

  const intervalRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])

  const playSound = useCallback((type: "start" | "complete" | "break") => {
    if (!settings.soundEnabled) return
    try {
      if (!audioRef.current) audioRef.current = new AudioContext()
      const ctx = audioRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      if (type === "complete") {
        oscillator.frequency.setValueAtTime(523, ctx.currentTime)
        oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1)
        oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2)
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.5)
      } else if (type === "break") {
        oscillator.frequency.setValueAtTime(440, ctx.currentTime)
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.3)
      } else {
        oscillator.frequency.setValueAtTime(600, ctx.currentTime)
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
        oscillator.start(ctx.currentTime)
        oscillator.stop(ctx.currentTime + 0.1)
      }
    } catch (error) {
      console.error("Failed to play sound", error)
    }
  }, [settings.soundEnabled])

  const saveSession = useCallback(async (minutes: number) => {
    try {
      await api.post("/timer/sessions", {
        duration_minutes: minutes,
        completed: true,
        session_date: new Date().toISOString().split("T")[0],
      })
    } catch (error) {
      console.error("Failed to save session", error)
    }

    // Update local stats
    const today = new Date().toDateString()
    const newStats = {
      sessions: dayStats.sessions + 1,
      focusMinutes: dayStats.focusMinutes + minutes,
      streak: dayStats.streak,
    }
    setDayStats(newStats)
    localStorage.setItem("flowdesk_timer_stats", JSON.stringify({ date: today, stats: newStats }))
  }, [dayStats])

  const handleTimerComplete = useCallback(async () => {
    setIsRunning(false)
    playSound("complete")

    if (mode === "focus") {
      const minutes = settings.focusDuration
      const newSessions = sessionsCompleted + 1
      setSessionsCompleted(newSessions)
      await saveSession(minutes)

      toast.success(`🎉 Focus session complete! +${minutes} minutes`, { duration: 4000 })

      // Determine next break
      if (newSessions % settings.sessionsBeforeLongBreak === 0) {
        setMode("long_break")
        setTimeLeft(settings.longBreakDuration * 60)
        toast("☕ Time for a long break!", { duration: 3000 })
        if (settings.autoStartBreaks) setIsRunning(true)
      } else {
        setMode("short_break")
        setTimeLeft(settings.shortBreakDuration * 60)
        toast("☕ Short break time!", { duration: 3000 })
        if (settings.autoStartBreaks) setIsRunning(true)
      }
    } else {
      playSound("break")
      setMode("focus")
      setTimeLeft(settings.focusDuration * 60)
      toast("🧠 Break over! Ready to focus?", { duration: 3000 })
      if (settings.autoStartFocus) setIsRunning(true)
    }
  }, [mode, settings, sessionsCompleted, playSound, saveSession])

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            handleTimerComplete()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning, handleTimerComplete])

  const handleStart = () => {
    if (!isRunning) {
      playSound("start")
    }
    setIsRunning(!isRunning)
  }

  const handleReset = () => {
    setIsRunning(false)
    const durations = {
      focus: settings.focusDuration,
      short_break: settings.shortBreakDuration,
      long_break: settings.longBreakDuration,
    }
    setTimeLeft(durations[mode] * 60)
  }

  const handleSkip = () => {
    setIsRunning(false)
    if (mode === "focus") {
      const newSessions = sessionsCompleted + 1
      setSessionsCompleted(newSessions)
      if (newSessions % settings.sessionsBeforeLongBreak === 0) {
        setMode("long_break")
        setTimeLeft(settings.longBreakDuration * 60)
      } else {
        setMode("short_break")
        setTimeLeft(settings.shortBreakDuration * 60)
      }
    } else {
      setMode("focus")
      setTimeLeft(settings.focusDuration * 60)
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
  }

  const saveSettings = () => {
    setSettings(tempSettings)
    localStorage.setItem("flowdesk_timer_settings", JSON.stringify(tempSettings))
    setTimeLeft(tempSettings.focusDuration * 60)
    setMode("focus")
    setIsRunning(false)
    setShowSettings(false)
    toast.success("Settings saved!")
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0")
    const s = (seconds % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }

  const totalSeconds = mode === "focus"
    ? settings.focusDuration * 60
    : mode === "short_break"
    ? settings.shortBreakDuration * 60
    : settings.longBreakDuration * 60

  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100
  const modeConfig = MODE_CONFIG[mode]
  const ModeIcon = modeConfig.icon

  // Update page title
  useEffect(() => {
    document.title = isRunning ? `${formatTime(timeLeft)} — FlowDesk Timer` : "FlowDesk Timer"
    return () => { document.title = "FlowDesk" }
  }, [timeLeft, isRunning])

  // Circular progress
  const radius = 120
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <Timer className="text-indigo-500" size={22} />
            <h1 className="text-xl font-bold text-white">Focus Timer</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowStats(!showStats)}
            className={`p-2 rounded-lg transition-colors ${showStats ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}>
            <BarChart2 size={16} />
          </button>
          <button onClick={() => { setTempSettings(settings); setShowSettings(true) }}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
            <Settings size={16} />
          </button>
          <button onClick={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
            {settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {showStats && (
        <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 grid grid-cols-4 gap-4">
          {[
            { label: "Today's Sessions", value: dayStats.sessions, icon: CheckCircle, color: "text-green-400", bg: "bg-green-950" },
            { label: "Focus Minutes", value: dayStats.focusMinutes, icon: Timer, color: "text-indigo-400", bg: "bg-indigo-950" },
            { label: "Session Streak", value: `${sessionsCompleted}`, icon: Flame, color: "text-orange-400", bg: "bg-orange-950" },
            { label: "Total Today", value: `${Math.floor(dayStats.focusMinutes / 60)}h ${dayStats.focusMinutes % 60}m`, icon: Trophy, color: "text-yellow-400", bg: "bg-yellow-950" },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-lg p-3 border border-gray-800 flex items-center gap-3`}>
              <stat.icon className={stat.color} size={20} />
              <div>
                <p className="text-gray-500 text-xs">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Timer */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">

        {/* Mode Selector */}
        <div className="flex gap-2 mb-10">
          {(["focus", "short_break", "long_break"] as TimerMode[]).map(m => (
            <button key={m} onClick={() => handleModeChange(m)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                mode === m
                  ? `bg-gradient-to-r ${MODE_CONFIG[m].gradient} text-white shadow-lg`
                  : "text-gray-500 hover:text-white hover:bg-gray-800"
              }`}>
              {m === "focus" ? "Focus" : m === "short_break" ? "Short Break" : "Long Break"}
            </button>
          ))}
        </div>

        {/* Timer Circle */}
        <div className="relative mb-10">
          <svg width="300" height="300" className="transform -rotate-90">
            {/* Background circle */}
            <circle cx="150" cy="150" r={radius}
              fill="none" stroke="#1f2937" strokeWidth="8" />
            {/* Progress circle */}
            <circle cx="150" cy="150" r={radius}
              fill="none"
              stroke={mode === "focus" ? "#6366f1" : mode === "short_break" ? "#10b981" : "#3b82f6"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000"
            />
          </svg>

          {/* Timer display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <ModeIcon size={28} className={`${modeConfig.color} mb-3`} />
            <span className={`text-6xl font-bold font-mono ${modeConfig.color}`}>
              {formatTime(timeLeft)}
            </span>
            <span className="text-gray-500 text-sm mt-2">{modeConfig.label}</span>
            {isRunning && (
              <div className="flex gap-1 mt-3">
                {[0, 150, 300].map(d => (
                  <div key={d} className={`w-1.5 h-1.5 rounded-full ${mode === "focus" ? "bg-indigo-500" : mode === "short_break" ? "bg-green-500" : "bg-blue-500"} animate-bounce`}
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mode message */}
        <p className="text-gray-500 text-sm mb-8 text-center">{modeConfig.message}</p>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={handleReset}
            className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-all">
            <RotateCcw size={20} />
          </button>

          <button onClick={handleStart}
            className={`flex items-center gap-3 px-10 py-4 rounded-2xl text-white font-bold text-lg transition-all shadow-2xl bg-gradient-to-r ${modeConfig.gradient} hover:scale-105 active:scale-95`}>
            {isRunning ? <Pause size={24} /> : <Play size={24} />}
            {isRunning ? "Pause" : "Start"}
          </button>

          <button onClick={handleSkip}
            className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-all">
            <SkipForward size={20} />
          </button>
        </div>

        {/* Session dots */}
        <div className="flex items-center gap-3">
          <span className="text-gray-600 text-xs">Session</span>
          <div className="flex gap-2">
            {Array.from({ length: settings.sessionsBeforeLongBreak }).map((_, i) => (
              <div key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < (sessionsCompleted % settings.sessionsBeforeLongBreak)
                    ? "bg-indigo-500 scale-110"
                    : "bg-gray-700"
                }`} />
            ))}
          </div>
          <span className="text-gray-600 text-xs">Long Break</span>
        </div>

        {/* Today's progress */}
        {dayStats.sessions > 0 && (
          <div className="mt-6 flex items-center gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-400">{dayStats.sessions}</p>
              <p className="text-gray-600 text-xs">Sessions Today</p>
            </div>
            <div className="w-px h-8 bg-gray-800" />
            <div>
              <p className="text-2xl font-bold text-green-400">{dayStats.focusMinutes}m</p>
              <p className="text-gray-600 text-xs">Minutes Focused</p>
            </div>
            <div className="w-px h-8 bg-gray-800" />
            <div>
              <p className="text-2xl font-bold text-orange-400 flex items-center gap-1">
                <Flame size={18} />{sessionsCompleted}
              </p>
              <p className="text-gray-600 text-xs">Streak</p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">⚙️ Timer Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {[
                { label: "Focus Duration (minutes)", key: "focusDuration", min: 1, max: 90 },
                { label: "Short Break (minutes)", key: "shortBreakDuration", min: 1, max: 30 },
                { label: "Long Break (minutes)", key: "longBreakDuration", min: 5, max: 60 },
                { label: "Sessions before Long Break", key: "sessionsBeforeLongBreak", min: 1, max: 10 },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-400 mb-2 font-medium">{field.label}</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={field.min} max={field.max}
                      value={tempSettings[field.key as keyof TimerSettings] as number}
                      onChange={(e) => setTempSettings(s => ({ ...s, [field.key]: parseInt(e.target.value) }))}
                      className="flex-1 accent-indigo-500" />
                    <span className="text-white font-bold w-8 text-center">
                      {tempSettings[field.key as keyof TimerSettings] as number}
                    </span>
                  </div>
                </div>
              ))}

              <div className="space-y-3 pt-2">
                {[
                  { label: "Sound notifications", key: "soundEnabled" },
                  { label: "Auto-start breaks", key: "autoStartBreaks" },
                  { label: "Auto-start focus sessions", key: "autoStartFocus" },
                ].map(toggle => (
                  <div key={toggle.key} className="flex items-center justify-between">
                    <span className="text-gray-300 text-sm">{toggle.label}</span>
                    <button
                      onClick={() => setTempSettings(s => ({ ...s, [toggle.key]: !s[toggle.key as keyof TimerSettings] }))}
                      className={`relative w-10 h-5 rounded-full transition-colors ${tempSettings[toggle.key as keyof TimerSettings] ? "bg-indigo-600" : "bg-gray-700"}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${tempSettings[toggle.key as keyof TimerSettings] ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-800">
              <button onClick={() => setShowSettings(false)} className="flex-1 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={saveSettings}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}