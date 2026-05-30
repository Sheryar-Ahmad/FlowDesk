import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft, Bot, Send, Copy, Check, Loader2,
  Code, FileText, Zap, Shield, RefreshCw,
  Trash2, Sparkles, ChevronRight, Terminal,
  Brain, Lightbulb, Search, GitBranch, Package,
  AlertCircle, TrendingUp, Cpu, Database
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
  thinking?: boolean
  category?: string
}

// AI Capabilities - makes users feel they have a senior developer
const CAPABILITIES = [
  { icon: Code, title: "Code Expert", desc: "Explains any code in any language instantly", color: "text-blue-400" },
  { icon: Zap, title: "Bug Killer", desc: "Finds and fixes bugs with full explanation", color: "text-yellow-400" },
  { icon: Shield, title: "Security Auditor", desc: "Reviews code for vulnerabilities and exploits", color: "text-red-400" },
  { icon: TrendingUp, title: "Performance Optimizer", desc: "Makes your code faster and more efficient", color: "text-green-400" },
  { icon: Brain, title: "Architecture Guide", desc: "System design and best practices advisor", color: "text-purple-400" },
  { icon: Database, title: "Database Expert", desc: "SQL queries, optimization, schema design", color: "text-orange-400" },
  { icon: GitBranch, title: "DevOps Helper", desc: "Docker, CI/CD, deployment strategies", color: "text-cyan-400" },
  { icon: Package, title: "Code Generator", desc: "Generates production-ready code from description", color: "text-pink-400" },
]

// Smart quick actions - context aware
const QUICK_ACTIONS = [
  { icon: Code, label: "Explain Code", prompt: "Explain this code in detail, including what each part does and why:\n\n", category: "explain" },
  { icon: Zap, label: "Fix Bug", prompt: "Find ALL bugs in this code, explain each one, then provide the complete fixed version:\n\n", category: "fix" },
  { icon: Shield, label: "Security Audit", prompt: "Perform a complete security audit of this code. Check for: SQL injection, XSS, authentication issues, data exposure, and any other vulnerabilities:\n\n", category: "security" },
  { icon: TrendingUp, label: "Optimize", prompt: "Optimize this code for maximum performance. Consider: time complexity, space complexity, caching, and readability:\n\n", category: "optimize" },
  { icon: FileText, label: "Document", prompt: "Add comprehensive professional documentation to this code including: function descriptions, parameter types, return values, examples, and edge cases:\n\n", category: "document" },
  { icon: RefreshCw, label: "Refactor", prompt: "Refactor this code following SOLID principles and best practices. Explain every change you make:\n\n", category: "refactor" },
  { icon: Terminal, label: "Write Tests", prompt: "Write comprehensive unit tests for this code. Include: happy path, edge cases, error cases, and mocking:\n\n", category: "test" },
  { icon: Lightbulb, label: "Better Approach", prompt: "Suggest a completely better approach to solve this problem. Think from first principles:\n\n", category: "improve" },
  { icon: Search, label: "Code Review", prompt: "Do a thorough senior developer code review. Check: logic, style, performance, maintainability, and scalability:\n\n", category: "review" },
  { icon: Sparkles, label: "Generate", prompt: "Generate production-ready code for this requirement:\n\n", category: "generate" },
]

// Format AI response with syntax highlighting
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
                    <div className="w-3 h-3 rounded-full bg-red-500 opacity-70" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-70" />
                    <div className="w-3 h-3 rounded-full bg-green-500 opacity-70" />
                  </div>
                  <span className="text-xs text-gray-400 font-mono ml-2">{lang}</span>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied! 📋") }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                >
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
              // Bold text **text**
              const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
              // Inline code `code`
              const withCode = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-purple-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')

              if (line.startsWith("# ")) return <h1 key={j} className="text-xl font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>
              if (line.startsWith("## ")) return <h2 key={j} className="text-lg font-bold text-white mt-3 mb-1">{line.slice(3)}</h2>
              if (line.startsWith("### ")) return <h3 key={j} className="text-base font-semibold text-indigo-300 mt-2 mb-1">{line.slice(4)}</h3>
              if (line.startsWith("- ") || line.startsWith("• ")) return (
                <div key={j} className="flex items-start gap-2 my-0.5">
                  <span className="text-indigo-400 mt-1 flex-shrink-0">•</span>
                  <span dangerouslySetInnerHTML={{ __html: withCode }} />
                </div>
              )
              if (line.match(/^\d+\./)) return (
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

// Thinking animation
function ThinkingIndicator() {
  return (
    <div className="flex gap-4">
      <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
        <Brain size={16} className="text-white animate-pulse" />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-indigo-400 text-xs font-medium animate-pulse">AI is thinking...</span>
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map(delay => (
            <div key={delay} className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }} />
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
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState({ used_today: 0, remaining: 20 as number | string, limit: 20 as number | string })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showCapabilities, setShowCapabilities] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])
  useEffect(() => { loadUsage() }, [])

  const loadUsage = async () => {
    try {
      const { data } = await api.get("/ai/usage")
      setUsage(data)
    } catch {}
  }

  const sendMessage = useCallback(async (messageText?: string) => {
    const text = messageText || input
    if (!text.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setLoading(true)
    setSelectedCategory(null)

    try {
      const conversationMessages = [...messages, userMessage].map(m => ({
        role: m.role, content: m.content
      }))

      const { data } = await api.post("/ai/chat", { messages: conversationMessages })

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        tokens: data.tokens_used,
      }

      setMessages(prev => [...prev, aiMessage])
      setUsage(prev => ({
        ...prev,
        used_today: prev.used_today + 1,
        remaining: typeof prev.remaining === "number" ? Math.max(0, prev.remaining - 1) : prev.remaining
      }))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e.response?.data?.detail || "AI service error. Please try again.")
      setMessages(prev => prev.filter(m => m.id !== userMessage.id))
      setInput(userMessage.content)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, messages])

  const handleCopy = (message: Message) => {
    navigator.clipboard.writeText(message.content)
    setCopiedId(message.id)
    toast.success("Copied!")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    setInput(action.prompt)
    setSelectedCategory(action.category)
    inputRef.current?.focus()
  }

  const clearChat = () => {
    if (messages.length === 0) return
    if (!confirm("Clear this conversation? This cannot be undone.")) return
    setMessages([])
    toast.success("Chat cleared")
  }

  const remainingNum = typeof usage.remaining === "number" ? usage.remaining : 999
  const limitNum = typeof usage.limit === "number" ? usage.limit : 20
  const remainingPercent = (remainingNum / limitNum) * 100
  const isLimitReached = user?.plan === "free" && remainingNum === 0

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white font-bold text-sm">FlowDesk AI</h1>
                <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-700">
                  Llama 3.3 70B
                </span>
              </div>
              <p className="text-gray-500 text-xs">Enterprise Grade • Groq Powered • Ultra Fast</p>
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-indigo-400 text-xs bg-indigo-950 px-3 py-1.5 rounded-lg border border-indigo-800">
              <Cpu size={12} className="animate-spin" />
              Processing with AI...
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowCapabilities(!showCapabilities)}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-colors ${showCapabilities ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}>
            <Sparkles size={14} />Capabilities
          </button>

          {user?.plan === "free" && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
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

          {messages.length > 0 && (
            <button onClick={clearChat}
              className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-gray-800 transition-colors" title="Clear chat">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Capabilities Panel */}
      {showCapabilities && (
        <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
          <p className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-wider">What FlowDesk AI can do for you</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CAPABILITIES.map(cap => (
              <div key={cap.title} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <cap.icon size={16} className={`${cap.color} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className="text-white text-xs font-medium">{cap.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-96 px-6 py-12">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/30">
              <Brain size={40} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">FlowDesk AI Assistant</h2>
            <p className="text-gray-400 text-center mb-2 max-w-lg text-base">
              Your personal senior developer. Ask anything about code — I think deeply and give accurate answers.
            </p>
            <p className="text-gray-600 text-sm mb-10">Powered by Llama 3.3 70B • Enterprise Grade • Ultra Fast via Groq</p>

            {/* Quick Actions Grid */}
            <div className="w-full max-w-3xl mb-8">
              <p className="text-gray-500 text-xs font-medium mb-3 uppercase tracking-wider text-center">Quick Actions</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {QUICK_ACTIONS.map(action => (
                  <button key={action.label} onClick={() => handleQuickAction(action)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all group ${
                      selectedCategory === action.category
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-gray-900 border-gray-800 hover:border-indigo-500 hover:bg-gray-800"
                    }`}>
                    <action.icon size={18} className={selectedCategory === action.category ? "text-white" : "text-indigo-400 group-hover:text-indigo-300"} />
                    <span className={`text-xs font-medium ${selectedCategory === action.category ? "text-white" : "text-gray-400 group-hover:text-white"}`}>
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">Enter to send</span>
              <span className="bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">Shift+Enter new line</span>
              <span className="bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">Paste code directly</span>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
            {messages.map((message, idx) => (
              <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && (
                  <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 shadow-lg shadow-indigo-500/20">
                    <Brain size={16} className="text-white" />
                  </div>
                )}

                <div className={`max-w-3xl flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`px-5 py-4 rounded-2xl ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-sm shadow-lg shadow-indigo-500/10"
                      : "bg-gray-900 border border-gray-800 rounded-tl-sm shadow-sm"
                  }`}>
                    {message.role === "assistant"
                      ? <MessageContent content={message.content} />
                      : <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    }
                  </div>

                  <div className="flex items-center gap-3 mt-2 px-1">
                    <span className="text-gray-600 text-xs">
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {message.tokens && (
                      <span className="text-gray-700 text-xs flex items-center gap-1">
                        <Cpu size={9} />{message.tokens.toLocaleString()} tokens
                      </span>
                    )}
                    {message.role === "assistant" && (
                      <>
                        <button onClick={() => handleCopy(message)}
                          className="flex items-center gap-1 text-gray-600 hover:text-white transition-colors text-xs">
                          {copiedId === message.id
                            ? <><Check size={11} className="text-green-500" /><span className="text-green-500">Copied</span></>
                            : <><Copy size={11} />Copy</>
                          }
                        </button>
                        {idx > 0 && (
                          <button
                            onClick={() => {
                              const prevUserMsg = messages.slice(0, idx).reverse().find(m => m.role === "user")
                              if (prevUserMsg) sendMessage(prevUserMsg.content)
                            }}
                            className="flex items-center gap-1 text-gray-600 hover:text-white transition-colors text-xs">
                            <RefreshCw size={11} />Retry
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {message.role === "user" && (
                  <div className="w-9 h-9 bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 border border-gray-600">
                    <span className="text-white text-sm font-bold">
                      {user?.display_name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {loading && <ThinkingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-800 bg-gray-900 px-6 py-4">
        <div className="max-w-4xl mx-auto">

          {/* Limit warning */}
          {isLimitReached && (
            <div className="mb-3 p-3 bg-red-950 border border-red-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400" />
                <span className="text-red-300 text-sm">Daily limit reached. Upgrade to Pro for unlimited AI access.</span>
              </div>
              <button className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
                Upgrade to Pro
              </button>
            </div>
          )}

          {/* Quick actions in input area */}
          {messages.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {QUICK_ACTIONS.slice(0, 6).map(action => (
                <button key={action.label} onClick={() => handleQuickAction(action)}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700 hover:border-gray-600">
                  <action.icon size={11} />
                  {action.label}
                </button>
              ))}
            </div>
          )}

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
                placeholder={isLimitReached ? "Daily limit reached. Upgrade to Pro." : "Ask anything... paste code, describe a problem, request code generation"}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 resize-none transition-colors placeholder-gray-600 leading-relaxed"
                rows={4}
                disabled={loading || isLimitReached}
              />
              {input.length > 0 && (
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <span className="text-gray-600 text-xs">{input.length} chars</span>
                  <button onClick={() => setInput("")} className="text-gray-600 hover:text-white transition-colors">
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading || isLimitReached}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3.5 rounded-xl transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-lg shadow-indigo-500/20"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>

          <div className="flex items-center justify-between mt-2">
            <p className="text-gray-700 text-xs">
              Enter to send • Shift+Enter for new line
            </p>
            <p className="text-gray-700 text-xs flex items-center gap-1">
              <Brain size={10} />
              Llama 3.3 70B • 99% accuracy • Enterprise Grade
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}