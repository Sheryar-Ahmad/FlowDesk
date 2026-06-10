import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft, Send, Copy, Check, Loader2,
  Code, FileText, Zap, Shield, RefreshCw,
  Sparkles, Terminal, Brain, Lightbulb,
  Search, AlertCircle,
  TrendingUp, Plus, Clock,
  MessageSquare, X
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import axios from "axios"
import toast from "react-hot-toast"

const api = axios.create({ baseURL: "http://localhost:8000/api/v1", timeout: 60000 })
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  tokens?: number
  intent?: string
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

const QUICK_ACTIONS = [
  { icon: Code, label: "Explain", prompt: "Explain this code in detail:\n\n", category: "explain", color: "text-blue-400" },
  { icon: Zap, label: "Fix Bug", prompt: "Find and fix ALL bugs:\n\n", category: "fix", color: "text-yellow-400" },
  { icon: Shield, label: "Security", prompt: "Security audit this code:\n\n", category: "security", color: "text-red-400" },
  { icon: TrendingUp, label: "Optimize", prompt: "Optimize for performance:\n\n", category: "optimize", color: "text-green-400" },
  { icon: Terminal, label: "Tests", prompt: "Write comprehensive tests:\n\n", category: "test", color: "text-purple-400" },
  { icon: FileText, label: "Document", prompt: "Add documentation:\n\n", category: "document", color: "text-cyan-400" },
  { icon: RefreshCw, label: "Refactor", prompt: "Refactor following best practices:\n\n", category: "refactor", color: "text-orange-400" },
  { icon: Lightbulb, label: "Improve", prompt: "Suggest a better approach:\n\n", category: "improve", color: "text-pink-400" },
  { icon: Search, label: "Review", prompt: "Senior developer code review:\n\n", category: "review", color: "text-indigo-400" },
  { icon: Sparkles, label: "Generate", prompt: "Generate production-ready code for:\n\n", category: "generate", color: "text-emerald-400" },
]

const INTENT_COLORS: Record<string, string> = {
  explain: "text-blue-400 bg-blue-950",
  fix: "text-yellow-400 bg-yellow-950",
  security: "text-red-400 bg-red-950",
  optimize: "text-green-400 bg-green-950",
  generate: "text-emerald-400 bg-emerald-950",
  review: "text-indigo-400 bg-indigo-950",
  general: "text-gray-400 bg-gray-800",
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g)
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.split("\n")
          const lang = lines[0].replace("```", "").trim() || "code"
          const code = lines.slice(1, -1).join("\n")
          return (
            <div key={i} className="rounded-xl overflow-hidden border border-gray-700 my-3">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-60" />
                  </div>
                  <span className="text-xs text-gray-400 font-mono">{lang}</span>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied!") }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors">
                  <Copy size={10} />Copy
                </button>
              </div>
              <pre className="p-4 bg-gray-950 overflow-x-auto text-sm font-mono leading-relaxed">
                <code className="text-green-300">{code}</code>
              </pre>
            </div>
          )
        }
        return (
          <div key={i} className="text-gray-200 text-sm leading-relaxed">
            {part.split("\n").map((line, j) => {
              const withBold = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
              const withCode = withBold.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-purple-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
              if (line.startsWith("# ")) return <h1 key={j} className="text-xl font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>
              if (line.startsWith("## ")) return <h2 key={j} className="text-lg font-semibold text-white mt-3 mb-1">{line.slice(3)}</h2>
              if (line.startsWith("### ")) return <h3 key={j} className="text-base font-semibold text-indigo-300 mt-2 mb-1">{line.slice(4)}</h3>
              if (line.startsWith("- ") || line.startsWith("• ")) return (
                <div key={j} className="flex items-start gap-2 my-0.5">
                  <span className="text-indigo-400 mt-1 flex-shrink-0">•</span>
                  <span dangerouslySetInnerHTML={{ __html: withCode }} />
                </div>
              )
              if (/^\d+\./.test(line)) return (
                <div key={j} className="flex items-start gap-2 my-0.5">
                  <span className="text-indigo-400 font-mono text-xs mt-1 flex-shrink-0">{line.match(/^\d+/)?.[0]}.</span>
                  <span dangerouslySetInnerHTML={{ __html: withCode }} />
                </div>
              )
              if (line === "") return <div key={j} className="h-2" />
              return <p key={j} className="my-0.5" dangerouslySetInnerHTML={{ __html: withCode }} />
            })}
          </div>
        )
      })}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-4">
      <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
        <Brain size={16} className="text-white animate-pulse" />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm px-5 py-4">
        <p className="text-indigo-400 text-xs mb-2 font-medium">Thinking deeply...</p>
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map(d => (
            <div key={d} className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AIAssistant() {
  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState({ used_today: 0, remaining: 20 as number | string, limit: 20 as number | string })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [loadingSession, setLoadingSession] = useState(false)

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

      // Refresh sessions list
      loadSessions()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number } }
      const detail = e.response?.data?.detail || ""
      
      if (detail.includes("All AI models") || detail.includes("temporarily unavailable")) {
        // All models exhausted - show clear message
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
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, messages, currentSessionId])

  const handleCopy = (msg: Message) => {
    navigator.clipboard.writeText(msg.content)
    setCopiedId(msg.id)
    toast.success("Copied!")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const isLimitReached = user?.plan === "free" && usage.remaining === 0
  const remainingNum = typeof usage.remaining === "number" ? usage.remaining : 999
  const limitNum = typeof usage.limit === "number" ? usage.limit : 20
  const remainingPercent = Math.min(100, (remainingNum / limitNum) * 100)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <button onClick={() => setShowSidebar(!showSidebar)} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <MessageSquare size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white font-bold text-sm">FlowDesk AI</h1>
                <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-800">Llama 3.3 70B</span>
                {currentSessionId && (
                  <span className="text-xs bg-green-950 text-green-400 px-2 py-0.5 rounded-full border border-green-800 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Memory Active
                  </span>
                )}
              </div>
              <p className="text-gray-600 text-xs">Groq Powered • Ultra Fast • Context Aware</p>
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-indigo-400 text-xs bg-indigo-950 px-3 py-1.5 rounded-lg border border-indigo-800 animate-pulse">
              <Brain size={12} className="animate-spin" />
              Thinking deeply...
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user?.plan === "free" && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${remainingPercent}%`,
                    backgroundColor: remainingPercent > 50 ? "#10b981" : remainingPercent > 20 ? "#f59e0b" : "#ef4444"
                  }} />
              </div>
              <span className="text-xs text-gray-400">{usage.remaining}/{usage.limit}</span>
            </div>
          )}
          {user?.plan === "pro" && (
            <span className="text-xs text-green-400 bg-green-950 px-2 py-1 rounded-full border border-green-800 flex items-center gap-1">
              <Sparkles size={10} />Unlimited
            </span>
          )}
          <button onClick={startNewChat}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700">
            <Plus size={13} />New Chat
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Sessions Sidebar */}
        {showSidebar && (
          <div className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Chat History</p>
              <span className="text-gray-600 text-xs">{sessions.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {/* New Chat Button */}
              <button onClick={startNewChat}
                className={`w-full flex items-center gap-2 p-2.5 rounded-lg mb-2 transition-all text-sm border ${
                  !currentSessionId
                    ? "bg-indigo-950 border-indigo-700 text-indigo-300"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                }`}>
                <Plus size={14} className="flex-shrink-0" />
                <span className="truncate font-medium">New Conversation</span>
              </button>

              {sessions.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="text-gray-700 mx-auto mb-2" size={28} />
                  <p className="text-gray-600 text-xs">No history yet</p>
                  <p className="text-gray-700 text-xs mt-1">Start chatting!</p>
                </div>
              ) : (
                sessions.map(session => (
                  <div key={session.id}
                    onClick={() => loadSession(session.id)}
                    className={`group flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-all mb-1 border ${
                      currentSessionId === session.id
                        ? "bg-indigo-950 border-indigo-800 text-white"
                        : "bg-transparent border-transparent hover:bg-gray-800 hover:border-gray-700 text-gray-400"
                    }`}
                  >
                    <MessageSquare size={13} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-white">{session.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-gray-600 text-xs flex items-center gap-1">
                          <Clock size={8} />
                          {new Date(session.updated_at).toLocaleDateString()}
                        </span>
                        <span className="text-gray-700 text-xs">{session.message_count} msgs</span>
                      </div>
                    </div>
                    <button onClick={(e) => deleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-0.5 rounded flex-shrink-0">
                      <X size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Memory indicator */}
            {currentSessionId && (
              <div className="p-3 border-t border-gray-800">
                <div className="bg-green-950 border border-green-800 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain size={12} className="text-green-400" />
                    <span className="text-green-400 text-xs font-medium">Memory Active</span>
                  </div>
                  <p className="text-green-700 text-xs">AI remembers this entire conversation and your coding context.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {loadingSession ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/30">
                  <Brain size={40} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">FlowDesk AI Assistant</h2>
                <p className="text-gray-500 text-center mb-1 max-w-lg text-sm">
                  Your personal senior developer. I think deeply and remember everything.
                </p>
                <p className="text-gray-700 text-xs mb-10 flex items-center gap-1">
                  <Brain size={10} />Powered by Llama 3.3 70B via Groq
                </p>

                <div className="w-full max-w-3xl mb-6">
                  <p className="text-gray-600 text-xs font-medium mb-3 uppercase tracking-wider text-center">Quick Actions</p>
                  <div className="grid grid-cols-5 gap-2">
                    {QUICK_ACTIONS.map(action => (
                      <button key={action.label}
                        onClick={() => { setInput(action.prompt); inputRef.current?.focus() }}
                        className="flex flex-col items-center gap-2 p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-indigo-500 hover:bg-gray-800 transition-all group">
                        <action.icon size={16} className={`${action.color} group-hover:scale-110 transition-transform`} />
                        <span className="text-xs text-gray-500 group-hover:text-white transition-colors">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-700">
                  <span className="bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">Enter to send</span>
                  <span className="bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">Shift+Enter new line</span>
                  <span className="bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">Paste code directly</span>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
                {messages.map((message, idx) => (
                  <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    {message.role === "assistant" && (
                      <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 shadow-lg shadow-indigo-500/20">
                        <Brain size={16} className="text-white" />
                      </div>
                    )}

                    <div className={`max-w-3xl flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                      <div className={`px-5 py-4 rounded-2xl ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-sm"
                          : "bg-gray-900 border border-gray-800 rounded-tl-sm"
                      }`}>
                        {message.role === "assistant"
                          ? <MessageContent content={message.content} />
                          : <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        }
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 px-1">
                        <span className="text-gray-700 text-xs">
                          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {message.intent && message.intent !== "general" && (
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${INTENT_COLORS[message.intent] || INTENT_COLORS.general}`}>
                            {message.intent}
                          </span>
                        )}
                        {message.tokens && (
                          <span className="text-gray-700 text-xs">{message.tokens.toLocaleString()} tokens</span>
                        )}
                        {message.role === "assistant" && (
                          <>
                            <button onClick={() => handleCopy(message)}
                              className="flex items-center gap-1 text-gray-700 hover:text-white transition-colors text-xs">
                              {copiedId === message.id
                                ? <><Check size={11} className="text-green-500" /><span className="text-green-500">Copied</span></>
                                : <><Copy size={11} />Copy</>
                              }
                            </button>
                            {idx > 0 && (
                              <button
                                onClick={() => {
                                  const prevUser = messages.slice(0, idx).reverse().find(m => m.role === "user")
                                  if (prevUser) sendMessage(prevUser.content)
                                }}
                                className="flex items-center gap-1 text-gray-700 hover:text-white transition-colors text-xs">
                                <RefreshCw size={11} />Retry
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {message.role === "user" && (
                      <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 border border-gray-700">
                        <span className="text-white text-sm font-bold">
                          {user?.display_name?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {loading && <ThinkingDots />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-800 bg-gray-900 px-6 py-4">
            <div className="max-w-4xl mx-auto">

              {isLimitReached && (
                <div className="mb-3 p-3 bg-red-950 border border-red-800 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-400" />
                    <span className="text-red-300 text-sm">Daily limit reached. Upgrade to Pro for unlimited AI.</span>
                  </div>
                  <button onClick={() => toast("🚀 Pro plan coming soon!", { duration: 4000 })} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium">
  Upgrade          </button>
                </div>
              )}

              {/* Quick actions bar */}
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                {QUICK_ACTIONS.slice(0, 7).map(action => (
                  <button key={action.label}
                    onClick={() => { setInput(action.prompt); inputRef.current?.focus() }}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700 hover:border-gray-600">
                    <action.icon size={11} className={action.color} />
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder={isLimitReached ? "Daily limit reached." : "Ask anything... paste code, describe problems, request generation"}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 resize-none transition-colors placeholder-gray-600 leading-relaxed"
                    rows={3}
                    disabled={loading || isLimitReached}
                  />
                  {input.length > 0 && (
                    <span className="absolute bottom-3 right-3 text-gray-600 text-xs">{input.length}</span>
                  )}
                </div>
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading || isLimitReached}
                  className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white px-6 py-3.5 rounded-xl transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-lg shadow-indigo-500/20"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>

              <div className="flex items-center justify-between mt-2">
                <p className="text-gray-700 text-xs">Enter to send • Shift+Enter new line</p>
                <p className="text-gray-700 text-xs flex items-center gap-1">
                  <Brain size={10} />
                  {currentSessionId ? "Memory active — AI remembers context" : "Start chatting to enable memory"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}