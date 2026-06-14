import { Link } from "react-router-dom"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Code2, FileText, Kanban, Bot, Timer, GitCompare,
  ArrowRight, Zap, Shield, Globe, ChevronRight,
  Star, Check, Sparkles, X,
} from "lucide-react"

type LegalDocument = "privacy" | "terms"

const LEGAL_DOCUMENTS: Record<LegalDocument, {
  title: string
  intro: string
  sections: { heading: string; body: string }[]
}> = {
  privacy: {
    title: "Privacy Notice",
    intro: "This notice explains the information FlowDesk uses to provide the workspace.",
    sections: [
      {
        heading: "Information you provide",
        body: "FlowDesk stores account details such as your display name and email address, along with the snippets, notes, tasks, and other workspace content you choose to create.",
      },
      {
        heading: "How information is used",
        body: "Your information is used to authenticate your account, save and synchronize your workspace, maintain the service, and provide features you request. Content submitted to an AI feature may be sent to the configured AI provider to produce its response.",
      },
      {
        heading: "Local browser data",
        body: "Some preferences, note metadata, and interface settings are stored in your browser. Clearing browser storage can remove that local-only information.",
      },
      {
        heading: "Security and responsibility",
        body: "FlowDesk uses reasonable safeguards, but no online service can guarantee absolute security. Do not store passwords, private keys, access tokens, or other secrets in workspace content.",
      },
    ],
  },
  terms: {
    title: "Terms of Use",
    intro: "By using FlowDesk, you agree to use the service responsibly and lawfully.",
    sections: [
      {
        heading: "Your account",
        body: "You are responsible for the activity under your account and for keeping your sign-in credentials secure. Information supplied during registration must be accurate.",
      },
      {
        heading: "Your content",
        body: "You retain ownership of the content you create. You allow FlowDesk to process and store that content only as needed to operate the features you use.",
      },
      {
        heading: "Acceptable use",
        body: "Do not use FlowDesk to violate laws, harm others, distribute malicious software, interfere with the service, or access accounts and systems without permission.",
      },
      {
        heading: "Service availability",
        body: "FlowDesk is under active development and is provided as available. Features may change, experience interruptions, or contain defects. Important work should also be backed up independently.",
      },
    ],
  },
}

const FEATURES = [
  {
    icon: Code2,
    title: "Snippet Manager",
    desc: "Save, tag, and search code across 50+ languages. Monaco editor, bulk export, templates, and a command palette.",
    color: "#6366F1",
    tag: "Code",
    bullets: ["Monaco editor", "50+ languages", "Command palette"],
  },
  {
    icon: FileText,
    title: "Developer Notes",
    desc: "Rich text notes with code blocks, AI summaries, version history, focus mode, and slash commands.",
    color: "#22D3EE",
    tag: "Write",
    bullets: ["AI summaries", "Version history", "6 templates"],
  },
  {
    icon: Kanban,
    title: "Task Board",
    desc: "Kanban built for engineers — drag & drop, subtasks, time tracking, priority filters, and list view.",
    color: "#F59E0B",
    tag: "Plan",
    bullets: ["Time tracking", "Subtasks", "Export CSV"],
  },
  {
    icon: Bot,
    title: "AI Assistant",
    desc: "Powered by Llama 3.3 70B. Explain, fix, refactor, and generate code with full context awareness.",
    color: "#A855F7",
    tag: "AI",
    bullets: ["Llama 3.3 70B", "Code-aware", "Always free"],
  },
  {
    icon: Timer,
    title: "Focus Timer",
    desc: "Beast-mode Pomodoro with flow state tracking, session notes, ambient sounds, and daily heatmaps.",
    color: "#F97316",
    tag: "Focus",
    bullets: ["Flow state", "Session log", "7-day heatmap"],
  },
  {
    icon: GitCompare,
    title: "Code Diff",
    desc: "Instant side-by-side diff viewer with syntax highlighting, line numbers, and copy-to-clipboard.",
    color: "#10B981",
    tag: "Compare",
    bullets: ["Syntax highlight", "Side by side", "Instant"],
  },
]

const STATS = [
  { value: "50+", label: "Languages supported" },
  { value: "6", label: "Integrated tools" },
  { value: "100%", label: "Free to start" },
  { value: "0", label: "Context switches" },
]

const TESTIMONIALS = [
  { text: "Replaced Notion, GitHub Gists, TickTick, and a pomodoro app. One tab.", author: "Senior SWE, Google" },
  { text: "The snippet manager alone is worth it. Monaco in the browser, instant search.", author: "Backend Dev, Berlin" },
  { text: "I finally stay in flow. The focus timer + tasks combo is unreal.", author: "Indie dev, Toronto" },
]

// Animated counter
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let timer: number | null = null
    const observer = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      observer.disconnect()
      if (to <= 0) {
        setCount(0)
        return
      }
      let start = 0
      const step = Math.max(1, Math.ceil(to / 40))
      timer = window.setInterval(() => {
        start = Math.min(start + step, to)
        setCount(start)
        if (start >= to && timer !== null) {
          window.clearInterval(timer)
          timer = null
        }
      }, 28)
    }, { threshold: 0.5 })
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (timer !== null) window.clearInterval(timer)
    }
  }, [to])
  return <span ref={ref}>{count}{suffix}</span>
}

// Floating code particles background
function CodeRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let drops: number[] = []
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const cols = Math.ceil(canvas.width / 22)
      drops = Array.from({ length: cols }, (_, index) => drops[index] ?? Math.random() * -60)
    }
    resize()
    window.addEventListener("resize", resize)
    const CHARS = "const async function return import export class type interface{};=>"
    let frame: number
    const draw = () => {
      ctx.fillStyle = "rgba(8,11,20,0.15)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.font = "12px 'JetBrains Mono', monospace"
      for (let i = 0; i < drops.length; i++) {
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)]
        ctx.fillStyle = `rgba(99,102,241,${Math.random() * 0.2 + 0.03})`
        ctx.fillText(ch, i * 22, drops[i] * 18)
        if (drops[i] * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i] += 0.4
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize) }
  }, [])
  return (
    <canvas ref={canvasRef} aria-hidden="true" style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      opacity: 0.6, pointerEvents: "none",
    }} />
  )
}

function LegalDialog({
  document, onClose,
}: {
  document: LegalDocument
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const content = LEGAL_DOCUMENTS[document]

  useEffect(() => {
    const previousOverflow = window.document.body.style.overflow
    const previousFocus = window.document.activeElement as HTMLElement | null
    window.document.body.style.overflow = "hidden"
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key === "Tab") {
        event.preventDefault()
        closeRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [document, onClose])

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, background: "rgba(2,6,23,0.82)", backdropFilter: "blur(8px)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`legal-${document}-title`}
        aria-describedby={`legal-${document}-intro`}
        style={{
          width: "min(100%, 620px)", maxHeight: "min(82dvh, 720px)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: "#0F1320", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.58)",
        }}
      >
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div>
            <div style={{ color: "#818CF8", fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
              FlowDesk
            </div>
            <h2 id={`legal-${document}-title`} style={{ margin: 0, color: "#F8FAFC", fontSize: 20 }}>
              {content.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${content.title}`}
            style={{
              width: 36, height: 36, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)", color: "#94A3B8", cursor: "pointer",
            }}
          >
            <X size={17} />
          </button>
        </header>

        <div style={{ overflowY: "auto", padding: "20px clamp(18px, 5vw, 28px) 28px" }}>
          <p id={`legal-${document}-intro`} style={{ margin: "0 0 20px", color: "#94A3B8", fontSize: 14, lineHeight: 1.7 }}>
            {content.intro}
          </p>
          {content.sections.map(section => (
            <div key={section.heading} style={{ marginBottom: 18 }}>
              <h3 style={{ margin: "0 0 6px", color: "#E2E8F0", fontSize: 14 }}>
                {section.heading}
              </h3>
              <p style={{ margin: 0, color: "#64748B", fontSize: 13, lineHeight: 1.7 }}>
                {section.body}
              </p>
            </div>
          ))}
          <p style={{ margin: "24px 0 0", color: "#334155", fontSize: 11 }}>
            Last updated June 14, 2026
          </p>
        </div>
      </section>
    </div>
  )
}

export default function Landing() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeFeature, setActiveFeature] = useState(0)
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)
  const legalParam = searchParams.get("legal")
  const legalDocument: LegalDocument | null = legalParam === "privacy" || legalParam === "terms"
    ? legalParam
    : null
  const openLegalDialog = useCallback((document: LegalDocument) => {
    setSearchParams({ legal: document }, { replace: true })
  }, [setSearchParams])
  const closeLegalDialog = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  // Auto-rotate active feature
  useEffect(() => {
    if (legalDocument) return
    const t = setInterval(() => setActiveFeature(i => (i + 1) % FEATURES.length), 3000)
    return () => clearInterval(t)
  }, [legalDocument])

  const f = FEATURES[activeFeature]

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080B14",
      color: "#E2E8F0",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      overflowX: "hidden",
    }}>

      {/* ── NAV ─────────────────────────────────────────────────────── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 clamp(16px, 5vw, 48px)", height: 60,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(8,11,20,0.9)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Code2 size={16} color="#fff" />
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#F8FAFC", letterSpacing: -0.4 }}>
            FlowDesk
          </span>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 99, marginLeft: 2,
            background: "rgba(99,102,241,0.15)", color: "#818CF8",
            border: "1px solid rgba(99,102,241,0.25)", fontWeight: 500,
          }}>beta</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link to="/login" style={{
            color: "#64748B", fontSize: 14, textDecoration: "none",
            padding: "6px 14px", borderRadius: 8, transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#E2E8F0")}
          onMouseLeave={e => (e.currentTarget.style.color = "#64748B")}
          >Login</Link>
          <Link to="/register" style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#6366F1", color: "#fff", fontSize: 14, fontWeight: 600,
            textDecoration: "none", padding: "7px 16px", borderRadius: 8,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#4F46E5")}
          onMouseLeave={e => (e.currentTarget.style.background = "#6366F1")}
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section style={{
        position: "relative", overflow: "hidden",
        padding: "clamp(64px, 10vw, 120px) clamp(16px, 5vw, 48px) clamp(48px, 8vw, 80px)",
        textAlign: "center",
      }}>
        <CodeRain />

        {/* Radial vignette */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 80% 100% at 50% 100%, #080B14 40%, transparent 100%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto" }}>
          {/* Eyebrow */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 99, padding: "5px 14px", marginBottom: 28,
            fontSize: 12, color: "#818CF8", fontWeight: 500,
          }}>
            <Sparkles size={12} />
            One app to replace 10 developer tools
            <ChevronRight size={11} />
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(36px, 7vw, 72px)",
            fontWeight: 700, lineHeight: 1.08,
            letterSpacing: -2, color: "#F8FAFC",
            margin: "0 0 20px",
          }}>
            The Unified
            {" "}<span style={{
              background: "linear-gradient(90deg, #6366F1 0%, #22D3EE 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>Developer</span>
            <br />Workspace
          </h1>

          <p style={{
            fontSize: "clamp(15px, 2.5vw, 19px)", color: "#64748B",
            lineHeight: 1.65, margin: "0 auto 36px",
            maxWidth: 560,
          }}>
            Stop switching between apps. FlowDesk combines code snippets, notes,
            tasks, AI assistance, a focus timer, and code diff into one fast,
            beautiful workspace.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link to="/register" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#6366F1", color: "#fff", fontSize: 15,
              fontWeight: 600, textDecoration: "none",
              padding: "12px 28px", borderRadius: 10,
              boxShadow: "0 0 32px rgba(99,102,241,0.35)",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#4F46E5"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#6366F1"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)" }}
            >
              Start building free <ArrowRight size={15} />
            </Link>
            <Link to="/login" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.05)", color: "#94A3B8",
              border: "1px solid rgba(255,255,255,0.1)",
              fontSize: 15, textDecoration: "none",
              padding: "12px 28px", borderRadius: 10,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#E2E8F0" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "#94A3B8" }}
            >
              Sign in
            </Link>
          </div>

          {/* Trust strip */}
          <div style={{ marginTop: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
            {["No credit card", "Free forever plan", "Open source friendly"].map(t => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#334155" }}>
                <Check size={12} color="#10B981" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ─────────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 0,
      }}>
        {STATS.map((s, i) => (
          <div key={s.label} style={{
            padding: "28px 24px", textAlign: "center",
            borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}>
            <div style={{
              fontSize: "clamp(28px,4vw,40px)", fontWeight: 700,
              color: "#6366F1", fontFamily: "monospace", marginBottom: 4,
            }}>
              {s.value.includes("+") ? (
                <><Counter to={parseInt(s.value)} />+</>
              ) : s.value.includes("%") ? (
                <><Counter to={parseInt(s.value)} />%</>
              ) : (
                <Counter to={parseInt(s.value) || 0} />
              )}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── INTERACTIVE FEATURES ────────────────────────────────────── */}
      <section style={{ padding: "clamp(48px, 8vw, 96px) clamp(16px, 5vw, 48px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Section header */}
          <div style={{ textAlign: "center", marginBottom: "clamp(32px, 5vw, 56px)" }}>
            <div style={{
              fontSize: 11, color: "#6366F1", textTransform: "uppercase",
              letterSpacing: 2, fontWeight: 600, marginBottom: 12,
            }}>Tools</div>
            <h2 style={{
              fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 700,
              color: "#F8FAFC", margin: "0 0 14px", letterSpacing: -1,
            }}>
              Everything you need. Nothing you don't.
            </h2>
            <p style={{ fontSize: 16, color: "#475569", maxWidth: 480, margin: "0 auto" }}>
              Six tools, one workspace, zero context switching.
            </p>
          </div>

          {/* Feature selector + preview */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            alignItems: "start",
          }} className="feature-grid">
            {/* Left: tab list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FEATURES.map((feat, i) => {
                const Icon = feat.icon
                const active = activeFeature === i
                return (
                  <button
                    key={feat.title}
                    onClick={() => setActiveFeature(i)}
                    aria-pressed={active}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 16px", borderRadius: 12, border: "none",
                      background: active ? "rgba(255,255,255,0.05)" : "transparent",
                      cursor: "pointer", textAlign: "left",
                      borderLeft: `3px solid ${active ? feat.color : "transparent"}`,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget.style.background = "rgba(255,255,255,0.03)") }}
                    onMouseLeave={e => { if (!active) (e.currentTarget.style.background = "transparent") }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                      background: active ? `${feat.color}20` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? feat.color + "40" : "rgba(255,255,255,0.07)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s",
                    }}>
                      <Icon size={18} color={active ? feat.color : "#475569"} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: 14, fontWeight: 600,
                        color: active ? "#F8FAFC" : "#64748B",
                        marginBottom: 2,
                      }}>{feat.title}</div>
                      {active && (
                        <div style={{ fontSize: 11, color: "#334155" }}>
                          {feat.bullets.join(" · ")}
                        </div>
                      )}
                    </div>
                    {active && <ChevronRight size={14} color={feat.color} style={{ marginLeft: "auto" }} />}
                  </button>
                )
              })}
            </div>

            {/* Right: feature detail card */}
            <div style={{
              background: "rgba(255,255,255,0.025)",
              border: `1px solid ${f.color}30`,
              borderRadius: 16, padding: "clamp(20px, 3vw, 32px)",
              position: "sticky", top: 80,
              transition: "border-color 0.3s",
            }}>
              {/* Top bar */}
              <div style={{
                background: "#080B14", borderRadius: 8,
                padding: "8px 12px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 6,
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F43F5E" }} />
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
                <span style={{ fontSize: 11, color: "#334155", marginLeft: 6, fontFamily: "monospace" }}>
                  flowdesk — {f.title.toLowerCase()}
                </span>
              </div>

              {/* Feature content */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `${f.color}18`, border: `1px solid ${f.color}35`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <f.icon size={24} color={f.color} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#F8FAFC" }}>{f.title}</div>
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 99,
                    background: `${f.color}18`, color: f.color,
                    border: `1px solid ${f.color}30`,
                  }}>{f.tag}</span>
                </div>
              </div>

              <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.65, margin: "0 0 20px" }}>
                {f.desc}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {f.bullets.map(b => (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      background: `${f.color}18`, border: `1px solid ${f.color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check size={10} color={f.color} />
                    </div>
                    <span style={{ fontSize: 13, color: "#94A3B8" }}>{b}</span>
                  </div>
                ))}
              </div>

              {/* Progress dots */}
              <div style={{ display: "flex", gap: 5, marginTop: 24 }}>
                {FEATURES.map((_, i) => (
                  <button
                    type="button"
                    key={FEATURES[i].title}
                    onClick={() => setActiveFeature(i)}
                    aria-label={`Show ${FEATURES[i].title}`}
                    aria-pressed={activeFeature === i}
                    style={{
                    height: 16, cursor: "pointer", display: "flex", alignItems: "center",
                    flex: activeFeature === i ? 3 : 1,
                    background: "transparent",
                    transition: "flex 0.4s ease", padding: 0, border: 0,
                  }}>
                    <span style={{
                      width: "100%", height: 3, borderRadius: 99,
                      background: activeFeature === i ? f.color : "rgba(255,255,255,0.1)",
                      transition: "background 0.3s",
                    }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ───────────────────────────────────────────── */}
      <section style={{
        padding: "0 clamp(16px, 5vw, 48px) clamp(48px, 8vw, 96px)",
        background: "rgba(255,255,255,0.01)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        paddingTop: "clamp(48px, 8vw, 80px)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}>
            {FEATURES.map((feat, i) => {
              const Icon = feat.icon
              const hovered = hoveredCard === i
              return (
                <Link
                  key={feat.title}
                  to="/register"
                  onMouseEnter={() => setHoveredCard(i)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    textDecoration: "none",
                    display: "block",
                    background: hovered ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.025)",
                    border: `1px solid ${hovered ? feat.color + "50" : "rgba(255,255,255,0.07)"}`,
                    borderRadius: 14, padding: "22px 22px 18px",
                    position: "relative", overflow: "hidden",
                    transition: "all 0.2s",
                    transform: hovered ? "translateY(-2px)" : "translateY(0)",
                  }}
                >
                  {/* Left accent */}
                  <div style={{
                    position: "absolute", left: 0,
                    top: hovered ? "8%" : "20%", bottom: hovered ? "8%" : "20%",
                    width: 3, borderRadius: "0 3px 3px 0",
                    background: feat.color,
                    opacity: hovered ? 1 : 0.3,
                    transition: "all 0.2s",
                  }} />

                  {/* Glow on hover */}
                  {hovered && (
                    <div style={{
                      position: "absolute", top: -40, right: -40,
                      width: 130, height: 130, borderRadius: "50%",
                      background: feat.color, opacity: 0.06, pointerEvents: "none",
                    }} />
                  )}

                  <div style={{
                    width: 42, height: 42, borderRadius: 10, marginBottom: 16,
                    background: `${feat.color}15`, border: `1px solid ${feat.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={20} color={feat.color} />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#F1F5F9" }}>{feat.title}</span>
                    <span style={{
                      fontSize: 9, padding: "2px 6px", borderRadius: 99, fontWeight: 600,
                      background: "#052E16", color: "#4ADE80", border: "1px solid #166534",
                    }}>live</span>
                  </div>

                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: "0 0 14px" }}>
                    {feat.desc}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, color: feat.color, fontFamily: "monospace", opacity: 0.7 }}>
                      Open {feat.title.toLowerCase()}
                    </span>
                    <ArrowRight size={11} color={feat.color} style={{ opacity: hovered ? 1 : 0.4, transform: hovered ? "translateX(3px)" : "translateX(0)", transition: "all 0.2s" }} />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────── */}
      <section style={{
        padding: "clamp(48px, 8vw, 96px) clamp(16px, 5vw, 48px)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 12 }}>
              {[...Array(5)].map((_, i) => <Star key={i} size={16} color="#F59E0B" fill="#F59E0B" />)}
            </div>
            <h2 style={{ fontSize: "clamp(22px, 3.5vw, 34px)", fontWeight: 700, color: "#F8FAFC", margin: 0, letterSpacing: -0.8 }}>
              Developers actually love it
            </h2>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "22px 24px",
              }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 14 }}>
                  {[...Array(5)].map((_, j) => <Star key={j} size={12} color="#F59E0B" fill="#F59E0B" />)}
                </div>
                <p style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.65, margin: "0 0 16px", fontStyle: "italic" }}>
                  "{t.text}"
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366F1, #22D3EE)",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: "#475569" }}>{t.author}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "clamp(48px, 8vw, 96px) clamp(16px, 5vw, 48px)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            background: "rgba(99,102,241,0.07)",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 20, padding: "clamp(32px, 5vw, 56px)",
            textAlign: "center", position: "relative", overflow: "hidden",
          }}>
            {/* Subtle glow */}
            <div style={{
              position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
              width: 300, height: 200, borderRadius: "50%",
              background: "rgba(99,102,241,0.12)", pointerEvents: "none", filter: "blur(40px)",
            }} />

            <div style={{ position: "relative" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, color: "#818CF8", fontWeight: 600,
                background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
                borderRadius: 99, padding: "4px 12px", marginBottom: 18,
              }}>
                <Zap size={11} /> Built for developers, by developers
              </div>

              <h2 style={{
                fontSize: "clamp(24px, 4vw, 38px)", fontWeight: 700,
                color: "#F8FAFC", margin: "0 0 12px", letterSpacing: -1,
              }}>
                Ready to own your workflow?
              </h2>
              <p style={{ fontSize: 15, color: "#475569", margin: "0 0 32px" }}>
                Free forever. No credit card. Upgrade when you're ready.
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                <Link to="/register" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "#6366F1", color: "#fff",
                  fontSize: 15, fontWeight: 600, textDecoration: "none",
                  padding: "12px 28px", borderRadius: 10,
                  boxShadow: "0 0 40px rgba(99,102,241,0.4)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#4F46E5"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#6366F1"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)" }}
                >
                  Get started free <ArrowRight size={15} />
                </Link>
                <Link to="/login" style={{
                  color: "#64748B", fontSize: 14, textDecoration: "none",
                  display: "flex", alignItems: "center", gap: 5,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "#94A3B8")}
                onMouseLeave={e => (e.currentTarget.style.color = "#64748B")}
                >
                  Already have an account <ChevronRight size={13} />
                </Link>
              </div>

              {/* Bottom trust row */}
              <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
                {[
                  { icon: <Shield size={12} />, text: "No credit card" },
                  { icon: <Globe size={12} />, text: "Open source" },
                  { icon: <Zap size={12} />, text: "Instant setup" },
                ].map(item => (
                  <span key={item.text} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#334155" }}>
                    <span style={{ color: "#6366F1" }}>{item.icon}</span>
                    {item.text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "24px clamp(16px, 5vw, 48px)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Code2 size={12} color="#fff" />
          </div>
          <span style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>FlowDesk</span>
        </div>
        <p style={{ fontSize: 12, color: "#1E293B", margin: 0 }}>
          Built with purpose by developers, for developers.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="button"
            onClick={() => openLegalDialog("privacy")}
            style={{ fontSize: 12, color: "#334155", background: "none", border: 0, padding: 0, cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#64748B")}
            onMouseLeave={e => (e.currentTarget.style.color = "#334155")}
          >
            Privacy
          </button>
          <button
            type="button"
            onClick={() => openLegalDialog("terms")}
            style={{ fontSize: 12, color: "#334155", background: "none", border: 0, padding: 0, cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#64748B")}
            onMouseLeave={e => (e.currentTarget.style.color = "#334155")}
          >
            Terms
          </button>
          <a
            href="https://github.com/Sheryar-Ahmad/FlowDesk"
            target="_blank"
            rel="noreferrer"
            aria-label="Open FlowDesk on GitHub in a new tab"
            style={{ fontSize: 12, color: "#334155", textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#64748B")}
            onMouseLeave={e => (e.currentTarget.style.color = "#334155")}
          >
            GitHub
          </a>
        </div>
      </footer>

      {legalDocument && (
        <LegalDialog document={legalDocument} onClose={closeLegalDialog} />
      )}

      <style>{`
        @media (max-width: 700px) {
          .feature-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
