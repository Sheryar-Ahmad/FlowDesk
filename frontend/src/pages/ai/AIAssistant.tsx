import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft, Send, Copy, Check, Loader2,
  Code, FileText, Zap, Shield, RefreshCw,
  Sparkles, Terminal, Brain, Lightbulb,
  Search, AlertCircle, TrendingUp, Plus, Clock,
  MessageSquare, PanelLeftOpen, PanelLeftClose,
  Download, Pin, Star, BookOpen,
  Hash, Mic, MicOff, Volume2,
  BarChart2, X, Bookmark, Share2,
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import { DeleteButton } from "../../components/DeleteButton"
import { API_BASE_URL } from "../../services/api/config"
import axios from "axios"
import toast from "react-hot-toast"

const api = axios.create({ baseURL: API_BASE_URL, timeout: 60000 })
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/* ─── TYPES ─────────────────────────────────────────────────────────────────── */
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  tokens?: number
  intent?: string
  pinned?: boolean
  bookmarked?: boolean
  reaction?: "👍" | "👎" | "❤️" | null
}

interface SessionMessage {
  role: Message["role"]
  content: string
}

interface Session {
  id: string
  title: string
  message_count: number
  tokens_used: number
  updated_at: string
  model: string
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
type SpeechRecognitionWindow = typeof window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

/* ─── CONSTANTS ──────────────────────────────────────────────────────────────── */
const C = {
  bg: "#070B12", surface: "#0C1018", surface2: "#111827",
  border: "rgba(255,255,255,0.06)", border2: "rgba(255,255,255,0.1)",
  text: "#E2E8F0", muted: "#64748B", faint: "#1E293B",
  indigo: "#6366F1", violet: "#8B5CF6", emerald: "#10B981",
  amber: "#F59E0B", rose: "#F43F5E", cyan: "#22D3EE",
}

const QUICK_ACTIONS = [
  { icon: Code,       label: "Explain",   prompt: "Explain this code in detail:\n\n",              color: "#60A5FA" },
  { icon: Zap,        label: "Fix Bug",   prompt: "Find and fix ALL bugs:\n\n",                    color: "#FBBF24" },
  { icon: Shield,     label: "Security",  prompt: "Security audit this code:\n\n",                 color: "#F87171" },
  { icon: TrendingUp, label: "Optimize",  prompt: "Optimize for performance:\n\n",                 color: "#34D399" },
  { icon: Terminal,   label: "Tests",     prompt: "Write comprehensive tests:\n\n",                color: "#A78BFA" },
  { icon: FileText,   label: "Document",  prompt: "Add documentation:\n\n",                        color: "#22D3EE" },
  { icon: RefreshCw,  label: "Refactor",  prompt: "Refactor following best practices:\n\n",        color: "#FB923C" },
  { icon: Lightbulb,  label: "Improve",   prompt: "Suggest a better approach:\n\n",                color: "#F472B6" },
  { icon: Search,     label: "Review",    prompt: "Senior developer code review:\n\n",             color: "#818CF8" },
  { icon: Sparkles,   label: "Generate",  prompt: "Generate production-ready code for:\n\n",       color: "#10B981" },
  { icon: BookOpen,   label: "Explain Concept", prompt: "Explain this concept in simple terms:\n\n", color: "#F59E0B" },
  { icon: Hash,       label: "Regex",     prompt: "Write a regex pattern for:\n\n",                color: "#EC4899" },
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

const REACTIONS = ["👍", "👎", "❤️"] as const

const PROMPT_TEMPLATES = [
  { label: "API Design",      prompt: "Design a RESTful API for a " },
  { label: "DB Schema",       prompt: "Design a database schema for: " },
  { label: "Architecture",    prompt: "Suggest an architecture for: " },
  { label: "Code Review",     prompt: "Do a thorough code review of:\n\n" },
  { label: "Error Debug",     prompt: "Help me debug this error:\n\n" },
  { label: "Git Message",     prompt: "Write a conventional git commit message for: " },
  { label: "Regex Helper",    prompt: "Write a regex to match: " },
  { label: "SQL Query",       prompt: "Write an optimized SQL query to: " },
]

/* ─── HELPERS ────────────────────────────────────────────────────────────────── */
function getLocalPins(sessionId: string): string[] {
  try { return JSON.parse(localStorage.getItem(`fd_pins_${sessionId}`) || "[]") } catch { return [] }
}
function setLocalPins(sessionId: string, ids: string[]) {
  localStorage.setItem(`fd_pins_${sessionId}`, JSON.stringify(ids))
}
function getLocalBookmarks(): string[] {
  try { return JSON.parse(localStorage.getItem("fd_ai_bookmarks") || "[]") } catch { return [] }
}
function setLocalBookmarks(ids: string[]) {
  localStorage.setItem("fd_ai_bookmarks", JSON.stringify(ids))
}

/* ─── MESSAGE CONTENT RENDERER ───────────────────────────────────────────────── */
function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.split("\n")
          const lang = lines[0].replace("```", "").trim() || "code"
          const code = lines.slice(1, -1).join("\n")
          return (
            <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border2}`, margin: "4px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    {["#EF4444","#F59E0B","#10B981"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.7 }} />)}
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{lang}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied!") }}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
                    <Copy size={10} />Copy
                  </button>
                  <button onClick={() => {
                    const blob = new Blob([code], { type: "text/plain" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a"); a.href = url; a.download = `snippet.${lang}`; a.click()
                    URL.revokeObjectURL(url); toast.success("Downloaded!")
                  }}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
                    <Download size={10} />Save
                  </button>
                </div>
              </div>
              <pre style={{ padding: "14px 16px", background: "#050810", overflowX: "auto", margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                <code style={{ color: "#86EFAC", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>{code}</code>
              </pre>
              <div style={{ padding: "4px 14px", background: C.surface2, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{code.split("\n").length} lines • {code.length} chars</span>
              </div>
            </div>
          )
        }
        return (
          <div key={i} style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.75 }}>
            {part.split("\n").map((line, j) => {
              const withBold = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#F8FAFC;font-weight:600">$1</strong>')
              const withItalic = withBold.replace(/\*(.*?)\*/g, '<em style="color:#CBD5E1">$1</em>')
              const withCode = withItalic.replace(/`([^`]+)`/g, '<code style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.2);border-radius:4px;padding:1px 6px;font-family:monospace;font-size:12px;color:#A5B4FC">$1</code>')
              if (line.startsWith("# ")) return <h1 key={j} style={{ fontSize: 18, fontWeight: 700, color: "#F8FAFC", margin: "14px 0 6px" }}>{line.slice(2)}</h1>
              if (line.startsWith("## ")) return <h2 key={j} style={{ fontSize: 16, fontWeight: 600, color: "#F1F5F9", margin: "10px 0 4px" }}>{line.slice(3)}</h2>
              if (line.startsWith("### ")) return <h3 key={j} style={{ fontSize: 14, fontWeight: 600, color: "#A5B4FC", margin: "8px 0 3px" }}>{line.slice(4)}</h3>
              if (line.startsWith("> ")) return <blockquote key={j} style={{ borderLeft: `3px solid ${C.indigo}`, paddingLeft: 12, margin: "4px 0", color: C.muted, fontStyle: "italic" }} dangerouslySetInnerHTML={{ __html: withCode.slice(2) }} />
              if (line.startsWith("- ") || line.startsWith("• ")) return (
                <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "2px 0" }}>
                  <span style={{ color: C.indigo, marginTop: 3, flexShrink: 0 }}>•</span>
                  <span dangerouslySetInnerHTML={{ __html: withCode.slice(2) }} />
                </div>
              )
              if (/^\d+\./.test(line)) return (
                <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "2px 0" }}>
                  <span style={{ color: C.indigo, fontFamily: "monospace", fontSize: 11, marginTop: 3, flexShrink: 0 }}>{line.match(/^\d+/)?.[0]}.</span>
                  <span dangerouslySetInnerHTML={{ __html: withCode.replace(/^\d+\.\s*/, "") }} />
                </div>
              )
              if (line === "") return <div key={j} style={{ height: 6 }} />
              return <p key={j} style={{ margin: "2px 0" }} dangerouslySetInnerHTML={{ __html: withCode }} />
            })}
          </div>
        )
      })}
    </div>
  )
}

/* ─── THINKING ANIMATION ─────────────────────────────────────────────────────── */
function ThinkingDots() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Brain size={16} color="#fff" style={{ animation: "pulse 2s infinite" }} />
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px 14px 14px 4px", padding: "12px 16px" }}>
        <div style={{ fontSize: 11, color: C.indigo, marginBottom: 8, fontWeight: 600 }}>Thinking deeply… {elapsed > 0 ? `(${elapsed}s)` : ""}</div>
        <div style={{ display: "flex", gap: 5 }}>
          {[0, 150, 300].map(d => (
            <div key={d} style={{ width: 8, height: 8, background: C.indigo, borderRadius: "50%", animation: "bounce 1s infinite", animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── STATS MODAL ────────────────────────────────────────────────────────────── */
function StatsModal({ messages, sessions, usage, onClose }: {
  messages: Message[]; sessions: Session[]
  usage: { used_today: number; remaining: number | string; limit: number | string }
  onClose: () => void
}) {
  const totalWords = messages.filter(m => m.role === "assistant").reduce((acc, m) => acc + m.content.split(/\s+/).length, 0)
  const totalTokens = messages.reduce((acc, m) => acc + (m.tokens || 0), 0)
  const codeBlocks = messages.filter(m => m.role === "assistant").reduce((acc, m) => acc + (m.content.match(/```/g) || []).length / 2, 0)
  const avgResponse = messages.filter(m => m.role === "assistant").length > 0
    ? Math.round(totalWords / messages.filter(m => m.role === "assistant").length)
    : 0

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 440, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 size={15} color={C.indigo} />Session Stats
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Messages", value: messages.length, color: C.indigo },
            { label: "AI Replies", value: messages.filter(m => m.role === "assistant").length, color: C.violet },
            { label: "Total Tokens", value: totalTokens.toLocaleString(), color: C.cyan },
            { label: "Code Blocks", value: Math.round(codeBlocks), color: C.emerald },
            { label: "Words Generated", value: totalWords.toLocaleString(), color: C.amber },
            { label: "Avg Words/Reply", value: avgResponse, color: "#F472B6" },
            { label: "Sessions Total", value: sessions.length, color: C.muted },
            { label: "Used Today", value: usage.used_today, color: C.rose },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── PROMPT TEMPLATES PANEL ─────────────────────────────────────────────────── */
function TemplatesPanel({ onSelect, onClose }: { onSelect: (p: string) => void; onClose: () => void }) {
  return (
    <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", zIndex: 100, boxShadow: "0 -8px 32px rgba(0,0,0,0.5)" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Prompt Templates</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={13} /></button>
      </div>
      <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 200, overflowY: "auto" }}>
        {PROMPT_TEMPLATES.map(t => (
          <button key={t.label} onClick={() => { onSelect(t.prompt); onClose() }} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 10px", cursor: "pointer", textAlign: "left", fontSize: 12, color: C.muted,
            transition: "all 0.12s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.indigo; (e.currentTarget as HTMLElement).style.color = C.text }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted }}
          >{t.label}</button>
        ))}
      </div>
    </div>
  )
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────────────── */
export default function AIAssistant() {
  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputAreaRef = useRef<HTMLDivElement>(null)

  /* Core state */
  const [messages, setMessages] = useState<Message[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState({ used_today: 0, remaining: 20 as number | string, limit: 20 as number | string })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)

  /* Enhanced features state */
  const [showStats, setShowStats] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [sessionSearch, setSessionSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md")
  const [isListening, setIsListening] = useState(false)
  const [pinnedMsgIds, setPinnedMsgIds] = useState<string[]>([])
  const [bookmarkedMsgIds, setBookmarkedMsgIds] = useState<string[]>(getLocalBookmarks())
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showPinned, setShowPinned] = useState(false)
  const [charCount, setCharCount] = useState(0)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])
  useEffect(() => { loadUsage(); loadSessions() }, []) // eslint-disable-line

  const loadUsage = async () => {
    try {
      const { data } = await api.get("/ai/usage")
      setUsage(data)
    } catch (error) {
      console.error("Failed to load usage", error)
    }
  }

  const loadSessions = async () => {
    try {
      const { data } = await api.get("/ai/sessions")
      setSessions(data.sessions || [])
    } catch (error) {
      console.error("Failed to load sessions", error)
    }
  }

  const loadSession = async (sessionId: string) => {
    setLoadingSession(true)
    try {
      const { data } = await api.get<{ session: { messages: SessionMessage[]; created_at: string } }>(`/ai/sessions/${sessionId}`)
      const msgs: Message[] = (data.session.messages || []).map((m, i) => ({
        id: `${sessionId}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: new Date(data.session.created_at),
      }))
      setMessages(msgs)
      setCurrentSessionId(sessionId)
      setPinnedMsgIds(getLocalPins(sessionId))
      if (window.innerWidth < 768) setShowSidebar(false)
    } catch {
      toast.error("Failed to load session")
    } finally {
      setLoadingSession(false)
    }
  }

  const startNewChat = () => {
    setMessages([])
    setCurrentSessionId(null)
    setInput("")
    setPinnedMsgIds([])
    setShowSearch(false)
    setSearchQuery("")
    if (window.innerWidth < 768) setShowSidebar(false)
    inputRef.current?.focus()
  }

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.delete(`/ai/sessions/${sessionId}`)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (currentSessionId === sessionId) startNewChat()
      toast.success("Session deleted")
    } catch {
      toast.error("Failed to delete")
    }
  }

  /* ── Voice Input ─────────────────────────────────────────────────── */
  const toggleVoice = useCallback(() => {
    const speechWindow = window as SpeechRecognitionWindow
    const SpeechRecognitionApi = speechWindow.webkitSpeechRecognition ?? speechWindow.SpeechRecognition
    if (!SpeechRecognitionApi) {
      toast.error("Speech recognition not supported in this browser")
      return
    }
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const recognition = new SpeechRecognitionApi()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = "en-US"
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript
      setInput(prev => prev + (prev ? " " : "") + transcript)
      setCharCount(prev => prev + transcript.length)
      setIsListening(false)
    }
    recognition.onerror = () => { setIsListening(false); toast.error("Voice input failed") }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    toast("Listening… speak now 🎤", { duration: 3000 })
  }, [isListening])

  /* ── Send message ────────────────────────────────────────────────── */
  const sendMessage = useCallback(async (messageText?: string) => {
    const text = messageText || input
    if (!text.trim() || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput("")
    setCharCount(0)
    setLoading(true)

    try {
      const conversationMsgs = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const { data } = await api.post("/ai/chat", {
        messages: conversationMsgs,
        session_id: currentSessionId,
      })

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        tokens: data.tokens_used,
        intent: data.intent,
      }

      setMessages(prev => [...prev, aiMsg])
      setCurrentSessionId(data.session_id)
      setUsage(prev => ({
        ...prev,
        used_today: prev.used_today + 1,
        remaining: typeof prev.remaining === "number" ? Math.max(0, prev.remaining - 1) : prev.remaining,
      }))
      loadSessions()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number } }
      const detail = e.response?.data?.detail || ""
      if (detail.includes("All AI models") || detail.includes("temporarily unavailable")) {
        toast.error("⚠️ All AI services are busy. Please try again in 1-2 hours.", { duration: 8000 })
        setUsage(prev => ({ ...prev, remaining: 0, used_today: typeof prev.limit === "number" ? prev.limit : 20 }))
      } else if (detail.includes("Daily limit") || detail.includes("Free tier limit")) {
        toast.error("Daily limit reached. Upgrade to Pro!", { duration: 5000 })
        setUsage(prev => ({ ...prev, remaining: 0 }))
      } else {
        toast.error(detail || "AI error. Try again.")
      }
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      setInput(userMsg.content)
      setCharCount(userMsg.content.length)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, messages, currentSessionId])

  /* ── Copy ────────────────────────────────────────────────────────── */
  const handleCopy = (msg: Message) => {
    navigator.clipboard.writeText(msg.content)
    setCopiedId(msg.id)
    toast.success("Copied!")
    setTimeout(() => setCopiedId(null), 2000)
  }

  /* ── Export chat ─────────────────────────────────────────────────── */
  const handleExportChat = () => {
    if (messages.length === 0) { toast.error("No messages to export"); return }
    const md = messages.map(m => `**${m.role === "user" ? "You" : "AI"}** (${m.timestamp.toLocaleTimeString()})\n\n${m.content}`).join("\n\n---\n\n")
    const blob = new Blob([md], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `chat-${Date.now()}.md`; a.click()
    URL.revokeObjectURL(url)
    toast.success("Chat exported as Markdown!")
  }

  /* ── Pin message ─────────────────────────────────────────────────── */
  const togglePin = (msgId: string) => {
    const next = pinnedMsgIds.includes(msgId) ? pinnedMsgIds.filter(id => id !== msgId) : [...pinnedMsgIds, msgId]
    setPinnedMsgIds(next)
    if (currentSessionId) setLocalPins(currentSessionId, next)
    toast(pinnedMsgIds.includes(msgId) ? "Unpinned" : "Pinned 📌")
  }

  /* ── Bookmark message ────────────────────────────────────────────── */
  const toggleBookmark = (msgId: string) => {
    const next = bookmarkedMsgIds.includes(msgId) ? bookmarkedMsgIds.filter(id => id !== msgId) : [...bookmarkedMsgIds, msgId]
    setBookmarkedMsgIds(next)
    setLocalBookmarks(next)
    toast(bookmarkedMsgIds.includes(msgId) ? "Bookmark removed" : "Bookmarked! ⭐")
  }

  /* ── React to message ────────────────────────────────────────────── */
  const addReaction = (msgId: string, reaction: typeof REACTIONS[number]) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: m.reaction === reaction ? null : reaction } : m))
  }

  /* ── Share message ───────────────────────────────────────────────── */
  const shareMessage = (msg: Message) => {
    if (navigator.share) {
      navigator.share({ title: "FlowDesk AI", text: msg.content }).catch(() => {})
    } else {
      navigator.clipboard.writeText(msg.content)
      toast.success("Copied to clipboard for sharing!")
    }
  }

  /* ── Read aloud ──────────────────────────────────────────────────── */
  const readAloud = (text: string) => {
    if (!("speechSynthesis" in window)) { toast.error("TTS not supported"); return }
    window.speechSynthesis.cancel()
    const plain = text.replace(/```[\s\S]*?```/g, "").replace(/[#*`]/g, "").trim()
    const utt = new SpeechSynthesisUtterance(plain)
    utt.rate = 1.1; utt.pitch = 1
    window.speechSynthesis.speak(utt)
    toast("Reading aloud 🔊", { duration: 2000 })
  }

  /* ── Computed ────────────────────────────────────────────────────── */
  const isLimitReached = user?.plan === "free" && usage.remaining === 0
  const remainingNum = typeof usage.remaining === "number" ? usage.remaining : 999
  const limitNum = typeof usage.limit === "number" ? usage.limit : 20
  const remainingPercent = Math.min(100, (remainingNum / limitNum) * 100)

  const filteredSessions = sessions.filter(s =>
    sessionSearch === "" || s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  )

  const displayMessages = searchQuery
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  const pinnedMessages = messages.filter(m => pinnedMsgIds.includes(m.id))
  const bookmarkedMessages = messages.filter(m => bookmarkedMsgIds.includes(m.id))

  const fontSizeMap = { sm: 12, md: 14, lg: 16 }

  /* ─── RENDER ──────────────────────────────────────────────────────── */
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 99px; }
        * { box-sizing: border-box; }
        textarea { font-family: inherit; }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "0 12px", height: 54, display: "flex", alignItems: "center", gap: 8, flexShrink: 0, zIndex: 40 }}>
        <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 6, borderRadius: 8 }}>
          <ArrowLeft size={18} />
        </button>

        <button onClick={() => setShowSidebar(o => !o)} style={{
          background: showSidebar ? "rgba(99,102,241,0.12)" : "none", border: "none", cursor: "pointer",
          color: showSidebar ? C.indigo : C.muted, display: "flex", padding: 6, borderRadius: 8,
        }}>
          {showSidebar ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Brain size={17} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>FlowDesk AI</span>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.15)", color: C.indigo, border: `1px solid rgba(99,102,241,0.25)`, display: "none" }} className="lg-show">Llama 3.3 70B</span>
              {currentSessionId && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: C.emerald, border: `1px solid rgba(16,185,129,0.2)`, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.emerald, animation: "pulse 2s infinite" }} />
                  Memory On
                </span>
              )}
              {loading && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.08)", color: C.indigo, display: "flex", alignItems: "center", gap: 4 }}>
                  <Brain size={9} style={{ animation: "spin 1s linear infinite" }} />Thinking…
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: C.muted, display: "none" }} className="md-show">Groq Powered • Ultra Fast • Context Aware</div>
          </div>
        </div>

        {/* Header right actions */}
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
          {/* Usage bar - desktop only */}
          {user?.plan === "free" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 4 }}>
              <div style={{ width: 60, height: 4, background: C.faint, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, width: `${remainingPercent}%`, background: remainingPercent > 50 ? C.emerald : remainingPercent > 20 ? C.amber : C.rose, transition: "width 0.5s" }} />
              </div>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>{usage.remaining}/{usage.limit}</span>
            </div>
          )}
          {user?.plan === "pro" && (
            <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: C.emerald, border: `1px solid rgba(16,185,129,0.2)`, display: "flex", alignItems: "center", gap: 4 }}>
              <Sparkles size={9} />Unlimited
            </span>
          )}

          {/* Search toggle */}
          {messages.length > 0 && (
            <button onClick={() => setShowSearch(s => !s)} title="Search messages" style={{ background: showSearch ? "rgba(99,102,241,0.12)" : "none", border: "none", cursor: "pointer", color: showSearch ? C.indigo : C.muted, padding: 6, borderRadius: 8, display: "flex" }}>
              <Search size={15} />
            </button>
          )}

          {/* Font size */}
          <button onClick={() => setFontSize(s => s === "sm" ? "md" : s === "md" ? "lg" : "sm")} title="Font size" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 6, borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
            A{fontSize === "sm" ? "↓" : fontSize === "lg" ? "↑" : ""}
          </button>

          {/* Stats */}
          {messages.length > 0 && (
            <button onClick={() => setShowStats(true)} title="Stats" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 6, borderRadius: 8, display: "flex" }}>
              <BarChart2 size={15} />
            </button>
          )}

          {/* Export */}
          {messages.length > 0 && (
            <button onClick={handleExportChat} title="Export chat" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 6, borderRadius: 8, display: "flex" }}>
              <Download size={15} />
            </button>
          )}

          {/* New chat */}
          <button onClick={startNewChat} style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 12,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "5px 10px", color: C.muted, cursor: "pointer",
          }}>
            <Plus size={13} /><span>New</span>
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <Search size={13} color={C.muted} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search in conversation…" autoFocus
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 13 }} />
          {searchQuery && <span style={{ fontSize: 11, color: C.muted }}>{displayMessages.length} results</span>}
          <button onClick={() => { setShowSearch(false); setSearchQuery("") }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={13} /></button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
        {showSidebar && (
          <button type="button" onClick={() => setShowSidebar(false)} aria-label="Close sidebar"
            style={{ position: "fixed", inset: 0, top: 54, background: "rgba(0,0,0,0.6)", zIndex: 20, border: "none", cursor: "pointer", display: "block" }}
            className="md-hide"
          />
        )}

        {showSidebar && (
          <div style={{
            position: "fixed", left: 0, top: 54, bottom: 0, zIndex: 30,
            width: "min(82vw, 280px)", background: C.surface,
            borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
            boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
          }}>
            {/* Sidebar header */}
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <input value={sessionSearch} onChange={e => setSessionSearch(e.target.value)}
                placeholder="Search sessions…"
                style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", color: C.text, fontSize: 12, outline: "none" }} />
              <button onClick={() => setShowSidebar(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}>
                <PanelLeftClose size={15} />
              </button>
            </div>

            {/* View toggles */}
            <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 5 }}>
              <button onClick={() => { setShowBookmarks(false); setShowPinned(false) }} style={{
                flex: 1, fontSize: 11, padding: "4px", borderRadius: 6, border: "none", cursor: "pointer",
                background: !showBookmarks && !showPinned ? "rgba(99,102,241,0.15)" : "transparent",
                color: !showBookmarks && !showPinned ? C.indigo : C.muted,
              }}>History</button>
              <button onClick={() => { setShowBookmarks(false); setShowPinned(true) }} style={{
                flex: 1, fontSize: 11, padding: "4px", borderRadius: 6, border: "none", cursor: "pointer",
                background: showPinned ? "rgba(249,115,22,0.15)" : "transparent",
                color: showPinned ? "#FB923C" : C.muted,
              }}><Pin size={10} style={{ display: "inline", marginRight: 3 }} />Pinned</button>
              <button onClick={() => { setShowPinned(false); setShowBookmarks(true) }} style={{
                flex: 1, fontSize: 11, padding: "4px", borderRadius: 6, border: "none", cursor: "pointer",
                background: showBookmarks ? "rgba(245,158,11,0.15)" : "transparent",
                color: showBookmarks ? C.amber : C.muted,
              }}><Bookmark size={10} style={{ display: "inline", marginRight: 3 }} />Saved</button>
            </div>

            {/* New chat button */}
            <div style={{ padding: "8px 10px" }}>
              <button onClick={startNewChat} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 8, border: `1px solid ${!currentSessionId ? "rgba(99,102,241,0.3)" : C.border}`,
                background: !currentSessionId ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)",
                color: !currentSessionId ? C.indigo : C.muted, cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}>
                <Plus size={14} />New Conversation
              </button>
            </div>

            {/* Session list / pinned / bookmarks */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
              {showPinned ? (
                pinnedMessages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 12 }}>No pinned messages</div>
                ) : pinnedMessages.map(m => (
                  <div key={m.id} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(249,115,22,0.06)", border: `1px solid rgba(249,115,22,0.15)`, marginBottom: 5, fontSize: 12, color: C.text, cursor: "pointer" }}
                    onClick={() => {
                      const el = document.getElementById(`msg-${m.id}`)
                      el?.scrollIntoView({ behavior: "smooth", block: "center" })
                      if (window.innerWidth < 768) setShowSidebar(false)
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <Pin size={9} color="#FB923C" />
                      <span style={{ fontSize: 10, color: C.muted }}>{m.role === "user" ? "You" : "AI"}</span>
                    </div>
                    <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{m.content.slice(0, 80)}</p>
                  </div>
                ))
              ) : showBookmarks ? (
                bookmarkedMessages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 12 }}>No bookmarks yet</div>
                ) : bookmarkedMessages.map(m => (
                  <div key={m.id} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(245,158,11,0.06)", border: `1px solid rgba(245,158,11,0.15)`, marginBottom: 5, cursor: "pointer" }}
                    onClick={() => {
                      const el = document.getElementById(`msg-${m.id}`)
                      el?.scrollIntoView({ behavior: "smooth", block: "center" })
                      if (window.innerWidth < 768) setShowSidebar(false)
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <Star size={9} color={C.amber} />
                      <span style={{ fontSize: 10, color: C.muted }}>{m.role === "user" ? "You" : "AI"}</span>
                    </div>
                    <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: C.text }}>{m.content.slice(0, 80)}</p>
                  </div>
                ))
              ) : filteredSessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <MessageSquare size={28} color={C.faint} style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 12, color: C.muted }}>No sessions found</p>
                </div>
              ) : (
                filteredSessions.map(session => (
                  <div key={session.id} onClick={() => loadSession(session.id)} style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 10px",
                    borderRadius: 8, cursor: "pointer", marginBottom: 3,
                    background: currentSessionId === session.id ? "rgba(99,102,241,0.1)" : "transparent",
                    border: `1px solid ${currentSessionId === session.id ? "rgba(99,102,241,0.25)" : "transparent"}`,
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { if (currentSessionId !== session.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)" }}
                  onMouseLeave={e => { if (currentSessionId !== session.id) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                  >
                    <MessageSquare size={12} color={C.muted} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.title}</p>
                      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: C.muted, display: "flex", alignItems: "center", gap: 3 }}>
                          <Clock size={8} />{new Date(session.updated_at).toLocaleDateString()}
                        </span>
                        <span style={{ fontSize: 10, color: C.muted }}>{session.message_count} msgs</span>
                      </div>
                    </div>
                    <DeleteButton onClick={e => void deleteSession(session.id, e)} title={`Delete ${session.title}`} aria-label={`Delete ${session.title}`} />
                  </div>
                ))
              )}
            </div>

            {/* Memory indicator */}
            {currentSessionId && (
              <div style={{ padding: 10, borderTop: `1px solid ${C.border}` }}>
                <div style={{ background: "rgba(16,185,129,0.08)", border: `1px solid rgba(16,185,129,0.2)`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <Brain size={11} color={C.emerald} />
                    <span style={{ fontSize: 11, color: C.emerald, fontWeight: 600 }}>Memory Active</span>
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(16,185,129,0.5)", margin: 0, lineHeight: 1.4 }}>AI remembers your entire conversation context.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MAIN CHAT AREA ──────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, fontSize: fontSizeMap[fontSize] }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {loadingSession ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <Loader2 size={28} color={C.indigo} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : displayMessages.length === 0 && !loading ? (
              /* ── EMPTY STATE ── */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "32px 16px", textAlign: "center" }}>
                <div style={{ width: 72, height: 72, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0 12px 40px rgba(99,102,241,0.3)" }}>
                  <Brain size={34} color="#fff" />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 8 }}>FlowDesk AI Assistant</h2>
                <p style={{ fontSize: 13, color: C.muted, maxWidth: 400, marginBottom: 4, lineHeight: 1.6 }}>
                  Your personal senior developer. Ask anything — code, architecture, debugging, docs.
                </p>
                <p style={{ fontSize: 11, color: C.muted, marginBottom: 28, display: "flex", alignItems: "center", gap: 5 }}>
                  <Brain size={10} />Powered by Llama 3.3 70B via Groq
                </p>

                {/* Quick actions grid */}
                <div style={{ width: "100%", maxWidth: 680, marginBottom: 24 }}>
                  <p style={{ fontSize: 10, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Quick Actions</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                    {QUICK_ACTIONS.map(action => (
                      <button key={action.label} onClick={() => { setInput(action.prompt); inputRef.current?.focus() }} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                        padding: "12px 8px", background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.indigo; (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)" }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.surface }}
                      >
                        <action.icon size={16} style={{ color: action.color }} />
                        <span style={{ fontSize: 11, color: C.muted }}>{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keyboard hints */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {[["Enter","Send"],["Shift+Enter","New line"],["Paste code","Directly"]].map(([k, l]) => (
                    <span key={k} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, color: C.muted }}>
                      <span style={{ color: C.indigo, fontFamily: "monospace" }}>{k}</span> — {l}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              /* ── MESSAGES ── */
              <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 14px 12px", display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Pinned banner */}
                {pinnedMessages.length > 0 && !showSearch && (
                  <div style={{ background: "rgba(249,115,22,0.06)", border: `1px solid rgba(249,115,22,0.2)`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Pin size={12} color="#FB923C" />
                    <span style={{ fontSize: 12, color: "#FB923C", fontWeight: 600 }}>{pinnedMessages.length} pinned message{pinnedMessages.length > 1 ? "s" : ""}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>— click Pinned in sidebar to view</span>
                  </div>
                )}

                {displayMessages.map((message, idx) => {
                  const isPinned = pinnedMsgIds.includes(message.id)
                  const isBookmarked = bookmarkedMsgIds.includes(message.id)
                  const intentStyle = INTENT_COLORS[message.intent || "general"] || INTENT_COLORS.general
                  const isHighlighted = searchQuery && message.content.toLowerCase().includes(searchQuery.toLowerCase())

                  return (
                    <div key={message.id} id={`msg-${message.id}`} style={{
                      display: "flex", gap: 10, justifyContent: message.role === "user" ? "flex-end" : "flex-start",
                      outline: isHighlighted ? `2px solid rgba(99,102,241,0.4)` : "none",
                      borderRadius: isHighlighted ? 12 : 0,
                    }}>
                      {/* AI avatar */}
                      {message.role === "assistant" && (
                        <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          <Brain size={15} color="#fff" />
                        </div>
                      )}

                      <div style={{ maxWidth: "90%", display: "flex", flexDirection: "column", alignItems: message.role === "user" ? "flex-end" : "flex-start", gap: 4 }}>
                        {/* Pin/bookmark indicator */}
                        {(isPinned || isBookmarked) && (
                          <div style={{ display: "flex", gap: 4 }}>
                            {isPinned && <span style={{ fontSize: 9, color: "#FB923C", display: "flex", alignItems: "center", gap: 2 }}><Pin size={8} />Pinned</span>}
                            {isBookmarked && <span style={{ fontSize: 9, color: C.amber, display: "flex", alignItems: "center", gap: 2 }}><Star size={8} />Saved</span>}
                          </div>
                        )}

                        {/* Bubble */}
                        <div style={{
                          padding: "12px 16px", borderRadius: message.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                          background: message.role === "user" ? "linear-gradient(135deg,#6366F1,#5855EB)" : C.surface,
                          border: message.role === "assistant" ? `1px solid ${isPinned ? "rgba(249,115,22,0.3)" : C.border}` : "none",
                          maxWidth: "100%",
                        }}>
                          {message.role === "assistant"
                            ? <MessageContent content={message.content} />
                            : <p style={{ fontSize: fontSizeMap[fontSize], color: "#fff", whiteSpace: "pre-wrap", lineHeight: 1.65, margin: 0 }}>{message.content}</p>
                          }
                        </div>

                        {/* Reaction */}
                        {message.reaction && (
                          <span style={{ fontSize: 16 }}>{message.reaction}</span>
                        )}

                        {/* Meta row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 2 }}>
                          <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
                            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>

                          {message.intent && message.intent !== "general" && (
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: intentStyle.bg, color: intentStyle.text }}>
                              {message.intent}
                            </span>
                          )}

                          {message.tokens && (
                            <span style={{ fontSize: 10, color: C.muted }}>{message.tokens.toLocaleString()}t</span>
                          )}

                          {/* Action buttons */}
                          {message.role === "assistant" && (
                            <>
                              <button onClick={() => handleCopy(message)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                                {copiedId === message.id ? <><Check size={10} color={C.emerald} /><span style={{ color: C.emerald }}>Copied</span></> : <><Copy size={10} />Copy</>}
                              </button>
                              <button onClick={() => togglePin(message.id)} style={{ background: "none", border: "none", cursor: "pointer", color: isPinned ? "#FB923C" : C.muted, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                                <Pin size={10} />
                              </button>
                              <button onClick={() => toggleBookmark(message.id)} style={{ background: "none", border: "none", cursor: "pointer", color: isBookmarked ? C.amber : C.muted, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                                <Star size={10} />
                              </button>
                              <button onClick={() => readAloud(message.content)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                                <Volume2 size={10} />
                              </button>
                              <button onClick={() => shareMessage(message)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                                <Share2 size={10} />
                              </button>
                              {/* Reactions */}
                              {REACTIONS.map(r => (
                                <button key={r} onClick={() => addReaction(message.id, r)} style={{
                                  background: "none", border: "none", cursor: "pointer", fontSize: 12,
                                  opacity: message.reaction === r ? 1 : 0.35, transition: "opacity 0.15s",
                                }}>{r}</button>
                              ))}
                              {idx > 0 && (
                                <button onClick={() => {
                                  const prevUser = messages.slice(0, idx).reverse().find(m => m.role === "user")
                                  if (prevUser) sendMessage(prevUser.content)
                                }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                                  <RefreshCw size={10} />Retry
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* User avatar */}
                      {message.role === "user" && (
                        <div style={{ width: 34, height: 34, background: C.surface2, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, border: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                            {user?.display_name?.charAt(0).toUpperCase() || "U"}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {loading && <ThinkingDots />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── INPUT AREA ───────────────────────────────────────────── */}
          <div ref={inputAreaRef} style={{ borderTop: `1px solid ${C.border}`, background: C.surface, padding: "10px 14px 12px", flexShrink: 0 }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>

              {/* Limit warning */}
              {isLimitReached && (
                <div style={{ marginBottom: 10, padding: "10px 14px", background: "rgba(244,63,94,0.08)", border: `1px solid rgba(244,63,94,0.25)`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={13} color={C.rose} />
                    <span style={{ fontSize: 13, color: C.rose }}>Daily limit reached. Upgrade to Pro for unlimited AI.</span>
                  </div>
                  <button onClick={() => toast("🚀 Pro plan coming soon!", { duration: 4000 })} style={{ fontSize: 11, background: C.rose, border: "none", borderRadius: 6, padding: "5px 12px", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Upgrade</button>
                </div>
              )}

              {/* Quick actions scrollable bar */}
              <div style={{ display: "flex", gap: 5, marginBottom: 8, overflowX: "auto", paddingBottom: 2 }}>
                {QUICK_ACTIONS.slice(0, 8).map(action => (
                  <button key={action.label} onClick={() => { setInput(action.prompt); inputRef.current?.focus() }} style={{
                    flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                    borderRadius: 7, padding: "4px 10px", color: C.muted, cursor: "pointer", transition: "all 0.12s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.text; (e.currentTarget as HTMLElement).style.borderColor = C.border2 }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted; (e.currentTarget as HTMLElement).style.borderColor = C.border }}
                  >
                    <action.icon size={11} style={{ color: action.color }} />{action.label}
                  </button>
                ))}
              </div>

              {/* Textarea row */}
              <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "flex-end" }}>
                {/* Templates popup */}
                {showTemplates && (
                  <TemplatesPanel onSelect={t => { setInput(t); inputRef.current?.focus() }} onClose={() => setShowTemplates(false)} />
                )}

                {/* Left side buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => setShowTemplates(t => !t)} title="Prompt templates" style={{
                    background: showTemplates ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "7px 8px", cursor: "pointer", color: showTemplates ? C.indigo : C.muted, display: "flex",
                  }}>
                    <Sparkles size={14} />
                  </button>
                  <button onClick={toggleVoice} title="Voice input" style={{
                    background: isListening ? "rgba(244,63,94,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${isListening ? "rgba(244,63,94,0.3)" : C.border}`,
                    borderRadius: 8, padding: "7px 8px", cursor: "pointer", color: isListening ? C.rose : C.muted, display: "flex",
                  }}>
                    {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                </div>

                {/* Textarea */}
                <div style={{ flex: 1, position: "relative" }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => { setInput(e.target.value); setCharCount(e.target.value.length) }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder={isLimitReached ? "Daily limit reached." : "Ask anything… paste code, describe problems, request generation"}
                    disabled={loading || isLimitReached}
                    rows={3}
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                      borderRadius: 10, padding: "10px 44px 10px 14px",
                      color: C.text, fontSize: fontSizeMap[fontSize], outline: "none", resize: "none",
                      lineHeight: 1.65, transition: "border-color 0.15s",
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(99,102,241,0.4)")}
                    onBlur={e => (e.target.style.borderColor = C.border)}
                  />
                  {charCount > 0 && (
                    <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: charCount > 3000 ? C.amber : C.muted, fontFamily: "monospace" }}>{charCount}</span>
                  )}
                </div>

                {/* Send button */}
                <button onClick={() => sendMessage()} disabled={!input.trim() || loading || isLimitReached} style={{
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg,#6366F1,#8B5CF6)", border: "none", borderRadius: 10,
                  padding: "0 16px", height: 88, cursor: (!input.trim() || loading || isLimitReached) ? "not-allowed" : "pointer",
                  opacity: (!input.trim() || loading || isLimitReached) ? 0.4 : 1, transition: "opacity 0.15s",
                  boxShadow: "0 4px 16px rgba(99,102,241,0.25)",
                }}>
                  {loading ? <Loader2 size={18} color="#fff" style={{ animation: "spin 1s linear infinite" }} /> : <Send size={18} color="#fff" />}
                </button>
              </div>

              {/* Footer hint */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, flexWrap: "wrap", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.muted }}>Enter to send • Shift+Enter new line</span>
                <span style={{ fontSize: 10, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                  <Brain size={9} />
                  {currentSessionId ? "Memory active — AI remembers context" : "Start chatting to enable memory"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Modal */}
      {showStats && (
        <StatsModal messages={messages} sessions={sessions} usage={usage} onClose={() => setShowStats(false)} />
      )}
    </div>
  )
}
