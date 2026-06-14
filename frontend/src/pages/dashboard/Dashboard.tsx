/**
 * Dashboard.tsx — FlowDesk Enterprise Dashboard
 * FRONTEND FILE: src/pages/dashboard/Dashboard.tsx
 *
 * Design direction:
 * - Near-black #080B14 base, not generic gray-950
 * - Indigo #6366F1 primary, with a single electric-cyan #22D3EE accent
 * - Monospace for all data/numbers, Inter-style sans for UI
 * - Signature: animated code-particle hero that drifts in the background
 * - Feature cards: icon-led, with a thin left-accent rule that lights up on hover
 * - Sidebar quick-stats column on large screens
 * - Keyboard shortcut hints on cards (G then key)
 */

import { useNavigate } from "react-router-dom"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Code2, LogOut, FileCode, FileText, Kanban,
  Bot, Timer, GitCompare, Zap, ChevronRight,
  Activity, Clock, Star, TrendingUp, RefreshCw,
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import { createProCheckout } from "../../services/api/payments.api"
import { getDashboardStats } from "../../services/api/dashboard.api"
import type { DashboardStats } from "../../services/api/dashboard.api"
import axios from "axios"
import toast from "react-hot-toast"

/* ─── FEATURE REGISTRY ───────────────────────────────────────────────── */
const features = [
  {
    icon: FileCode,
    title: "Snippets",
    desc: "Save, tag, and search code across 50+ languages",
    path: "/snippets",
    ready: true,
    accentColor: "#6366f1",
    shortcut: "S",
    stat: "0 saved",
  },
  {
    icon: FileText,
    title: "Notes",
    desc: "Rich text notes with inline code blocks and task lists",
    path: "/notes",
    ready: true,
    accentColor: "#22d3ee",
    shortcut: "N",
    stat: "0 notes",
  },
  {
    icon: Kanban,
    title: "Tasks",
    desc: "Kanban board built for engineering workflows",
    path: "/tasks",
    ready: true,
    accentColor: "#f59e0b",
    shortcut: "T",
    stat: "0 open",
  },
  {
    icon: Bot,
    title: "AI Assistant",
    desc: "Llama 3.3 70B — explain, fix, refactor, generate",
    path: "/ai",
    ready: true,
    accentColor: "#a855f7",
    shortcut: "A",
    stat: "Ready",
  },
  {
    icon: Timer,
    title: "Focus Timer",
    desc: "Beast-mode Pomodoro with flow tracking and session log",
    path: "/timer",
    ready: true,
    accentColor: "#f97316",
    shortcut: "F",
    stat: "0m today",
  },
  {
    icon: GitCompare,
    title: "Code Diff",
    desc: "Side-by-side diff viewer with syntax highlighting",
    path: "/diff",
    ready: true,
    accentColor: "#10b981",
    shortcut: "D",
    stat: "Instant",
  },
]

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  focus_minutes_today: 0,
  tasks_completed_today: 0,
  snippets_saved_today: 0,
  ai_sessions_today: 0,
  snippets_total: 0,
  notes_total: 0,
  open_tasks: 0,
}

function getLocalDateKey(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`
}

function getFeatureStat(feature: typeof features[number], stats: DashboardStats) {
  switch (feature.path) {
    case "/snippets":
      return `${stats.snippets_total} saved`
    case "/notes":
      return `${stats.notes_total} notes`
    case "/tasks":
      return `${stats.open_tasks} open`
    case "/ai":
      return `${stats.ai_sessions_today} today`
    case "/timer":
      return `${formatMinutes(stats.focus_minutes_today)} today`
    default:
      return feature.stat
  }
}

/* ─── ANIMATED CODE CANVAS ───────────────────────────────────────────── */
function CodeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const CHARS = "01{}[]()<>=!&|+*;:./\\abcdefghijklmnopqrstuvwxyz"
    const COLS = Math.floor(canvas.width / 18)
    const drops: number[] = Array(COLS).fill(0).map(() => Math.random() * -80)

    let frame: number
    const draw = () => {
      ctx.fillStyle = "rgba(8,11,20,0.18)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.font = "13px 'JetBrains Mono', 'Fira Code', monospace"

      for (let i = 0; i < drops.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)]
        const x = i * 18
        const y = drops[i] * 18

        // Lead character brighter
        ctx.fillStyle = `rgba(99,102,241,${Math.random() * 0.3 + 0.05})`
        ctx.fillText(char, x, y)

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }
        drops[i] += 0.35
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        opacity: 0.55,
        pointerEvents: "none",
      }}
    />
  )
}

/* ─── FEATURE CARD ───────────────────────────────────────────────────── */
function FeatureCard({
  feature,
  stat,
  onClick,
}: {
  feature: typeof features[0]
  stat: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const Icon = feature.icon

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "rgba(255,255,255,0.045)"
          : "rgba(255,255,255,0.025)",
        border: `1px solid ${hovered ? feature.accentColor + "55" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 14,
        padding: "22px 22px 18px",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.2s, border-color 0.2s, transform 0.15s",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Left accent rule */}
      <div style={{
        position: "absolute", left: 0, top: "20%", bottom: "20%",
        width: 3, borderRadius: "0 3px 3px 0",
        background: feature.accentColor,
        opacity: hovered ? 1 : 0.3,
        transition: "opacity 0.2s, top 0.2s, bottom 0.2s",
        ...(hovered ? { top: "10%", bottom: "10%" } : {}),
      }} />

      {/* Corner glow */}
      {hovered && (
        <div style={{
          position: "absolute", top: -30, right: -30,
          width: 120, height: 120, borderRadius: "50%",
          background: feature.accentColor,
          opacity: 0.06,
          pointerEvents: "none",
        }} />
      )}

      {/* Icon + shortcut */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: `${feature.accentColor}18`,
          border: `1px solid ${feature.accentColor}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={20} style={{ color: feature.accentColor }} />
        </div>
        <span style={{
          fontSize: 10, fontFamily: "monospace",
          color: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 5, padding: "2px 6px", letterSpacing: 0.5,
          opacity: hovered ? 1 : 0.5,
          transition: "opacity 0.2s",
        }}>
          G · {feature.shortcut}
        </span>
      </div>

      {/* Title + badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>
          {feature.title}
        </span>
        <span style={{
          fontSize: 10, padding: "2px 7px", borderRadius: 99,
          background: "#052e16", color: "#4ade80",
          border: "1px solid #166534",
          fontWeight: 500,
        }}>live</span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55, margin: 0, marginBottom: 16, flex: 1 }}>
        {feature.desc}
      </p>

      {/* Footer: stat + arrow */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11, color: feature.accentColor,
          fontFamily: "monospace", opacity: 0.8,
        }}>
          {stat}
        </span>
        <ChevronRight
          size={14}
          style={{
            color: feature.accentColor,
            opacity: hovered ? 1 : 0.3,
            transform: hovered ? "translateX(3px)" : "translateX(0)",
            transition: "opacity 0.2s, transform 0.2s",
          }}
        />
      </div>
    </button>
  )
}

/* ─── QUICK STAT ─────────────────────────────────────────────────────── */
function QuickStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: string
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: `${color}15`, display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0", fontFamily: "monospace" }}>{value}</div>
      </div>
    </div>
  )
}

/* ─── DASHBOARD ──────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user, accessToken, isAuthenticated, logout, refreshUser } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [dashboardStats, setDashboardStats] = useState(EMPTY_DASHBOARD_STATS)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const loadDashboardStats = useCallback(async () => {
    if (!isAuthenticated) return
    setStatsLoading(true)
    try {
      const response = await getDashboardStats(getLocalDateKey())
      setDashboardStats(response.stats)
      setStatsError(false)
    } catch {
      setStatsError(true)
    } finally {
      setStatsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadDashboardStats()
    }, 0)
    window.addEventListener("focus", loadDashboardStats)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener("focus", loadDashboardStats)
    }
  }, [loadDashboardStats])

  // Global keyboard shortcuts (G + key)
  useEffect(() => {
    let gPressed = false
    let gTimer: number
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return

      if (e.key.toLowerCase() === "g") {
        gPressed = true
        clearTimeout(gTimer)
        gTimer = window.setTimeout(() => { gPressed = false }, 1200)
        return
      }
      if (gPressed) {
        const map: Record<string, string> = {
          s: "/snippets", n: "/notes", t: "/tasks",
          a: "/ai", f: "/timer", d: "/diff",
        }
        const path = map[e.key.toLowerCase()]
        if (path) navigate(path)
        gPressed = false
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [navigate])

  useEffect(() => {
    if (!isCheckoutOpen) return

    let cancelled = false
    let refreshing = false
    const refreshPlan = async () => {
      if (refreshing) return
      refreshing = true

      for (const delay of [0, 1500, 3000]) {
        if (delay) {
          await new Promise(resolve => window.setTimeout(resolve, delay))
        }
        if (cancelled) return

        try {
          await refreshUser()
          if (useAuthStore.getState().user?.plan === "pro") {
            setIsCheckoutOpen(false)
            toast.success("Your FlowDesk Pro plan is active.")
            return
          }
        } catch {
          // A later attempt can succeed if the webhook is still processing.
        }
      }

      if (!cancelled) setIsCheckoutOpen(false)
      refreshing = false
    }

    window.addEventListener("focus", refreshPlan)
    return () => {
      cancelled = true
      window.removeEventListener("focus", refreshPlan)
    }
  }, [isCheckoutOpen, refreshUser])

  const handleLogout = async () => {
    await logout()
    toast.success("Logged out")
    navigate("/")
  }

  const handleUpgrade = async () => {
    if (!accessToken) {
      toast.error("Please sign in again before upgrading.")
      navigate("/login")
      return
    }

    const checkoutWindow = window.open("", "_blank")
    if (!checkoutWindow) {
      toast.error("Please allow pop-ups for FlowDesk to open the secure checkout.")
      return
    }
    checkoutWindow.opener = null

    setIsUpgrading(true)
    try {
      const { checkout_url } = await createProCheckout(accessToken)
      checkoutWindow.location.href = checkout_url
      setIsCheckoutOpen(true)
      setIsUpgrading(false)
    } catch (error: unknown) {
      checkoutWindow.close()
      const message = axios.isAxiosError<{ detail?: string }>(error)
        ? error.response?.data?.detail || "Unable to start checkout."
        : "Unable to start checkout."
      toast.error(message, { duration: 5000 })
      setIsUpgrading(false)
    }
  }

  const greeting = (() => {
    const h = time.getHours()
    if (h < 12) return "Good morning"
    if (h < 17) return "Good afternoon"
    return "Good evening"
  })()

  const timeStr = time.toLocaleTimeString("en", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })

  const dateStr = time.toLocaleDateString("en", {
    weekday: "long", month: "long", day: "numeric",
  })

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080b14",
      color: "#e2e8f0",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* ── TOPNAV ─────────────────────────────────────────────────── */}
      <nav className="dashboard-nav" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 56,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(8,11,20,0.95)",
        backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <div className="dashboard-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Code2 size={17} color="#fff" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", letterSpacing: -0.3 }}>
            FlowDesk
          </span>
          <span className="dashboard-beta" style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 99, marginLeft: 2,
            background: "rgba(99,102,241,0.15)", color: "#818cf8",
            border: "1px solid rgba(99,102,241,0.25)", fontWeight: 500,
          }}>
            beta
          </span>
        </div>

        {/* Right: clock + user + logout */}
        <div className="dashboard-nav-actions" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span className="dashboard-clock" style={{
            fontSize: 13, fontFamily: "monospace", color: "#334155",
            letterSpacing: 0.5,
          }}>
            {timeStr}
          </span>

          <div className="dashboard-divider" style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Avatar */}
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1 0%, #22d3ee 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff",
            }}>
              {(user?.display_name?.[0] ?? "U").toUpperCase()}
            </div>
            <span className="dashboard-user-name" style={{ fontSize: 13, color: "#94a3b8" }}>
              {user?.display_name}
            </span>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 99,
              background: user?.plan === "pro" ? "rgba(168,85,247,0.15)" : "rgba(99,102,241,0.12)",
              color: user?.plan === "pro" ? "#c084fc" : "#818cf8",
              border: `1px solid ${user?.plan === "pro" ? "rgba(168,85,247,0.3)" : "rgba(99,102,241,0.25)"}`,
              fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              {user?.plan ?? "free"}
            </span>
          </div>

          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none",
              color: "#475569", cursor: "pointer",
              fontSize: 13, padding: "6px 10px", borderRadius: 8,
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "#e2e8f0"
              ;(e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "#475569"
              ;(e.currentTarget as HTMLElement).style.background = "none"
            }}
          >
            <LogOut size={14} /> <span className="dashboard-signout-label">Sign out</span>
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <div className="dashboard-hero" style={{
        position: "relative",
        padding: "52px 28px 44px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
        background: "#080b14",
      }}>
        {/* Animated code rain */}
        <CodeCanvas />

        {/* Radial vignette over the canvas */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 70% 100% at 50% 100%, #080b14 60%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto" }}>
          {/* Eyebrow */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontSize: 11, color: "#22d3ee",
            fontFamily: "monospace", marginBottom: 14, letterSpacing: 0.8,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#22d3ee",
              boxShadow: "0 0 8px #22d3ee",
              animation: "pulse 2s infinite",
            }} />
            {dateStr}
          </div>

          <h1 className="dashboard-title" style={{
            fontSize: 38, fontWeight: 700, color: "#f8fafc",
            margin: "0 0 8px", letterSpacing: -1, lineHeight: 1.1,
          }}>
            {greeting},{" "}
            <span style={{
              background: "linear-gradient(90deg, #6366f1, #22d3ee)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              {user?.display_name ?? "developer"}
            </span>
            .
          </h1>
          <p style={{ fontSize: 15, color: "#475569", margin: 0 }}>
            Everything in one place. Press <kbd style={{
              fontFamily: "monospace", fontSize: 11,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4, padding: "1px 6px", color: "#94a3b8",
            }}>G</kbd> then a shortcut to jump anywhere.
          </p>
        </div>
      </div>

      {/* ── BODY: GRID + SIDEBAR ───────────────────────────────────── */}
      <div className="dashboard-body" style={{
        flex: 1,
        maxWidth: 1100, width: "100%", margin: "0 auto",
        padding: "32px 28px",
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gap: 32,
        alignItems: "start",
      }}>

        {/* ── FEATURE GRID ─────────────────────────────────────────── */}
        <div>
          <div className="dashboard-feature-grid" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              Tools
            </span>
            <span style={{ fontSize: 11, color: "#1e293b", fontFamily: "monospace" }}>
              {features.length} available
            </span>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}>
            {features.map(f => (
              <FeatureCard
                key={f.title}
                feature={f}
                stat={statsLoading ? "Loading..." : statsError ? "Unavailable" : getFeatureStat(f, dashboardStats)}
                onClick={() => navigate(f.path)}
              />
            ))}
          </div>
        </div>

        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="dashboard-sidebar">

          {/* Quick stats */}
          <div className="dashboard-quick-stats" style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, padding: "18px 20px",
            marginBottom: 16,
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 8, marginBottom: 4,
            }}>
              <span style={{ fontSize: 11, color: "#334155", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                Today
              </span>
              <button
                type="button"
                onClick={() => void loadDashboardStats()}
                disabled={statsLoading}
                aria-label="Refresh dashboard statistics"
                title={statsError ? "Statistics unavailable. Try again." : "Refresh statistics"}
                style={{
                  width: 26, height: 26, borderRadius: 7,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: statsError ? "rgba(244,63,94,0.08)" : "rgba(255,255,255,0.03)",
                  color: statsError ? "#f43f5e" : "#475569",
                  cursor: statsLoading ? "wait" : "pointer",
                }}
              >
                <RefreshCw size={12} style={{ animation: statsLoading ? "spin 1s linear infinite" : "none" }} />
              </button>
            </div>
            <QuickStat
              icon={Clock}
              label="Focus time"
              value={statsLoading || statsError ? "—" : formatMinutes(dashboardStats.focus_minutes_today)}
              color="#f97316"
            />
            <QuickStat
              icon={Activity}
              label="Tasks completed"
              value={statsLoading || statsError ? "—" : String(dashboardStats.tasks_completed_today)}
              color="#10b981"
            />
            <QuickStat
              icon={Star}
              label="Snippets saved"
              value={statsLoading || statsError ? "—" : String(dashboardStats.snippets_saved_today)}
              color="#6366f1"
            />
            <QuickStat
              icon={TrendingUp}
              label="AI sessions"
              value={statsLoading || statsError ? "—" : String(dashboardStats.ai_sessions_today)}
              color="#a855f7"
            />
          </div>

          {/* Keyboard shortcuts reference */}
          <div className="dashboard-shortcuts" style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, padding: "18px 20px",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: "#334155", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Shortcuts
            </div>
            {features.map(f => (
              <div key={f.title} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 12, color: "#475569" }}>{f.title}</span>
                <span style={{
                  fontFamily: "monospace", fontSize: 11,
                  color: "#334155", display: "flex", gap: 4,
                }}>
                  {["G", f.shortcut].map(k => (
                    <kbd key={k} style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 4, padding: "1px 5px", color: "#64748b",
                    }}>{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>

          {/* Plan card */}
          <div style={{
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Zap size={15} style={{ color: "#6366f1" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#a5b4fc" }}>
                {user?.plan === "pro" ? "Pro plan" : "Free plan"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#475569", margin: "0 0 12px", lineHeight: 1.5 }}>
              {user?.plan === "pro"
                ? "All features unlocked. Thanks for supporting FlowDesk."
                : "Upgrade to Pro for unlimited snippets, AI sessions, and priority support."}
            </p>
            {user?.plan !== "pro" && (
              <>
                <button
                  onClick={handleUpgrade}
                  disabled={isUpgrading || isCheckoutOpen}
                  style={{
                  width: "100%", background: "rgba(99,102,241,0.2)",
                  border: "1px solid rgba(99,102,241,0.35)", borderRadius: 8,
                  padding: "8px", color: "#818cf8",
                  cursor: isUpgrading ? "wait" : isCheckoutOpen ? "default" : "pointer",
                  opacity: isUpgrading || isCheckoutOpen ? 0.65 : 1,
                  fontSize: 12, fontWeight: 600,
                }}>
                  {isUpgrading
                    ? "Opening checkout..."
                    : isCheckoutOpen
                      ? "Checkout opened"
                      : "Upgrade to Pro →"}
                </button>
                <p style={{
                  margin: "9px 0 0",
                  color: "#334155",
                  fontSize: 10,
                  lineHeight: 1.45,
                }}>
                  Subscriptions renew automatically until cancelled. Cancellation stops future
                  renewals. All subscription payments are final and non-refundable, except where
                  required by applicable law or the payment provider.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @media (max-width: 800px) {
          .dashboard-nav {
            padding: 0 14px !important;
          }
          .dashboard-nav-actions {
            gap: 9px !important;
          }
          .dashboard-clock,
          .dashboard-divider,
          .dashboard-user-name,
          .dashboard-beta {
            display: none !important;
          }
          .dashboard-hero {
            padding: 38px 18px 34px !important;
          }
          .dashboard-title {
            font-size: clamp(30px, 9vw, 38px) !important;
          }
          .dashboard-body {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 20px !important;
            padding: 22px 16px 32px !important;
          }
          .dashboard-feature-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .dashboard-sidebar {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }
          .dashboard-sidebar > div {
            margin-bottom: 0 !important;
          }
          .dashboard-shortcuts {
            display: none;
          }
        }
        @media (max-width: 520px) {
          .dashboard-sidebar {
            grid-template-columns: minmax(0, 1fr);
          }
          .dashboard-quick-stats {
            display: none;
          }
          .dashboard-signout-label {
            display: none;
          }
          .dashboard-brand {
            gap: 8px !important;
          }
        }
      `}</style>
    </div>
  )
}
