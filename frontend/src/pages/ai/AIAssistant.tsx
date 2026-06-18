import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft, Send, Copy, Check, Loader2,
  Code, FileText, Zap, Shield, RefreshCw,
  Sparkles, Brain, Lightbulb,
  Search, AlertCircle, TrendingUp, Plus, Clock,
  MessageSquare, PanelLeftOpen, PanelLeftClose,
  Download, Pin, Star, BookOpen,
  Hash, Mic, MicOff, Volume2,
  BarChart2, X, Share2,
  Trash2, Settings, ChevronDown, ChevronUp,
  Maximize2, Minimize2, GitBranch, Layers,
  SortAsc, Cpu, Globe, Archive, Tag,
  Keyboard, Pencil,
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import { DeleteButton } from "../../components/DeleteButton"
import api from "../../services/api/client"
import axios from "axios"
import toast from "react-hot-toast"


interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  tokens?: number
  intent?: string
  pinned?: boolean
  bookmarked?: boolean
  reaction?: "👍" | "👎" | "❤️" | "🔥" | "💡" | null
  edited?: boolean
  collapsed?: boolean
  tag?: string
  readAt?: number
}

interface SessionMessage { role: Message["role"]; content: string }

interface Session {
  id: string
  title: string
  message_count: number
  tokens_used: number
  updated_at: string
  model: string
}

interface Snippet {
  id: string
  title: string
  code: string
  lang: string
  ts: string
  tags: string[]
}

interface PromptHistory {
  text: string
  ts: string
  used: number
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance
type SpeechRecognitionWindow = typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

interface ChatResponse {
  response: string
  tokens_used?: number
  intent?: string
  session_id: string
  session_title?: string
  messages_remaining?: number | string
}


const THEMES = {
  dark: {
    bg: "#070B12", surface: "#0C1018", surface2: "#111827", surface3: "#162032",
    border: "rgba(255,255,255,0.06)", border2: "rgba(255,255,255,0.11)",
    text: "#E2E8F0", muted: "#64748B", faint: "#1E293B",
    indigo: "#6366F1", violet: "#8B5CF6", emerald: "#10B981",
    amber: "#F59E0B", rose: "#F43F5E", cyan: "#22D3EE", orange: "#F97316",
    userBubble: "linear-gradient(135deg,#6366F1,#5855EB)",
    aiBubble: "#0C1018",
  },
  midnight: {
    bg: "#000000", surface: "#080808", surface2: "#101010", surface3: "#181818",
    border: "rgba(255,255,255,0.05)", border2: "rgba(255,255,255,0.09)",
    text: "#D1D5DB", muted: "#6B7280", faint: "#111111",
    indigo: "#818CF8", violet: "#A78BFA", emerald: "#34D399",
    amber: "#FCD34D", rose: "#FB7185", cyan: "#67E8F9", orange: "#FB923C",
    userBubble: "linear-gradient(135deg,#818CF8,#6366F1)",
    aiBubble: "#0A0A0A",
  },
  slate: {
    bg: "#0F172A", surface: "#1E293B", surface2: "#273549", surface3: "#2E3F57",
    border: "rgba(148,163,184,0.1)", border2: "rgba(148,163,184,0.18)",
    text: "#F1F5F9", muted: "#94A3B8", faint: "#1E293B",
    indigo: "#6366F1", violet: "#8B5CF6", emerald: "#10B981",
    amber: "#F59E0B", rose: "#F43F5E", cyan: "#22D3EE", orange: "#F97316",
    userBubble: "linear-gradient(135deg,#6366F1,#4F46E5)",
    aiBubble: "#1E293B",
  },
}
type ThemeName = keyof typeof THEMES


const QUICK_ACTIONS = [
  { icon: Code,        label: "Explain",    prompt: "Explain this code in detail:\n\n",           color: "#60A5FA" },
  { icon: Zap,         label: "Fix Bug",    prompt: "Find and fix ALL bugs:\n\n",                 color: "#FBBF24" },
  { icon: Shield,      label: "Security",   prompt: "Security audit this code:\n\n",              color: "#F87171" },
  { icon: TrendingUp,  label: "Optimize",   prompt: "Optimize for performance:\n\n",              color: "#34D399" },
  { icon: Code,        label: "Tests",      prompt: "Write comprehensive tests:\n\n",             color: "#A78BFA" },
  { icon: FileText,    label: "Document",   prompt: "Add documentation:\n\n",                     color: "#22D3EE" },
  { icon: RefreshCw,   label: "Refactor",   prompt: "Refactor following best practices:\n\n",     color: "#FB923C" },
  { icon: Lightbulb,   label: "Improve",    prompt: "Suggest a better approach:\n\n",             color: "#F472B6" },
  { icon: Search,      label: "Review",     prompt: "Senior developer code review:\n\n",          color: "#818CF8" },
  { icon: Sparkles,    label: "Generate",   prompt: "Generate production-ready code for:\n\n",    color: "#10B981" },
  { icon: BookOpen,    label: "Explain Concept", prompt: "Explain this concept simply:\n\n",      color: "#F59E0B" },
  { icon: Hash,        label: "Regex",      prompt: "Write a regex pattern for:\n\n",             color: "#EC4899" },
  { icon: GitBranch,   label: "Git",        prompt: "Help me with this git situation:\n\n",       color: "#34D399" },
  { icon: Globe,       label: "API Design", prompt: "Design a REST API for:\n\n",                 color: "#38BDF8" },
  { icon: Cpu,         label: "Algorithm",  prompt: "Find the optimal algorithm for:\n\n",        color: "#A78BFA" },
  { icon: Layers,      label: "Architecture", prompt: "Suggest an architecture for:\n\n",         color: "#FB923C" },
]

const PROMPT_TEMPLATES = [
  { label: "API Design",     prompt: "Design a RESTful API for a ",         cat: "backend"   },
  { label: "DB Schema",      prompt: "Design a database schema for:\n\n",   cat: "backend"   },
  { label: "Architecture",   prompt: "Suggest an architecture for:\n\n",    cat: "system"    },
  { label: "Code Review",    prompt: "Do a thorough code review of:\n\n",   cat: "review"    },
  { label: "Error Debug",    prompt: "Help me debug this error:\n\n",        cat: "debug"     },
  { label: "Git Message",    prompt: "Write a conventional git commit for: ", cat: "git"      },
  { label: "SQL Query",      prompt: "Write an optimized SQL query to:\n\n", cat: "backend"  },
  { label: "React Component", prompt: "Build a React component for:\n\n",   cat: "frontend"  },
  { label: "Performance",    prompt: "Profile and fix performance issues:\n\n", cat: "optimize" },
  { label: "Docker",         prompt: "Write a Dockerfile for:\n\n",          cat: "devops"   },
  { label: "CI/CD",          prompt: "Set up CI/CD pipeline for:\n\n",       cat: "devops"   },
  { label: "Test Suite",     prompt: "Write a complete test suite for:\n\n", cat: "testing"  },
  { label: "Security Audit", prompt: "Perform a security audit of:\n\n",    cat: "security"  },
  { label: "System Design",  prompt: "Design the system for:\n\n",           cat: "system"   },
  { label: "Code Translate", prompt: "Translate this code to another language:\n\n", cat: "translate" },
  { label: "Pseudocode",     prompt: "Write pseudocode for:\n\n",            cat: "algorithm" },
]

const INTENT_COLORS: Record<string, { text: string; bg: string }> = {
  explain:  { text: "#60A5FA", bg: "rgba(96,165,250,0.1)"  },
  fix:      { text: "#FBBF24", bg: "rgba(251,191,36,0.1)"  },
  security: { text: "#F87171", bg: "rgba(248,113,113,0.1)" },
  optimize: { text: "#34D399", bg: "rgba(52,211,153,0.1)"  },
  generate: { text: "#10B981", bg: "rgba(16,185,129,0.1)"  },
  review:   { text: "#818CF8", bg: "rgba(129,140,248,0.1)" },
  general:  { text: "#94A3B8", bg: "rgba(148,163,184,0.1)" },
}

const REACTIONS = ["👍", "👎", "❤️", "🔥", "💡"] as const

const MSG_TAGS = ["Important", "TODO", "Question", "Follow-up", "Reference", "Bug", "Feature"]
const TAG_COLORS: Record<string, string> = {
  Important: "#F43F5E", TODO: "#F59E0B", Question: "#6366F1",
  "Follow-up": "#22D3EE", Reference: "#10B981", Bug: "#F87171", Feature: "#A78BFA",
}

const THINKING_TIPS = [
  "Analyzing your request...",
  "Consulting best practices...",
  "Crafting the optimal solution...",
  "Reviewing edge cases...",
  "Almost ready...",
]


const LS = {
  get: (k: string, def: unknown = null) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? def } catch { return def } },
  set: (k: string, v: unknown) => {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      // Storage may be unavailable in private or restricted browser contexts.
    }
  },
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function hashString(value: string) {
  let hash = 0
  for (const char of value) {
    hash = Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)
  }
  return Math.abs(hash).toString(36)
}

function createKeyFactory(scope: string) {
  const seen = new Map<string, number>()
  return (value: string) => {
    const base = `${scope}-${hashString(value)}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

const CODE_FENCE_SPLIT_PATTERN = /(```[\s\S]*?```)/g
const FIRST_CODE_BLOCK_PATTERN = /```(\w*)\n([\s\S]*?)```/
const ORDERED_LIST_PATTERN = /^\d+\./
const ORDERED_LIST_NUMBER_PATTERN = /^\d+/

function countCodeFences(value: string) {
  const fencePattern = /```/g
  let count = 0
  while (fencePattern.exec(value)) count += 1
  return count
}

function getStoredTheme(): ThemeName {
  const value = LS.get("fd_ai_theme", "dark")
  return typeof value === "string" && Object.hasOwn(THEMES, value)
    ? value as ThemeName
    : "dark"
}

function getStoredFontSize() {
  const value = LS.get("fd_ai_fontsize", 14)
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(18, Math.max(12, value))
    : 14
}

function getStoredArray<T>(key: string): T[] {
  const value = LS.get(key, [])
  return Array.isArray(value) ? value as T[] : []
}

function getStoredBoolean(key: string, fallback: boolean) {
  const value = LS.get(key, fallback)
  return typeof value === "boolean" ? value : fallback
}


function MessageContent({ content, fontSize, C: T }: Readonly<{ content: string; fontSize: number; C: typeof THEMES.dark }>) {
  const parts = content.split(CODE_FENCE_SPLIT_PATTERN)
  const keyForPart = createKeyFactory("message-part")
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {parts.map(part => {
        const partKey = keyForPart(part)
        if (part.startsWith("```")) {
          const lines = part.split("\n")
          const lang = lines[0].replace("```", "").trim() || "code"
          const code = lines.slice(1, -1).join("\n")
          const lineCount = code.split("\n").length
          return (
            <div key={partKey} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border2}`, margin: "4px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["#EF4444","#F59E0B","#10B981"].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.75 }} />)}
                  </div>
                  <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace", fontWeight: 600 }}>{lang}</span>
                  <span style={{ fontSize: 10, color: T.faint === "#1E293B" ? "#334155" : "#222", background: T.surface3, padding: "1px 6px", borderRadius: 4 }}>{lineCount} lines</span>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {[
                    { label: "Copy", icon: <Copy size={9} />, action: () => { navigator.clipboard.writeText(code); toast.success("Copied!") } },
                    { label: "Save", icon: <Download size={9} />, action: () => {
                      const blob = new Blob([code], { type: "text/plain" })
                      const url = URL.createObjectURL(blob)
                      const extension = lang.replace(/[^\w.-]/g, "") || "txt"
                      const a = document.createElement("a"); a.href = url; a.download = `snippet.${extension}`; a.click()
                      URL.revokeObjectURL(url); toast.success("Saved!")
                    }},
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.action} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: T.muted, background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`, borderRadius: 5, padding: "3px 7px", cursor: "pointer" }}>
                      {btn.icon}{btn.label}
                    </button>
                  ))}
                </div>
              </div>
              <pre style={{ padding: "14px 16px", background: "#050810", overflowX: "auto", margin: 0, fontSize: 13, lineHeight: 1.65, maxHeight: 420, overflowY: "auto" }}>
                <code style={{ color: "#86EFAC", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>{code}</code>
              </pre>
            </div>
          )
        }
        const keyForLine = createKeyFactory(`message-line-${partKey}`)
        return (
          <div key={partKey} style={{ fontSize, color: "#CBD5E1", lineHeight: 1.78 }}>
            {part.split("\n").map(line => {
              const lineKey = keyForLine(line)
              const safeLine = escapeHtml(line)
              const b = safeLine.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#F8FAFC;font-weight:600">$1</strong>')
              const it = b.replace(/\*(.*?)\*/g, '<em style="color:#CBD5E1">$1</em>')
              const c = it.replace(/`([^`]+)`/g, '<code style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.2);border-radius:4px;padding:1px 6px;font-family:monospace;font-size:12px;color:#A5B4FC">$1</code>')
              const lk = c.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#60A5FA;text-decoration:underline">$1</a>')
              if (line.startsWith("# "))   return <h1 key={lineKey} style={{ fontSize: fontSize + 4, fontWeight: 700, color: "#F8FAFC", margin: "12px 0 5px" }}>{line.slice(2)}</h1>
              if (line.startsWith("## "))  return <h2 key={lineKey} style={{ fontSize: fontSize + 2, fontWeight: 600, color: "#F1F5F9", margin: "9px 0 3px" }}>{line.slice(3)}</h2>
              if (line.startsWith("### ")) return <h3 key={lineKey} style={{ fontSize: fontSize + 1, fontWeight: 600, color: "#A5B4FC", margin: "7px 0 3px" }}>{line.slice(4)}</h3>
              if (line.startsWith("> "))   return <blockquote key={lineKey} style={{ borderLeft: `3px solid ${T.indigo}`, paddingLeft: 12, margin: "4px 0", color: T.muted, fontStyle: "italic" }} dangerouslySetInnerHTML={{ __html: lk.slice(2) }} />
              if (line.startsWith("- ") || line.startsWith("• ")) return (
                <div key={lineKey} style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "2px 0" }}>
                  <span style={{ color: T.indigo, marginTop: 4, flexShrink: 0 }}>•</span>
                  <span dangerouslySetInnerHTML={{ __html: lk.slice(2) }} />
                </div>
              )
              if (ORDERED_LIST_PATTERN.test(line)) return (
                <div key={lineKey} style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "2px 0" }}>
                  <span style={{ color: T.indigo, fontFamily: "monospace", fontSize: 11, marginTop: 4, flexShrink: 0 }}>{ORDERED_LIST_NUMBER_PATTERN.exec(line)?.[0]}.</span>
                  <span dangerouslySetInnerHTML={{ __html: lk.replace(/^\d+\.\s*/, "") }} />
                </div>
              )
              if (line === "") return <div key={lineKey} style={{ height: 6 }} />
              return <p key={lineKey} style={{ margin: "2px 0" }} dangerouslySetInnerHTML={{ __html: lk }} />
            })}
          </div>
        )
      })}
    </div>
  )
}


function ThinkingDots({ C: T }: Readonly<{ C: typeof THEMES.dark }>) {
  const [elapsed, setElapsed] = useState(0)
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const t1 = setInterval(() => setElapsed(e => e + 1), 1000)
    const t2 = setInterval(() => setTip(t => (t + 1) % THINKING_TIPS.length), 3000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Brain size={16} color="#fff" style={{ animation: "spin 3s linear infinite" }} />
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "14px 14px 14px 4px", padding: "12px 16px", maxWidth: 260 }}>
        <div style={{ fontSize: 11, color: T.indigo, marginBottom: 8, fontWeight: 600 }}>
          {THINKING_TIPS[tip]} {elapsed > 2 ? `(${elapsed}s)` : ""}
        </div>
        <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
          {[0, 180, 360].map(d => (
            <div key={d} style={{ width: 8, height: 8, background: T.indigo, borderRadius: "50%", animation: "bounce 1.2s infinite", animationDelay: `${d}ms` }} />
          ))}
        </div>
        {elapsed > 5 && <div style={{ fontSize: 10, color: T.muted }}>Complex request — taking a bit longer…</div>}
      </div>
    </div>
  )
}


function StatsModal({ messages, sessions, usage, onClose, C: T }: Readonly<{
  messages: Message[]; sessions: Session[]
  usage: { used_today: number; remaining: number | string; limit: number | string }
  onClose: () => void; C: typeof THEMES.dark
}>) {
  const aiMsgs = messages.filter(m => m.role === "assistant")
  const userMsgs = messages.filter(m => m.role === "user")
  const totalWords = aiMsgs.reduce((a, m) => a + m.content.split(/\s+/).length, 0)
  const totalTokens = messages.reduce((a, m) => a + (m.tokens || 0), 0)
  const codeBlocks = Math.round(aiMsgs.reduce((a, m) => a + countCodeFences(m.content) / 2, 0))
  const avgLen = aiMsgs.length > 0 ? Math.round(totalWords / aiMsgs.length) : 0
  const reactions = messages.filter(m => m.reaction).length
  const pinned = messages.filter(m => m.pinned).length
  const bookmarked = messages.filter(m => m.bookmarked).length
  const sessionTokens = sessions.reduce((a, s) => a + (s.tokens_used || 0), 0)

  const stats = [
    { label: "Total Messages", value: messages.length, color: T.indigo },
    { label: "AI Replies", value: aiMsgs.length, color: T.violet },
    { label: "Your Messages", value: userMsgs.length, color: T.cyan },
    { label: "Total Tokens", value: totalTokens.toLocaleString(), color: T.emerald },
    { label: "Code Blocks", value: codeBlocks, color: "#34D399" },
    { label: "Words Generated", value: totalWords.toLocaleString(), color: T.amber },
    { label: "Avg Words/Reply", value: avgLen, color: "#F472B6" },
    { label: "Sessions", value: sessions.length, color: T.muted },
    { label: "All-time Tokens", value: sessionTokens.toLocaleString(), color: T.orange },
    { label: "Used Today", value: usage.used_today, color: T.rose },
    { label: "Reactions", value: reactions, color: T.amber },
    { label: "Pinned/Saved", value: pinned + bookmarked, color: "#FB923C" },
  ]

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: T.surface, borderRadius: 16, width: "100%", maxWidth: 480, border: `1px solid ${T.border}`, overflow: "hidden", maxHeight: "90dvh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 size={15} color={T.indigo} />Conversation Stats
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {stats.map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px", border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {aiMsgs.some(m => m.intent) && (
            <div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Intent Breakdown</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {Object.keys(INTENT_COLORS).map(intent => {
                  const count = aiMsgs.filter(m => m.intent === intent).length
                  if (count === 0) return null
                  const ic = INTENT_COLORS[intent]
                  return (
                    <span key={intent} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99, background: ic.bg, color: ic.text, fontWeight: 600 }}>
                      {intent} ({count})
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


function SnippetVault({ snippets, onDelete, onCopy, onClose, C: T }: Readonly<{
  snippets: Snippet[]; onDelete: (id: string) => void
  onCopy: (code: string) => void; onClose: () => void
  C: typeof THEMES.dark
}>) {
  const [q, setQ] = useState("")
  const filtered = snippets.filter(s => s.title.toLowerCase().includes(q.toLowerCase()) || s.lang.toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: T.surface, borderRadius: 16, width: "100%", maxWidth: 560, border: `1px solid ${T.border}`, overflow: "hidden", maxHeight: "85dvh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center" }}>
          <Archive size={15} color={T.indigo} />
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text, flex: 1 }}>Snippet Vault ({snippets.length})</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search snippets…"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 12px", color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: T.muted, fontSize: 13 }}>
              {snippets.length === 0 ? "No saved snippets yet. Save code blocks from AI responses!" : "No results"}
            </div>
          ) : filtered.map(s => (
            <div key={s.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1 }}>{s.title}</span>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(99,102,241,0.12)", color: T.indigo, fontFamily: "monospace" }}>{s.lang}</span>
                <span style={{ fontSize: 10, color: T.muted }}>{new Date(s.ts).toLocaleDateString()}</span>
                <button onClick={() => onCopy(s.code)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><Copy size={12} /></button>
                <button onClick={() => onDelete(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><Trash2 size={12} /></button>
              </div>
              <pre style={{ margin: 0, padding: "10px 12px", fontSize: 12, color: "#86EFAC", fontFamily: "monospace", overflowX: "auto", maxHeight: 120, background: "#050810" }}>
                {s.code.slice(0, 200)}{s.code.length > 200 ? "\n…" : ""}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


function SettingsPanel({ themeName, fontSize, setTheme, setFontSize, onClose, C: T, compactMode, setCompactMode, soundEnabled, setSoundEnabled, autoScroll, setAutoScroll, showTimestamps, setShowTimestamps }: Readonly<{
  themeName: ThemeName; fontSize: number
  setTheme: (t: ThemeName) => void; setFontSize: (n: number) => void
  onClose: () => void; C: typeof THEMES.dark
  compactMode: boolean; setCompactMode: (v: boolean) => void
  soundEnabled: boolean; setSoundEnabled: (v: boolean) => void
  autoScroll: boolean; setAutoScroll: (v: boolean) => void
  showTimestamps: boolean; setShowTimestamps: (v: boolean) => void
}>) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: T.surface, borderRadius: 16, width: "100%", maxWidth: 420, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 8 }}><Settings size={15} color={T.indigo} />Settings</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>

          <div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Theme</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(Object.keys(THEMES) as ThemeName[]).map(t => (
                <button key={t} onClick={() => setTheme(t)} style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: `2px solid ${themeName === t ? T.indigo : T.border}`,
                  background: THEMES[t].bg, cursor: "pointer", fontSize: 12, color: THEMES[t].text, fontWeight: 600, transition: "all 0.15s",
                }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Font Size ({fontSize}px)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: T.muted }}>Aa</span>
              <input type="range" min={12} max={18} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
                style={{ flex: 1, accentColor: T.indigo }} />
              <span style={{ fontSize: 15, color: T.muted }}>Aa</span>
            </div>
          </div>

          {[
            { label: "Compact Mode", value: compactMode, set: setCompactMode, desc: "Tighter message spacing" },
            { label: "Sound Effects", value: soundEnabled, set: setSoundEnabled, desc: "Notification sounds" },
            { label: "Auto Scroll", value: autoScroll, set: setAutoScroll, desc: "Scroll to new messages" },
            { label: "Show Timestamps", value: showTimestamps, set: setShowTimestamps, desc: "Time on each message" },
          ].map(opt => (
            <div key={opt.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{opt.desc}</div>
              </div>
              <button onClick={() => opt.set(!opt.value)} style={{
                width: 42, height: 24, borderRadius: 99, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s",
                background: opt.value ? T.indigo : T.faint,
              }}>
                <div style={{ position: "absolute", top: 3, left: opt.value ? 20 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


function ShortcutsModal({ onClose, C: T }: Readonly<{ onClose: () => void; C: typeof THEMES.dark }>) {
  const shortcuts = [
    ["Enter", "Send message"],
    ["Shift+Enter", "New line"],
    ["Ctrl+K", "Focus input"],
    ["Ctrl+N", "New chat"],
    ["Ctrl+/", "Keyboard shortcuts"],
    ["Ctrl+B", "Toggle sidebar"],
    ["Ctrl+E", "Export chat"],
    ["Ctrl+F", "Search messages"],
    ["Esc", "Close panels"],
  ]
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: T.surface, borderRadius: 16, width: "100%", maxWidth: 360, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 8 }}><Keyboard size={15} color={T.indigo} />Keyboard Shortcuts</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding: 16 }}>
          {shortcuts.map(([k, l]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>{l}</span>
              <kbd style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "rgba(255,255,255,0.06)", color: T.indigo, border: `1px solid ${T.border}`, fontFamily: "monospace" }}>{k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


function TagPicker({ current, onSelect, onClose, C: T }: Readonly<{ current?: string; onSelect: (t: string | undefined) => void; onClose: () => void; C: typeof THEMES.dark }>) {
  return (
    <div style={{ position: "absolute", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", top: "100%", right: 0, marginTop: 4, minWidth: 160 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <button onClick={() => { onSelect(undefined); onClose() }} style={{ textAlign: "left", padding: "5px 8px", borderRadius: 6, background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 12 }}>None</button>
        {MSG_TAGS.map(t => (
          <button key={t} onClick={() => { onSelect(t); onClose() }} style={{
            textAlign: "left", padding: "5px 8px", borderRadius: 6, background: current === t ? "rgba(255,255,255,0.05)" : "none",
            border: "none", cursor: "pointer", fontSize: 12, color: TAG_COLORS[t] || T.muted, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: TAG_COLORS[t] || T.muted }} />{t}
          </button>
        ))}
      </div>
    </div>
  )
}


export default function AIAssistant() {
  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const sessionLoadRef = useRef<AbortController | null>(null)
  const chatRequestRef = useRef<AbortController | null>(null)
  const sendingRef = useRef(false)


  const [messages, setMessages]                   = useState<Message[]>([])
  const [sessions, setSessions]                   = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId]   = useState<string | null>(null)
  const [input, setInput]                         = useState("")
  const [loading, setLoading]                     = useState(false)
  const [usage, setUsage]                         = useState({ used_today: 0, remaining: 20 as number | string, limit: 20 as number | string })
  const [copiedId, setCopiedId]                   = useState<string | null>(null)
  const [showSidebar, setShowSidebar]             = useState(false)
  const [loadingSession, setLoadingSession]       = useState(false)


  const [themeName, setThemeName]                 = useState<ThemeName>(getStoredTheme)
  const [fontSize, setFontSize]                   = useState<number>(getStoredFontSize)
  const [compactMode, setCompactMode]             = useState<boolean>(() => getStoredBoolean("fd_ai_compact", false))
  const [soundEnabled, setSoundEnabled]           = useState<boolean>(() => getStoredBoolean("fd_ai_sound", true))
  const [autoScroll, setAutoScroll]               = useState<boolean>(() => getStoredBoolean("fd_ai_autoscroll", true))
  const [showTimestamps, setShowTimestamps]       = useState<boolean>(() => getStoredBoolean("fd_ai_timestamps", true))
  const [fullscreen, setFullscreen]               = useState(false)


  const [showStats, setShowStats]                 = useState(false)
  const [showSettings, setShowSettings]           = useState(false)
  const [showShortcuts, setShowShortcuts]         = useState(false)
  const [showTemplates, setShowTemplates]         = useState(false)
  const [showSnippets, setShowSnippets]           = useState(false)
  const [showSearch, setShowSearch]               = useState(false)
  const [showPromptHistory, setShowPromptHistory] = useState(false)


  const [searchQuery, setSearchQuery]             = useState("")
  const [sessionSearch, setSessionSearch]         = useState("")
  const [activeTagFilter, setActiveTagFilter]     = useState<string | null>(null)
  const [sidebarView, setSidebarView]             = useState<"history"|"pinned"|"bookmarks">("history")
  const [sortOrder, setSortOrder]                 = useState<"newest"|"oldest">("newest")


  const [pinnedMsgIds, setPinnedMsgIds]           = useState<string[]>([])
  const [bookmarkedMsgIds, setBookmarkedMsgIds]   = useState<string[]>(() => getStoredArray<string>("fd_ai_bookmarks"))
  const [editingMsgId, setEditingMsgId]           = useState<string | null>(null)
  const [editingText, setEditingText]             = useState("")
  const [editingSessionId, setEditingSessionId]   = useState<string | null>(null)
  const [sessionTitleDraft, setSessionTitleDraft] = useState("")
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds]           = useState<Set<string>>(new Set())
  const [tagPickerFor, setTagPickerFor]           = useState<string | null>(null)
  const [msgTags, setMsgTags]                     = useState<Record<string, string>>({})


  const [charCount, setCharCount]                 = useState(0)
  const [isListening, setIsListening]             = useState(false)
  const [isDragOver, setIsDragOver]               = useState(false)
  const [promptHistory, setPromptHistory]         = useState<PromptHistory[]>(() => getStoredArray<PromptHistory>("fd_ai_prompts"))


  const [snippets, setSnippets]                   = useState<Snippet[]>(() => getStoredArray<Snippet>("fd_ai_snippets"))


  useEffect(() => { LS.set("fd_ai_theme", themeName) }, [themeName])
  useEffect(() => { LS.set("fd_ai_fontsize", fontSize) }, [fontSize])
  useEffect(() => { LS.set("fd_ai_compact", compactMode) }, [compactMode])
  useEffect(() => { LS.set("fd_ai_sound", soundEnabled) }, [soundEnabled])
  useEffect(() => { LS.set("fd_ai_autoscroll", autoScroll) }, [autoScroll])
  useEffect(() => { LS.set("fd_ai_timestamps", showTimestamps) }, [showTimestamps])
  useEffect(() => { LS.set("fd_ai_bookmarks", bookmarkedMsgIds) }, [bookmarkedMsgIds])
  useEffect(() => { LS.set("fd_ai_snippets", snippets) }, [snippets])
  useEffect(() => { LS.set("fd_ai_prompts", promptHistory) }, [promptHistory])

  const T = THEMES[themeName]

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])
  useEffect(() => {
    if (autoScroll) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, autoScroll])


  const playPing = useCallback(() => {
    if (!soundEnabled) return
    try {
      const AudioContextApi = globalThis.AudioContext
        ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextApi) return
      const ctx = new AudioContextApi()
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880; gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.onended = () => { void ctx.close() }
      osc.start(); osc.stop(ctx.currentTime + 0.3)
    } catch (error) {
      console.debug("Unable to play AI response sound", error)
    }
  }, [soundEnabled])

  const loadUsage = useCallback(async () => {
    try {
      const { data } = await api.get("/ai/usage")
      setUsage(data)
    } catch (error) {
      console.error("Failed to load AI usage", error)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get<{ sessions?: Session[] }>("/ai/sessions")
      const nextSessions = Array.isArray(data.sessions)
        ? data.sessions.filter(session =>
            session
            && typeof session.id === "string"
            && typeof session.title === "string"
            && typeof session.updated_at === "string")
        : []
      setSessions(nextSessions)
    } catch (error) {
      console.error("Failed to load AI sessions", error)
    }
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    sessionLoadRef.current?.abort()
    chatRequestRef.current?.abort()
    sendingRef.current = false
    setLoading(false)
    const controller = new AbortController()
    sessionLoadRef.current = controller
    setLoadingSession(true)
    try {
      const { data } = await api.get<{
        session: { title: string; messages: SessionMessage[]; created_at: string }
      }>(`/ai/sessions/${sessionId}`, { signal: controller.signal })
      const msgs: Message[] = (data.session.messages || [])
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => typeof message.content === "string" && message.content.trim())
        .map(({ message, index }) => ({
          id: `${sessionId}-${index}`,
          role: message.role,
          content: message.content.trim(),
          timestamp: new Date(data.session.created_at),
        }))
      setMessages(msgs)
      setCurrentSessionId(sessionId)
      const storedPins = LS.get(`fd_pins_${sessionId}`, [])
      setPinnedMsgIds(Array.isArray(storedPins) ? storedPins as string[] : [])
      setEditingSessionId(null)
      if (globalThis.innerWidth < 768) setShowSidebar(false)
    } catch (error) {
      if (!axios.isCancel(error) && !controller.signal.aborted) {
        toast.error("Failed to load session")
      }
    } finally {
      if (sessionLoadRef.current === controller) {
        sessionLoadRef.current = null
        setLoadingSession(false)
      }
    }
  }, [])

  const startNewChat = useCallback(() => {
    sessionLoadRef.current?.abort()
    chatRequestRef.current?.abort()
    sendingRef.current = false
    setLoading(false)
    setLoadingSession(false)
    setMessages([]); setCurrentSessionId(null); setInput(""); setPinnedMsgIds([])
    setSearchQuery(""); setShowSearch(false); setActiveTagFilter(null)
    setEditingSessionId(null); setSessionTitleDraft("")
    if (globalThis.innerWidth < 768) setShowSidebar(false)
    inputRef.current?.focus()
  }, [])

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.delete(`/ai/sessions/${sessionId}`)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (currentSessionId === sessionId) startNewChat()
      toast.success("Session deleted")
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null
      toast.error(typeof detail === "string" ? detail : "Failed to delete session")
    }
  }

  const beginRenameSession = (session: Session, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingSessionId(session.id)
    setSessionTitleDraft(session.title)
  }

  const renameSession = async (sessionId: string) => {
    const title = sessionTitleDraft.replace(/\s+/g, " ").trim()
    if (!title) {
      toast.error("Session name cannot be empty")
      return
    }
    if (title.length > 120) {
      toast.error("Session name must be 120 characters or less")
      return
    }

    setRenamingSessionId(sessionId)
    try {
      const { data } = await api.patch<{ session: { title: string; updated_at: string } }>(
        `/ai/sessions/${sessionId}`,
        { title },
      )
      setSessions(prev => prev.map(session => session.id === sessionId
        ? { ...session, title: data.session.title, updated_at: data.session.updated_at }
        : session))
      setEditingSessionId(null)
      setSessionTitleDraft("")
      toast.success("Session renamed")
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null
      toast.error(typeof detail === "string" ? detail : "Failed to rename session")
    } finally {
      setRenamingSessionId(null)
    }
  }


  const sendMessage = useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim()
    if (!text || sendingRef.current) return
    if (text.length > 20000) {
      toast.error("Message is too long. Keep it under 20,000 characters.")
      return
    }
    sendingRef.current = true
    const controller = new AbortController()
    chatRequestRef.current = controller


    setPromptHistory(prev => {
      const existing = prev.find(prompt => prompt.text === text)
      if (existing) {
        return prev.map(prompt => prompt.text === text
          ? { ...prompt, used: prompt.used + 1, ts: new Date().toISOString() }
          : prompt)
      }
      return [{ text, ts: new Date().toISOString(), used: 1 }, ...prev].slice(0, 50)
    })

    const optimisticId = `pending-${crypto.randomUUID()}`
    const messageIndex = messages.length
    const userMsg: Message = { id: optimisticId, role: "user", content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput(""); setCharCount(0); setLoading(true)

    try {
      const { data } = await api.post<ChatResponse>("/ai/chat", {
        messages: [{ role: userMsg.role, content: userMsg.content }],
        session_id: currentSessionId,
      }, { signal: controller.signal })
      const responseText = typeof data.response === "string" ? data.response.trim() : ""
      if (!responseText) {
        throw new Error("The AI returned an empty response. Please try again.")
      }
      if (!data.session_id) {
        throw new Error("The AI response did not include a valid session.")
      }
      const sessionId = data.session_id
      const now = new Date()
      const aiMsg: Message = {
        id: `${sessionId}-${messageIndex + 1}`, role: "assistant",
        content: responseText, timestamp: now,
        tokens: data.tokens_used, intent: data.intent,
      }
      setMessages(prev => [
        ...prev.map(message => message.id === optimisticId
          ? { ...message, id: `${sessionId}-${messageIndex}` }
          : message),
        aiMsg,
      ])
      setCurrentSessionId(sessionId)
      if (data.messages_remaining !== undefined) {
        setUsage(prev => ({
          ...prev,
          used_today: prev.used_today + 1,
          remaining: data.messages_remaining ?? prev.remaining,
        }))
      }
      const title = data.session_title?.trim() || text.split(/\s+/).slice(0, 8).join(" ")
      setSessions(prev => {
        const existing = prev.find(session => session.id === sessionId)
        if (existing) {
          return prev.map(session => session.id === sessionId
            ? {
                ...session,
                title: data.session_title || session.title,
                message_count: session.message_count + 1,
                tokens_used: session.tokens_used + (data.tokens_used || 0),
                updated_at: now.toISOString(),
              }
            : session)
        }
        return [{
          id: sessionId,
          title,
          message_count: 1,
          tokens_used: data.tokens_used || 0,
          updated_at: now.toISOString(),
          model: "",
        }, ...prev]
      })
      void loadSessions()
      playPing()
    } catch (err: unknown) {
      if (axios.isCancel(err) || controller.signal.aborted) return
      const detail = axios.isAxiosError(err) && typeof err.response?.data?.detail === "string"
        ? err.response.data.detail
        : err instanceof Error ? err.message : ""
      if (detail.includes("All AI models") || detail.includes("temporarily unavailable")) {
        toast.error("⚠️ All AI services busy. Try again in 1-2 hours.", { duration: 8000 })
        setUsage(prev => ({ ...prev, remaining: 0, used_today: typeof prev.limit === "number" ? prev.limit : 20 }))
      } else if (detail.includes("Daily limit") || detail.includes("Free tier limit")) {
        toast.error("Daily limit reached. Upgrade to Pro!", { duration: 5000 })
        setUsage(prev => ({ ...prev, remaining: 0 }))
      } else { toast.error(detail || "AI error. Try again.") }
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      setInput(userMsg.content); setCharCount(userMsg.content.length)
    } finally {
      if (chatRequestRef.current === controller) {
        chatRequestRef.current = null
        sendingRef.current = false
        setLoading(false)
        inputRef.current?.focus()
      }
    }
  }, [currentSessionId, input, loadSessions, messages, playPing])


  const toggleVoice = useCallback(() => {
    const speechWindow = globalThis as SpeechRecognitionWindow
    const SpeechRecognitionApi = speechWindow.webkitSpeechRecognition ?? speechWindow.SpeechRecognition
    if (!SpeechRecognitionApi) {
      toast.error("Speech recognition not supported"); return
    }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return }
    const rec = new SpeechRecognitionApi()
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US"
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript?.trim()
      if (!transcript) return
      const nextInput = input + (input ? " " : "") + transcript
      setInput(nextInput)
      setCharCount(nextInput.length)
      setIsListening(false)
    }
    rec.onerror = () => { setIsListening(false); toast.error("Voice input failed") }
    rec.onend = () => setIsListening(false)
    recognitionRef.current = rec; rec.start(); setIsListening(true)
    toast("Listening...", { duration: 3000 })
  }, [input, isListening])


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (file.size > 100000) { toast.error("File too large (max 100KB)"); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (typeof ev.target?.result !== "string") return
      const attachment = `\n\`\`\`\n${ev.target.result.slice(0, 3000)}\n\`\`\`\n`
      const nextInput = input + attachment
      setInput(nextInput)
      setCharCount(nextInput.length)
      toast.success(`${file.name} attached!`)
    }
    reader.onerror = () => toast.error("Failed to read the file")
    reader.readAsText(file)
  }


  const handleExportChat = useCallback((format: "md" | "json" | "txt" = "md") => {
    if (messages.length === 0) { toast.error("No messages to export"); return }
    const content = format === "md"
      ? `# FlowDesk AI Chat Export\n_${new Date().toLocaleString()}_\n\n---\n\n` +
        messages.map(m => `**${m.role === "user" ? "You" : "AI"}** (${m.timestamp.toLocaleTimeString()})\n\n${m.content}`).join("\n\n---\n\n")
      : format === "json"
        ? JSON.stringify({ exported: new Date().toISOString(), session: currentSessionId, messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp, tokens: m.tokens, intent: m.intent })) }, null, 2)
        : messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join("\n\n")
    const mime = format === "md" ? "text/markdown" : format === "json" ? "application/json" : "text/plain"
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `chat-${Date.now()}.${format}`; a.click()
    URL.revokeObjectURL(url); toast.success(`Exported as .${format}!`)
  }, [messages, currentSessionId])

  useEffect(() => {
    if (!isAuthenticated) return
    const timer = globalThis.setTimeout(() => {
      void loadUsage()
      void loadSessions()
    }, 0)
    return () => globalThis.clearTimeout(timer)
  }, [isAuthenticated, loadSessions, loadUsage])

  useEffect(() => () => {
    sessionLoadRef.current?.abort()
    chatRequestRef.current?.abort()
    recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if (key === "k") { event.preventDefault(); inputRef.current?.focus() }
        if (key === "n") { event.preventDefault(); startNewChat() }
        if (key === "b") { event.preventDefault(); setShowSidebar(open => !open) }
        if (key === "e") { event.preventDefault(); handleExportChat() }
        if (key === "f") { event.preventDefault(); setShowSearch(open => !open) }
        if (key === "/") { event.preventDefault(); setShowShortcuts(open => !open) }
      }
      if (event.key === "Escape") {
        setShowStats(false); setShowSettings(false); setShowShortcuts(false)
        setShowTemplates(false); setShowSnippets(false); setShowSearch(false)
        setShowPromptHistory(false); setTagPickerFor(null); setEditingMsgId(null)
        setEditingSessionId(null); setSessionTitleDraft("")
      }
    }
    globalThis.addEventListener("keydown", handler)
    return () => globalThis.removeEventListener("keydown", handler)
  }, [handleExportChat, startNewChat])


  const handleCopy = (msg: Message) => {
    navigator.clipboard.writeText(msg.content)
    setCopiedId(msg.id); toast.success("Copied!")
    setTimeout(() => setCopiedId(null), 2000)
  }


  const togglePin = (msgId: string) => {
    const next = pinnedMsgIds.includes(msgId) ? pinnedMsgIds.filter(id => id !== msgId) : [...pinnedMsgIds, msgId]
    setPinnedMsgIds(next)
    if (currentSessionId) LS.set(`fd_pins_${currentSessionId}`, next)
    toast(pinnedMsgIds.includes(msgId) ? "Unpinned" : "Pinned 📌")
  }


  const toggleBookmark = (msgId: string) => {
    const next = bookmarkedMsgIds.includes(msgId) ? bookmarkedMsgIds.filter(id => id !== msgId) : [...bookmarkedMsgIds, msgId]
    setBookmarkedMsgIds(next); toast(bookmarkedMsgIds.includes(msgId) ? "Removed" : "Bookmarked ⭐")
  }


  const addReaction = (msgId: string, reaction: typeof REACTIONS[number]) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: m.reaction === reaction ? null : reaction } : m))
  }


  const shareMessage = (msg: Message) => {
    if (navigator.share) {
      navigator.share({ title: "FlowDesk AI", text: msg.content }).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast.error("Unable to open the share menu")
      })
    }
    else { navigator.clipboard.writeText(msg.content); toast.success("Copied for sharing!") }
  }


  const readAloud = (text: string) => {
    if (!("speechSynthesis" in globalThis)) { toast.error("TTS not supported"); return }
    globalThis.speechSynthesis.cancel()
    const plain = text.replace(/```[\s\S]*?```/g, "…code block…").replace(/[#*`]/g, "").trim()
    const utt = new SpeechSynthesisUtterance(plain)
    utt.rate = 1.05; utt.pitch = 1
    globalThis.speechSynthesis.speak(utt)
    toast("Reading aloud 🔊", { duration: 2000 })
  }


  const startEdit = (msg: Message) => { setEditingMsgId(msg.id); setEditingText(msg.content) }
  const saveEdit = (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: editingText, edited: true } : m))
    setEditingMsgId(null); setEditingText(""); toast.success("Message edited")
  }


  const saveSnippet = (code: string, lang: string) => {
    const title = prompt("Snippet title:")?.trim()
    if (!title) return
    const s: Snippet = { id: Date.now().toString(), title, code, lang, ts: new Date().toISOString(), tags: [] }
    setSnippets(prev => [s, ...prev])
    toast.success("Snippet saved to vault!")
  }


  const toggleCollapse = (msgId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }


  const setMsgTag = (msgId: string, tag: string | undefined) => {
    setMsgTags(prev => tag ? { ...prev, [msgId]: tag } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== msgId)))
  }


  const isLimitReached = user?.plan === "free" && usage.remaining === 0
  const remainingNum = typeof usage.remaining === "number" ? usage.remaining : 999
  const limitNum = typeof usage.limit === "number" ? usage.limit : 20
  const remainingPercent = Math.min(100, (remainingNum / limitNum) * 100)

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase()
    return sessions
      .filter(session => !query || session.title.toLowerCase().includes(query))
      .sort((a, b) => {
        const difference = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        return sortOrder === "newest" ? difference : -difference
      })
  }, [sessions, sessionSearch, sortOrder])

  const displayMessages = useMemo(() => {
    let list = messages
    if (searchQuery) list = list.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    if (activeTagFilter) list = list.filter(m => msgTags[m.id] === activeTagFilter)
    return list
  }, [messages, searchQuery, activeTagFilter, msgTags])

  const pinnedMessages = useMemo(() => messages.filter(m => pinnedMsgIds.includes(m.id)), [messages, pinnedMsgIds])
  const bookmarkedMessages = useMemo(() => messages.filter(m => bookmarkedMsgIds.includes(m.id)), [messages, bookmarkedMsgIds])
  const usedTags = useMemo(() => [...new Set(Object.values(msgTags))], [msgTags])


  return (
    <div style={{
      height: fullscreen ? "100vh" : "100dvh", display: "flex", flexDirection: "column",
      background: T.bg, color: T.text, fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
      ...(fullscreen ? { position: "fixed", inset: 0, zIndex: 9999 } : {}),
    }}
    onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
    onDragLeave={() => setIsDragOver(false)}
    onDrop={handleDrop}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        textarea, input { font-family: inherit; }
        button:focus-visible { outline: 2px solid ${T.indigo}; outline-offset: 2px; }
        @media (max-width: 640px) {
          .ai-header { height: 58px !important; padding: 0 8px !important; gap: 4px !important; }
          .ai-title-block { gap: 7px !important; }
          .ai-title-icon { width: 30px !important; height: 30px !important; border-radius: 8px !important; }
          .ai-title-subtitle { display: none !important; }
          .ai-title-row { flex-wrap: nowrap !important; gap: 4px !important; }
          .ai-title-row > span:first-child { font-size: 13px !important; white-space: nowrap !important; }
          .ai-header-actions { gap: 1px !important; }
          .ai-header-tool.hide-mobile { display: none !important; }
          .ai-header-tool { padding: 6px !important; }
          .ai-usage-meter { margin-right: 2px !important; }
          .ai-usage-meter > div { width: 38px !important; }
          .ai-new-button { padding: 7px 9px !important; border-radius: 9px !important; }
          .ai-new-label { display: none !important; }
          .ai-empty-state { justify-content: flex-start !important; padding: 24px 14px 14px !important; overflow-y: auto !important; }
          .ai-empty-hero { width: 58px !important; height: 58px !important; border-radius: 18px !important; margin-bottom: 12px !important; }
          .ai-empty-title { font-size: 19px !important; margin-bottom: 5px !important; }
          .ai-empty-copy { font-size: 12px !important; line-height: 1.55 !important; margin-bottom: 2px !important; }
          .ai-empty-provider { margin-bottom: 16px !important; }
          .ai-quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
          .ai-empty-hints { display: none !important; }
          .ai-composer { padding: 8px 10px 10px !important; }
          .ai-prompt-strip { margin-bottom: 6px !important; padding-bottom: 4px !important; }
          .ai-input-row { gap: 6px !important; align-items: stretch !important; }
          .ai-side-actions { display: none !important; }
          .ai-textarea { min-height: 72px !important; padding: 10px 36px 10px 12px !important; font-size: 14px !important; }
          .ai-send-button { height: auto !important; min-height: 72px !important; padding: 0 14px !important; border-radius: 12px !important; }
          .ai-composer-help { display: none !important; }
        }
      `}</style>


      {isDragOver && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(99,102,241,0.12)", border: `3px dashed ${T.indigo}`, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.indigo }}>📂 Drop file to attach</div>
        </div>
      )}


      <div className="ai-header" style={{ borderBottom: `1px solid ${T.border}`, background: T.surface, padding: "0 12px", height: 52, display: "flex", alignItems: "center", gap: 6, flexShrink: 0, zIndex: 40 }}>
        <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex", padding: 6, borderRadius: 7 }}>
          <ArrowLeft size={17} />
        </button>
        <button onClick={() => setShowSidebar(o => !o)} style={{ background: showSidebar ? "rgba(99,102,241,0.12)" : "none", border: "none", cursor: "pointer", color: showSidebar ? T.indigo : T.muted, display: "flex", padding: 6, borderRadius: 7 }}>
          {showSidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>


        <div className="ai-title-block" style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
          <div className="ai-title-icon" style={{ width: 32, height: 32, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Brain size={16} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="ai-title-row" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>FlowDesk AI</span>
              {currentSessionId && (
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: T.emerald, border: `1px solid rgba(16,185,129,0.2)`, display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.emerald, animation: "pulse 2s infinite" }} />Memory On
                </span>
              )}
              {loading && (
                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: T.indigo, display: "flex", alignItems: "center", gap: 3 }}>
                  <Brain size={8} style={{ animation: "spin 1.5s linear infinite" }} />Thinking
                </span>
              )}
            </div>
            <div className="ai-title-subtitle" style={{ fontSize: 10, color: T.muted }}>Groq • Llama 3.3 70B • Ultra Fast</div>
          </div>
        </div>


        <div className="ai-header-actions" style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>

          {user?.plan === "free" && (
            <div className="ai-usage-meter" style={{ display: "flex", alignItems: "center", gap: 5, marginRight: 4 }}>
              <div style={{ width: 50, height: 3, background: T.faint, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, width: `${remainingPercent}%`, background: remainingPercent > 50 ? T.emerald : remainingPercent > 20 ? T.amber : T.rose, transition: "width 0.5s" }} />
              </div>
              <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>{usage.remaining}/{usage.limit}</span>
            </div>
          )}
          {user?.plan === "pro" && (
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: T.emerald, border: `1px solid rgba(16,185,129,0.2)`, display: "flex", alignItems: "center", gap: 3 }}>
              <Sparkles size={8} />Pro
            </span>
          )}


          {[
            { icon: <Search size={14} />, title: "Search (Ctrl+F)", active: showSearch, action: () => setShowSearch(s => !s), show: messages.length > 0, mobile: true },
            { icon: <Archive size={14} />, title: "Snippet Vault", active: showSnippets, action: () => setShowSnippets(true), show: true, mobile: false },
            { icon: <BarChart2 size={14} />, title: "Stats", active: showStats, action: () => setShowStats(true), show: messages.length > 0, mobile: false },
            { icon: <Download size={14} />, title: "Export", active: false, action: () => handleExportChat("md"), show: messages.length > 0, mobile: false },
            { icon: <Keyboard size={14} />, title: "Shortcuts (Ctrl+/)", active: showShortcuts, action: () => setShowShortcuts(true), show: true, mobile: false },
            { icon: <Settings size={14} />, title: "Settings", active: showSettings, action: () => setShowSettings(true), show: true, mobile: true },
            { icon: fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />, title: "Fullscreen", active: fullscreen, action: () => setFullscreen(f => !f), show: true, mobile: false },
          ].filter(b => b.show).map(b => (
            <button className={`ai-header-tool ${b.mobile ? "" : "hide-mobile"}`} key={b.title} onClick={b.action} title={b.title} style={{
              background: b.active ? "rgba(99,102,241,0.12)" : "none", border: "none", cursor: "pointer",
              color: b.active ? T.indigo : T.muted, padding: 6, borderRadius: 7, display: "flex",
              transition: "all 0.12s",
            }}>{b.icon}</button>
          ))}

          <button className="ai-new-button" onClick={startNewChat} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 10px", color: T.muted, cursor: "pointer" }}>
            <Plus size={12} /><span className="ai-new-label">New</span>
          </button>
        </div>
      </div>


      {showSearch && (
        <div style={{ padding: "7px 14px", borderBottom: `1px solid ${T.border}`, background: T.surface, display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <Search size={12} color={T.muted} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search in conversation…" autoFocus
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.text, fontSize: 13 }} />

          {usedTags.length > 0 && usedTags.map(tag => (
            <button key={tag} onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 99, border: "none", cursor: "pointer",
              background: activeTagFilter === tag ? TAG_COLORS[tag] : "rgba(255,255,255,0.05)",
              color: activeTagFilter === tag ? "#fff" : TAG_COLORS[tag] || T.muted, fontWeight: 600,
            }}>{tag}</button>
          ))}
          {searchQuery && <span style={{ fontSize: 10, color: T.muted }}>{displayMessages.length} found</span>}
          <button onClick={() => { setShowSearch(false); setSearchQuery(""); setActiveTagFilter(null) }} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><X size={12} /></button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>


        {showSidebar && (
          <button type="button" onClick={() => setShowSidebar(false)} style={{ position: "fixed", inset: 0, top: 52, background: "rgba(0,0,0,0.55)", zIndex: 20, border: "none", cursor: "pointer" }} className="md-overlay" />
        )}
        {showSidebar && (
          <div style={{ position: "fixed", left: 0, top: 52, bottom: 0, zIndex: 30, width: "min(80vw,272px)", background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", boxShadow: "4px 0 24px rgba(0,0,0,0.4)" }}>


            <div style={{ padding: "9px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 6 }}>
              <input value={sessionSearch} onChange={e => setSessionSearch(e.target.value)} placeholder="Search sessions…"
                style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px", color: T.text, fontSize: 12, outline: "none" }} />
              <button onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")} title="Sort order" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 7px", cursor: "pointer", color: T.muted, display: "flex" }}>
                <SortAsc size={12} />
              </button>
              <button onClick={() => setShowSidebar(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><PanelLeftClose size={14} /></button>
            </div>


            <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, padding: "0 8px" }}>
              {([["history","History"],["pinned","Pinned"],["bookmarks","Saved"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setSidebarView(v)} style={{
                  flex: 1, fontSize: 11, padding: "8px 4px", borderBottom: `2px solid ${sidebarView === v ? T.indigo : "transparent"}`,
                  background: "none", border: "none", cursor: "pointer", color: sidebarView === v ? T.indigo : T.muted, fontWeight: sidebarView === v ? 700 : 400,
                }}>{l}</button>
              ))}
            </div>


            <div style={{ padding: "8px 8px 4px" }}>
              <button onClick={startNewChat} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "8px 11px", borderRadius: 8,
                border: `1px solid ${!currentSessionId ? "rgba(99,102,241,0.3)" : T.border}`,
                background: !currentSessionId ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)",
                color: !currentSessionId ? T.indigo : T.muted, cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>
                <Plus size={13} />New Conversation
              </button>
            </div>


            <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
              {sidebarView === "history" && (
                filteredSessions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: T.muted, fontSize: 12 }}>
                    <MessageSquare size={24} style={{ margin: "0 auto 8px", display: "block", color: T.faint }} />
                    No sessions
                  </div>
                ) : filteredSessions.map(s => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => loadSession(s.id)}
                    onKeyDown={event => {
                      if (event.key !== "Enter" && event.key !== " ") return
                      event.preventDefault()
                      void loadSession(s.id)
                    }}
                    style={{
                    display: "flex", alignItems: "flex-start", gap: 7, padding: "8px 9px", borderRadius: 8,
                    cursor: "pointer", marginBottom: 2,
                    background: currentSessionId === s.id ? "rgba(99,102,241,0.1)" : "transparent",
                    border: `1px solid ${currentSessionId === s.id ? "rgba(99,102,241,0.2)" : "transparent"}`,
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { if (currentSessionId !== s.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)" }}
                  onMouseLeave={e => { if (currentSessionId !== s.id) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                  >
                    <MessageSquare size={11} color={T.muted} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingSessionId === s.id ? (
                        <input
                          autoFocus
                          value={sessionTitleDraft}
                          maxLength={120}
                          disabled={renamingSessionId === s.id}
                          aria-label="Session name"
                          onClick={event => event.stopPropagation()}
                          onChange={event => setSessionTitleDraft(event.target.value)}
                          onKeyDown={event => {
                            event.stopPropagation()
                            if (event.key === "Enter") {
                              event.preventDefault()
                              void renameSession(s.id)
                            }
                            if (event.key === "Escape") {
                              setEditingSessionId(null)
                              setSessionTitleDraft("")
                            }
                          }}
                          style={{
                            width: "100%", borderRadius: 5, border: `1px solid ${T.indigo}`,
                            background: "rgba(255,255,255,0.05)", color: T.text,
                            padding: "3px 6px", fontSize: 11, outline: "none",
                          }}
                        />
                      ) : (
                        <p
                          title={s.title}
                          onDoubleClick={event => beginRenameSession(s, event)}
                          style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {s.title}
                        </p>
                      )}
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: T.muted, display: "flex", alignItems: "center", gap: 2 }}><Clock size={8} />{new Date(s.updated_at).toLocaleDateString()}</span>
                        <span style={{ fontSize: 10, color: T.muted }}>{s.message_count}m</span>
                        {s.tokens_used > 0 && <span style={{ fontSize: 10, color: T.muted }}>{s.tokens_used.toLocaleString()}t</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      {editingSessionId === s.id ? (
                        <>
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              void renameSession(s.id)
                            }}
                            disabled={renamingSessionId === s.id}
                            title="Save session name"
                            aria-label="Save session name"
                            style={{ background: "none", border: "none", color: T.emerald, cursor: "pointer", display: "flex", padding: 4 }}
                          >
                            {renamingSessionId === s.id
                              ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                              : <Check size={11} />}
                          </button>
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              setEditingSessionId(null)
                              setSessionTitleDraft("")
                            }}
                            title="Cancel rename"
                            aria-label="Cancel rename"
                            style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex", padding: 4 }}
                          >
                            <X size={11} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={event => beginRenameSession(s, event)}
                          title={`Rename ${s.title}`}
                          aria-label={`Rename ${s.title}`}
                          style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex", padding: 4 }}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                      <DeleteButton onClick={e => void deleteSession(s.id, e)} title={`Delete ${s.title}`} aria-label={`Delete ${s.title}`} />
                    </div>
                  </div>
                ))
              )}
              {sidebarView === "pinned" && (
                pinnedMessages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: T.muted, fontSize: 12 }}>No pinned messages</div>
                ) : pinnedMessages.map(m => (
                  <button type="button" key={m.id} onClick={() => { document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); if (globalThis.innerWidth < 768) setShowSidebar(false) }}
                    style={{ width: "100%", textAlign: "left", font: "inherit", padding: "8px 9px", borderRadius: 8, background: "rgba(249,115,22,0.06)", border: `1px solid rgba(249,115,22,0.15)`, marginBottom: 5, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                      <Pin size={8} color="#FB923C" /><span style={{ fontSize: 9, color: T.muted }}>{m.role === "user" ? "You" : "AI"}</span>
                    </div>
                    <p style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.content.slice(0, 70)}</p>
                  </button>
                ))
              )}
              {sidebarView === "bookmarks" && (
                bookmarkedMessages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: T.muted, fontSize: 12 }}>No bookmarks yet</div>
                ) : bookmarkedMessages.map(m => (
                  <button type="button" key={m.id} onClick={() => { document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); if (globalThis.innerWidth < 768) setShowSidebar(false) }}
                    style={{ width: "100%", textAlign: "left", font: "inherit", padding: "8px 9px", borderRadius: 8, background: "rgba(245,158,11,0.06)", border: `1px solid rgba(245,158,11,0.15)`, marginBottom: 5, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                      <Star size={8} color={T.amber} /><span style={{ fontSize: 9, color: T.muted }}>{m.role === "user" ? "You" : "AI"}</span>
                      {msgTags[m.id] && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: TAG_COLORS[msgTags[m.id]] + "20", color: TAG_COLORS[msgTags[m.id]] }}>{msgTags[m.id]}</span>}
                    </div>
                    <p style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.content.slice(0, 70)}</p>
                  </button>
                ))
              )}
            </div>


            {promptHistory.length > 0 && (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: 8 }}>
                <button onClick={() => setShowPromptHistory(s => !s)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 11 }}>
                  <Clock size={10} />Recent Prompts {showPromptHistory ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
                {showPromptHistory && (
                  <div style={{ maxHeight: 120, overflowY: "auto" }}>
                    {promptHistory.slice(0, 8).map(p => (
                      <button key={`${p.ts}-${hashString(p.text)}`} onClick={() => { setInput(p.text); inputRef.current?.focus(); if (globalThis.innerWidth < 768) setShowSidebar(false) }} style={{
                        width: "100%", textAlign: "left", padding: "5px 8px", background: "none", border: "none", cursor: "pointer",
                        color: T.muted, fontSize: 11, borderRadius: 6,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                      >{p.text.slice(0, 45)}{p.text.length > 45 ? "…" : ""}</button>
                    ))}
                  </div>
                )}
              </div>
            )}


            {currentSessionId && (
              <div style={{ padding: 9, borderTop: `1px solid ${T.border}` }}>
                <div style={{ background: "rgba(16,185,129,0.07)", border: `1px solid rgba(16,185,129,0.18)`, borderRadius: 8, padding: "7px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                    <Brain size={10} color={T.emerald} /><span style={{ fontSize: 10, color: T.emerald, fontWeight: 700 }}>Memory Active</span>
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(16,185,129,0.45)", lineHeight: 1.4 }}>AI remembers full conversation context.</p>
                </div>
              </div>
            )}
          </div>
        )}


        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, fontSize }}>


          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {loadingSession ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <Loader2 size={28} color={T.indigo} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : displayMessages.length === 0 && !loading ? (

              <div className="ai-empty-state" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "28px 16px", textAlign: "center" }}>
                <div className="ai-empty-hero" style={{ width: 68, height: 68, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: "0 10px 36px rgba(99,102,241,0.3)" }}>
                  <Brain size={32} color="#fff" />
                </div>
                <h2 className="ai-empty-title" style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 6 }}>FlowDesk AI</h2>
                <p className="ai-empty-copy" style={{ fontSize: 13, color: T.muted, maxWidth: 380, marginBottom: 4, lineHeight: 1.65 }}>
                  Senior developer on demand. Drag & drop files, use voice input, paste code directly.
                </p>
                <p className="ai-empty-provider" style={{ fontSize: 10, color: T.muted, marginBottom: 24, display: "flex", alignItems: "center", gap: 4 }}>
                  <Brain size={9} />Powered by Llama 3.3 70B via Groq
                </p>
                <div style={{ width: "100%", maxWidth: 660, marginBottom: 20 }}>
                  <p style={{ fontSize: 10, color: T.muted, marginBottom: 9, textTransform: "uppercase", letterSpacing: 1 }}>Quick Actions</p>
                  <div className="ai-quick-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 7 }}>
                    {QUICK_ACTIONS.map(a => (
                      <button key={a.label} onClick={() => { setInput(a.prompt); inputRef.current?.focus() }} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        padding: "11px 6px", background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.indigo; (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)" }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.background = T.surface }}
                      >
                        <a.icon size={15} style={{ color: a.color }} />
                        <span style={{ fontSize: 10, color: T.muted }}>{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ai-empty-hints" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  {[["Ctrl+/","Shortcuts"],["Ctrl+B","Sidebar"],["Drop file","Attach"],["Voice","Voice input"]].map(([k, l]) => (
                    <span key={k} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 7, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, color: T.muted }}>
                      <span style={{ color: T.indigo }}>{k}</span> — {l}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: 820, margin: "0 auto", padding: compactMode ? "16px 12px 8px" : "24px 14px 8px", display: "flex", flexDirection: "column", gap: compactMode ? 14 : 22 }}>


                {pinnedMessages.length > 0 && !searchQuery && (
                  <div style={{ background: "rgba(249,115,22,0.06)", border: `1px solid rgba(249,115,22,0.18)`, borderRadius: 9, padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Pin size={11} color="#FB923C" />
                    <span style={{ fontSize: 11, color: "#FB923C", fontWeight: 600 }}>{pinnedMessages.length} pinned</span>
                    <span style={{ fontSize: 10, color: T.muted }}>— view in sidebar Pinned tab</span>
                  </div>
                )}

                {displayMessages.map((message, idx) => {
                  const isPinned = pinnedMsgIds.includes(message.id)
                  const isBookmarked = bookmarkedMsgIds.includes(message.id)
                  const isCollapsed = collapsedIds.has(message.id)
                  const isEditing = editingMsgId === message.id
                  const tag = msgTags[message.id]
                  const isHighlighted = searchQuery && message.content.toLowerCase().includes(searchQuery.toLowerCase())
                  const intentStyle = INTENT_COLORS[message.intent || "general"] || INTENT_COLORS.general

                  return (
                    <div key={message.id} id={`msg-${message.id}`}
                      style={{
                        display: "flex", gap: 10, justifyContent: message.role === "user" ? "flex-end" : "flex-start",
                        animation: "fadeIn 0.2s ease",
                        outline: isHighlighted ? `2px solid rgba(99,102,241,0.35)` : "none",
                        borderRadius: 12, padding: isHighlighted ? 4 : 0,
                      }}>


                      {message.role === "assistant" && (
                        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          <Brain size={14} color="#fff" />
                        </div>
                      )}

                      <div style={{ maxWidth: "91%", display: "flex", flexDirection: "column", alignItems: message.role === "user" ? "flex-end" : "flex-start", gap: 3 }}>

                        {(isPinned || isBookmarked || tag) && (
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {isPinned && <span style={{ fontSize: 9, color: "#FB923C", display: "flex", alignItems: "center", gap: 2 }}><Pin size={7} />Pinned</span>}
                            {isBookmarked && <span style={{ fontSize: 9, color: T.amber, display: "flex", alignItems: "center", gap: 2 }}><Star size={7} />Saved</span>}
                            {tag && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: TAG_COLORS[tag] + "20", color: TAG_COLORS[tag], fontWeight: 700 }}>{tag}</span>}
                          </div>
                        )}


                        <div style={{
                          padding: compactMode ? "8px 12px" : "11px 15px",
                          borderRadius: message.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                          background: message.role === "user" ? T.userBubble : T.aiBubble,
                          border: message.role === "assistant" ? `1px solid ${isPinned ? "rgba(249,115,22,0.25)" : T.border}` : "none",
                          maxWidth: "100%",
                        }}>

                          {message.role === "assistant" && message.content.length > 600 && (
                            <button onClick={() => toggleCollapse(message.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                              {isCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                              {isCollapsed ? "Expand" : "Collapse"}
                            </button>
                          )}

                          {isEditing ? (
                            <div>
                              <textarea value={editingText} onChange={e => setEditingText(e.target.value)} rows={4} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 7, padding: "8px", color: T.text, fontSize, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                <button onClick={() => saveEdit(message.id)} style={{ fontSize: 11, padding: "4px 10px", background: T.indigo, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer" }}>Save</button>
                                <button onClick={() => setEditingMsgId(null)} style={{ fontSize: 11, padding: "4px 10px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 6, color: T.muted, cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          ) : isCollapsed ? (
                            <p style={{ fontSize, color: T.muted, fontStyle: "italic" }}>{message.content.slice(0, 120)}…</p>
                          ) : message.role === "assistant" ? (
                            <MessageContent content={message.content} fontSize={fontSize} C={T} />
                          ) : (
                            <p style={{ fontSize, color: "#fff", whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{message.content}</p>
                          )}
                        </div>


                        {message.reaction && <span style={{ fontSize: 15 }}>{message.reaction}</span>}


                        {message.edited && <span style={{ fontSize: 9, color: T.muted, fontStyle: "italic" }}>edited</span>}


                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {showTimestamps && (
                            <span style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>
                              {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          {message.intent && message.intent !== "general" && (
                            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: intentStyle.bg, color: intentStyle.text }}>{message.intent}</span>
                          )}
                          {message.tokens && <span style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>{message.tokens.toLocaleString()}t</span>}


                          <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>

                            <button onClick={() => handleCopy(message)} style={{ background: "none", border: "none", cursor: "pointer", color: copiedId === message.id ? T.emerald : T.muted, display: "flex", alignItems: "center", gap: 2, fontSize: 10 }}>
                              {copiedId === message.id ? <><Check size={9} />Copied</> : <><Copy size={9} />Copy</>}
                            </button>


                            {message.role === "user" && (
                              <button onClick={() => startEdit(message)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex", fontSize: 10 }}>
                                ✏️
                              </button>
                            )}


                            {message.role === "assistant" && (
                              <>
                                <button onClick={() => togglePin(message.id)} style={{ background: "none", border: "none", cursor: "pointer", color: isPinned ? "#FB923C" : T.muted, display: "flex", fontSize: 10 }}>
                                  <Pin size={9} />
                                </button>
                                <button onClick={() => toggleBookmark(message.id)} style={{ background: "none", border: "none", cursor: "pointer", color: isBookmarked ? T.amber : T.muted, display: "flex", fontSize: 10 }}>
                                  <Star size={9} />
                                </button>
                                <button onClick={() => readAloud(message.content)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex", fontSize: 10 }}>
                                  <Volume2 size={9} />
                                </button>
                                <button onClick={() => shareMessage(message)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex", fontSize: 10 }}>
                                  <Share2 size={9} />
                                </button>


                                <div style={{ position: "relative" }}>
                                  <button onClick={() => setTagPickerFor(tagPickerFor === message.id ? null : message.id)} style={{ background: "none", border: "none", cursor: "pointer", color: tag ? TAG_COLORS[tag] : T.muted, display: "flex", fontSize: 10 }}>
                                    <Tag size={9} />
                                  </button>
                                  {tagPickerFor === message.id && (
                                    <TagPicker current={tag} onSelect={t => setMsgTag(message.id, t)} onClose={() => setTagPickerFor(null)} C={T} />
                                  )}
                                </div>


                                {REACTIONS.map(r => (
                                  <button key={r} onClick={() => addReaction(message.id, r)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, opacity: message.reaction === r ? 1 : 0.28, transition: "opacity 0.15s" }}>{r}</button>
                                ))}


                                {idx > 0 && (
                                  <button onClick={() => { const pu = messages.slice(0, idx).reverse().find(m => m.role === "user"); if (pu) sendMessage(pu.content) }} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex", alignItems: "center", gap: 2, fontSize: 10 }}>
                                    <RefreshCw size={9} />Retry
                                  </button>
                                )}


                                {message.content.includes("```") && (
                                  <button onClick={() => {
                                    const match = FIRST_CODE_BLOCK_PATTERN.exec(message.content)
                                    if (match) saveSnippet(match[2], match[1] || "code")
                                  }} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex", alignItems: "center", gap: 2, fontSize: 10 }}>
                                    <Archive size={9} />Save
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>


                      {message.role === "user" && (
                        <div style={{ width: 32, height: 32, background: T.surface2, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, border: `1px solid ${T.border}` }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{user?.display_name?.charAt(0).toUpperCase() || "U"}</span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {loading && <ThinkingDots C={T} />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>


          <div className="ai-composer" style={{ borderTop: `1px solid ${T.border}`, background: T.surface, padding: "9px 13px 11px", flexShrink: 0 }}>
            <div style={{ maxWidth: 820, margin: "0 auto" }}>

              {isLimitReached && (
                <div style={{ marginBottom: 8, padding: "9px 13px", background: "rgba(244,63,94,0.07)", border: `1px solid rgba(244,63,94,0.2)`, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <AlertCircle size={12} color={T.rose} />
                    <span style={{ fontSize: 12, color: T.rose }}>Daily limit reached. Upgrade to Pro for higher AI limits.</span>
                  </div>
                  <button onClick={() => toast("🚀 Pro coming soon!", { duration: 4000 })} style={{ fontSize: 11, background: T.rose, border: "none", borderRadius: 6, padding: "4px 11px", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Upgrade</button>
                </div>
              )}


              <div className="ai-prompt-strip" style={{ display: "flex", gap: 4, marginBottom: 7, overflowX: "auto", paddingBottom: 2 }}>
                {QUICK_ACTIONS.slice(0, 10).map(a => (
                  <button key={a.label} onClick={() => { setInput(a.prompt); inputRef.current?.focus() }} style={{
                    flexShrink: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 10,
                    background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`,
                    borderRadius: 6, padding: "3px 9px", color: T.muted, cursor: "pointer", transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.text; (e.currentTarget as HTMLElement).style.borderColor = T.border2 }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.muted; (e.currentTarget as HTMLElement).style.borderColor = T.border }}
                  >
                    <a.icon size={10} style={{ color: a.color }} />{a.label}
                  </button>
                ))}
                <button onClick={() => setShowTemplates(s => !s)} style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 10,
                  background: showTemplates ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${showTemplates ? T.indigo : T.border}`,
                  borderRadius: 6, padding: "3px 9px", color: showTemplates ? T.indigo : T.muted, cursor: "pointer",
                }}>
                  <Sparkles size={10} />Templates
                </button>
              </div>


              {showTemplates && (
                <div style={{ marginBottom: 8, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>Prompt Templates</span>
                    <button onClick={() => setShowTemplates(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><X size={11} /></button>
                  </div>
                  <div style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 5, maxHeight: 160, overflowY: "auto" }}>
                    {PROMPT_TEMPLATES.map(t => (
                      <button key={t.label} onClick={() => { setInput(t.prompt); inputRef.current?.focus(); setShowTemplates(false) }} style={{
                        background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 7,
                        padding: "7px 9px", cursor: "pointer", textAlign: "left", fontSize: 11, color: T.muted, transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.indigo; (e.currentTarget as HTMLElement).style.color = T.text }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.color = T.muted }}
                      >
                        <div style={{ fontSize: 9, color: T.indigo, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.cat}</div>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}


              <div className="ai-input-row" style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>

                <div className="ai-side-actions" style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  <button onClick={toggleVoice} title="Voice input" style={{
                    background: isListening ? "rgba(244,63,94,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${isListening ? "rgba(244,63,94,0.3)" : T.border}`,
                    borderRadius: 8, padding: "7px 8px", cursor: "pointer", color: isListening ? T.rose : T.muted, display: "flex",
                    animation: isListening ? "pulse 1.5s infinite" : "none",
                  }}>
                    {isListening ? <MicOff size={13} /> : <Mic size={13} />}
                  </button>

                  <div style={{ position: "relative" }}>
                    <button title="Export chat" onClick={() => handleExportChat("md")} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 8px", cursor: "pointer", color: T.muted, display: "flex" }}>
                      <Download size={13} />
                    </button>
                  </div>
                </div>


                <div style={{ flex: 1, position: "relative" }}>
                  <textarea className="ai-textarea" ref={inputRef} value={input}
                    onChange={e => { setInput(e.target.value); setCharCount(e.target.value.length) }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder={isLimitReached ? "Daily limit reached." : "Ask anything... paste code, drop files, use voice"}
                    disabled={loading || isLimitReached}
                    rows={3}
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`,
                      borderRadius: 10, padding: "10px 42px 10px 13px",
                      color: T.text, fontSize, outline: "none", resize: "none",
                      lineHeight: 1.65, transition: "border-color 0.15s",
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(99,102,241,0.45)")}
                    onBlur={e => (e.target.style.borderColor = T.border)}
                  />
                  {charCount > 0 && (
                    <span style={{ position: "absolute", bottom: 7, right: 9, fontSize: 9, color: charCount > 3000 ? T.amber : T.muted, fontFamily: "monospace" }}>{charCount}</span>
                  )}
                </div>


                <button className="ai-send-button" onClick={() => sendMessage()} disabled={!input.trim() || loading || isLimitReached} style={{
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg,#6366F1,#8B5CF6)", border: "none", borderRadius: 10,
                  padding: "0 15px", height: 84, cursor: (!input.trim() || loading || isLimitReached) ? "not-allowed" : "pointer",
                  opacity: (!input.trim() || loading || isLimitReached) ? 0.38 : 1, transition: "opacity 0.15s",
                  boxShadow: "0 4px 16px rgba(99,102,241,0.22)",
                }}>
                  {loading ? <Loader2 size={17} color="#fff" style={{ animation: "spin 1s linear infinite" }} /> : <Send size={17} color="#fff" />}
                </button>
              </div>

              <div className="ai-composer-help" style={{ display: "flex", justifyContent: "space-between", marginTop: 5, flexWrap: "wrap", gap: 3 }}>
                <span style={{ fontSize: 9, color: T.muted }}>Enter send • Shift+Enter line • Ctrl+/ shortcuts • Drop files</span>
                <span style={{ fontSize: 9, color: T.muted, display: "flex", alignItems: "center", gap: 3 }}>
                  <Brain size={8} />{currentSessionId ? "Memory active" : "New session"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>


      {showStats && <StatsModal messages={messages} sessions={sessions} usage={usage} onClose={() => setShowStats(false)} C={T} />}
      {showSnippets && <SnippetVault snippets={snippets} onDelete={id => setSnippets(prev => prev.filter(s => s.id !== id))} onCopy={code => { navigator.clipboard.writeText(code); toast.success("Copied!") }} onClose={() => setShowSnippets(false)} C={T} />}
      {showSettings && (
        <SettingsPanel themeName={themeName} fontSize={fontSize} setTheme={t => setThemeName(t)} setFontSize={setFontSize}
          onClose={() => setShowSettings(false)} C={T}
          compactMode={compactMode} setCompactMode={setCompactMode}
          soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}
          autoScroll={autoScroll} setAutoScroll={setAutoScroll}
          showTimestamps={showTimestamps} setShowTimestamps={setShowTimestamps}
        />
      )}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} C={T} />}
    </div>
  )
}
