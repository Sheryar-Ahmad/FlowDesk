

import { useState, useEffect, useCallback, useRef } from "react"
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import axios from "axios"
import {
  Search, Plus, Copy, Pin, Code2,
  X, Check, Loader2, Globe, Lock, FileCode,
  Edit3, Save, ArrowLeft, Download, Share2,
  BarChart2, Star, ChevronRight,
  Maximize2, Minimize2, WrapText, ZoomIn, ZoomOut,
  Clock, Layers, Command,
  Upload, Hash, Sparkles,
  PanelLeftOpen, PanelLeftClose, SlidersHorizontal,
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import { DeleteButton } from "../../components/DeleteButton"
import {
  getSnippets, createSnippet, updateSnippet,
  deleteSnippet, copySnippet,
} from "../../services/api/snippets.api"
import type { Snippet, CreateSnippetData } from "../../services/api/snippets.api"
import { useKeyboard } from "../../hooks/useKeyboard"
import toast from "react-hot-toast"


const C = {
  bg: "#0A0D14",
  surface: "#0F1320",
  surfaceHover: "#141929",
  border: "rgba(255,255,255,0.07)",
  borderActive: "rgba(99,102,241,0.5)",
  text: "#E2E8F0",
  textMuted: "#475569",
  textFaint: "#1E293B",
  indigo: "#6366F1",
  cyan: "#22D3EE",
  amber: "#F59E0B",
  emerald: "#10B981",
  rose: "#F43F5E",
}

const LANGUAGES = [
  { value: "python",     label: "Python",     color: "#3776AB", short: "PY" },
  { value: "javascript", label: "JavaScript", color: "#F7DF1E", short: "JS" },
  { value: "typescript", label: "TypeScript", color: "#3178C6", short: "TS" },
  { value: "rust",       label: "Rust",       color: "#CE422B", short: "RS" },
  { value: "go",         label: "Go",         color: "#00ADD8", short: "GO" },
  { value: "java",       label: "Java",       color: "#ED8B00", short: "JV" },
  { value: "cpp",        label: "C++",        color: "#00599C", short: "C+" },
  { value: "sql",        label: "SQL",        color: "#F29111", short: "SQ" },
  { value: "html",       label: "HTML",       color: "#E34C26", short: "HT" },
  { value: "css",        label: "CSS",        color: "#264DE4", short: "CS" },
  { value: "bash",       label: "Bash",       color: "#4EAA25", short: "SH" },
  { value: "json",       label: "JSON",       color: "#8BC34A", short: "JS" },
  { value: "yaml",       label: "YAML",       color: "#CB171E", short: "YM" },
  { value: "other",      label: "Other",      color: "#6B7280", short: "··" },
]

const SORT_OPTIONS = [
  { value: "newest",    label: "Newest"  },
  { value: "oldest",    label: "Oldest"  },
  { value: "most_used", label: "Popular" },
  { value: "alpha",     label: "A → Z"   },
  { value: "pinned",    label: "Pinned"  },
]

const STARTER_TEMPLATES = [
  { title: "Async fetch wrapper", language: "typescript", code: `async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {\n  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })\n  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)\n  return res.json() as Promise<T>\n}` },
  { title: "Python dataclass", language: "python", code: `from dataclasses import dataclass, field\nfrom typing import List\n\n@dataclass\nclass Config:\n    host: str = "localhost"\n    port: int = 8080\n    tags: List[str] = field(default_factory=list)\n\n    def url(self) -> str:\n        return f"http://{self.host}:{self.port}"` },
  { title: "SQL pagination query", language: "sql", code: `SELECT *\nFROM   items\nWHERE  is_active = TRUE\n  AND  created_at > NOW() - INTERVAL '30 days'\nORDER  BY created_at DESC\nLIMIT  :page_size\nOFFSET (:page - 1) * :page_size;` },
  { title: "Bash health check", language: "bash", code: `#!/usr/bin/env bash\nset -euo pipefail\n\nURL="\${1:-http://localhost:8080/health}"\nfor i in {1..5}; do\n  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")\n  [ "$STATUS" -eq 200 ] && echo "OK" && exit 0\n  echo "Attempt $i failed ($STATUS), retrying..."\n  sleep 2\ndone\necho "Health check failed" && exit 1` },
  { title: "React custom hook", language: "typescript", code: `import { useState, useEffect } from "react"\n\nexport function useDebounce<T>(value: T, delay = 300): T {\n  const [debounced, setDebounced] = useState<T>(value)\n  useEffect(() => {\n    const t = setTimeout(() => setDebounced(value), delay)\n    return () => clearTimeout(t)\n  }, [value, delay])\n  return debounced\n}` },
  { title: "Go HTTP middleware", language: "go", code: `package middleware\n\nimport (\n\t"log"\n\t"net/http"\n\t"time"\n)\n\nfunc Logger(next http.Handler) http.Handler {\n\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {\n\t\tstart := time.Now()\n\t\tnext.ServeHTTP(w, r)\n\t\tlog.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))\n\t})\n}` },
]

const getLang = (lang: string) => LANGUAGES.find(l => l.value === lang) ?? LANGUAGES[LANGUAGES.length - 1]

const emptyForm: CreateSnippetData = {
  title: "", code: "", language: "python",
  description: "", tags: [], is_public: false,
}

type SortKey = "newest" | "oldest" | "most_used" | "alpha" | "pinned"

interface LocalMeta {
  starred?: boolean
  labelColor?: string
  collection?: string
  order?: number
}


function LangBadge({ lang, size = "md" }: { lang: string; size?: "sm" | "md" }) {
  const l = getLang(lang)
  const p = size === "sm" ? "1px 5px" : "2px 7px"
  const fs = size === "sm" ? 10 : 11
  return (
    <span style={{
      background: `${l.color}20`, color: l.color,
      border: `1px solid ${l.color}35`,
      borderRadius: 5, padding: p, fontSize: fs,
      fontFamily: "monospace", fontWeight: 600, letterSpacing: 0.3,
      flexShrink: 0,
    }}>
      {l.label}
    </span>
  )
}

function DetailActionButton({
  icon,
  title,
  color,
  onClick,
}: {
  icon: ReactNode
  title: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${C.border}`,
        borderRadius: 7,
        padding: 6,
        color: C.textMuted,
        cursor: "pointer",
        display: "flex",
        transition: "color 0.15s, border-color 0.15s",
      }}
      onMouseEnter={event => {
        event.currentTarget.style.color = color
        event.currentTarget.style.borderColor = `${color}50`
      }}
      onMouseLeave={event => {
        event.currentTarget.style.color = C.textMuted
        event.currentTarget.style.borderColor = C.border
      }}
    >
      {icon}
    </button>
  )
}


function ComplexityBadge({ code }: { code: string }) {
  const lines = code.split("\n").length
  const tokens = code.split(/\s+/).length
  const label = lines < 15 ? "simple" : lines < 60 ? "medium" : "complex"
  const color = label === "simple" ? C.emerald : label === "medium" ? C.amber : C.rose
  return (
    <span style={{ fontSize: 10, color, fontFamily: "monospace", opacity: 0.7 }}>
      {lines}L · {tokens}tok · {label}
    </span>
  )
}



function SnippetRow({
  snippet, selected, onSelect, onCopy, copiedId, bulkSelected, onBulkToggle,
}: {
  snippet: Snippet
  selected: boolean
  onSelect: () => void
  onCopy: (s: Snippet) => void
  copiedId: string | null
  bulkSelected: boolean
  onBulkToggle: () => void
}) {
  const l = getLang(snippet.language)
  const [hovered, setHovered] = useState(false)
  const metaKey = `fd_meta_${snippet.id}`
  const meta: LocalMeta = (() => { try { return JSON.parse(localStorage.getItem(metaKey) || "{}") } catch { return {} } })()

  return (
    <div
      className={`snippet-row${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        padding: "11px 14px",
        cursor: "pointer",
        background: selected ? "rgba(99,102,241,0.08)" : hovered ? C.surfaceHover : "transparent",
        borderLeft: `3px solid ${selected ? C.indigo : meta.labelColor && meta.labelColor !== "transparent" ? meta.labelColor : "transparent"}`,
        transition: "background 0.12s",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >

      <div
        className={`snippet-bulk-check${bulkSelected ? " is-selected" : ""}`}
        onClick={e => { e.stopPropagation(); onBulkToggle() }}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
          border: `1.5px solid ${bulkSelected ? C.indigo : "rgba(255,255,255,0.15)"}`,
          background: bulkSelected ? C.indigo : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: bulkSelected || hovered ? 1 : 0,
          transition: "opacity 0.15s",
        }}
      >
        {bulkSelected && <Check size={10} color="#fff" />}
      </div>


      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: l.color, marginTop: 7, flexShrink: 0,
        boxShadow: selected ? `0 0 6px ${l.color}` : "none",
      }} />


      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          {snippet.is_pinned && <Pin size={9} color={C.amber} />}
          {meta.starred && <Star size={9} color={C.amber} />}
          <span style={{
            fontSize: 13, fontWeight: 600, color: selected ? "#f8fafc" : C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {snippet.title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <LangBadge lang={snippet.language} size="sm" />
          {snippet.is_public && <Globe size={9} color={C.emerald} />}
          {snippet.use_count > 0 && (
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>
              ×{snippet.use_count}
            </span>
          )}
          {snippet.tags?.slice(0, 2).map(t => (
            <span key={t} style={{ fontSize: 10, color: C.textMuted }}>#{t}</span>
          ))}
        </div>
      </div>


      <button
        className="snippet-row-copy"
        onClick={e => { e.stopPropagation(); onCopy(snippet) }}
        title={`Copy ${snippet.title}`}
        aria-label={`Copy snippet ${snippet.title}`}
        style={{
          background: copiedId === snippet.id ? C.emerald : "rgba(255,255,255,0.06)",
          border: "none", borderRadius: 6, padding: "4px 7px",
          color: copiedId === snippet.id ? "#fff" : C.textMuted,
          cursor: "pointer", display: "flex", alignItems: "center",
          opacity: hovered || copiedId === snippet.id ? 1 : 0,
          transition: "opacity 0.15s",
          flexShrink: 0,
        }}
      >
        {copiedId === snippet.id ? <Check size={12} /> : <Copy size={12} />}
      </button>


      {hovered && (
        <div className="snippet-code-thumbnail" style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          width: 80, height: 52, borderRadius: 6, overflow: "hidden",
          background: "#080B14", border: `1px solid ${l.color}35`,
          pointerEvents: "none", zIndex: 5,
        }}>
          {snippet.code.split("\n").slice(0, 5).map((line, i) => (
            <div key={i} style={{
              height: 8, margin: "2px 4px", borderRadius: 2,
              background: l.color,
              opacity: Math.min(0.7, (line.trim().length / 50) * 0.6 + 0.1),
              width: `${Math.min(90, line.trim().length + 20)}%`,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}


function CommandPalette({
  onClose, snippets, onSelect, onNew,
}: {
  onClose: () => void
  snippets: Snippet[]
  onSelect: (s: Snippet) => void
  onNew: () => void
}) {
  const [q, setQ] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = q.trim().length < 1
    ? snippets.slice(0, 8)
    : snippets.filter(s =>
        s.title.toLowerCase().includes(q.toLowerCase()) ||
        s.language.toLowerCase().includes(q.toLowerCase()) ||
        s.tags?.some(t => t.includes(q.toLowerCase()))
      ).slice(0, 8)

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        zIndex: 9999, paddingTop: "15vh",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface, borderRadius: 14, width: "100%", maxWidth: 540,
          border: `1px solid ${C.borderActive}`, overflow: "hidden",
          boxShadow: `0 0 60px rgba(99,102,241,0.25)`,
          margin: "0 16px",
        }}
      >

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
          <Command size={16} color={C.indigo} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search snippets, type a command…"
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: C.text, fontSize: 15,
            }}
          />
          <kbd style={{ fontSize: 10, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px" }}>Esc</kbd>
        </div>


        <div style={{ maxHeight: 320, overflowY: "auto" }}>

          <div style={{ padding: "6px 8px 2px" }}>
            <div style={{ fontSize: 10, color: C.textMuted, padding: "4px 8px", textTransform: "uppercase", letterSpacing: 0.8 }}>Actions</div>
            {[
              { icon: <Plus size={13} />, label: "New snippet", sub: "Ctrl+M", action: () => { onNew(); onClose() } },
            ].map(a => (
              <button key={a.label} onClick={a.action} style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "none", border: "none", cursor: "pointer",
                color: C.text, textAlign: "left",
              }}>
                <span style={{ color: C.indigo }}>{a.icon}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{a.label}</span>
                <kbd style={{ fontSize: 10, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px" }}>{a.sub}</kbd>
              </button>
            ))}
          </div>

          <div style={{ padding: "2px 8px 6px" }}>
            <div style={{ fontSize: 10, color: C.textMuted, padding: "4px 8px", textTransform: "uppercase", letterSpacing: 0.8 }}>Snippets</div>
            {filtered.map(s => (
              <button key={s.id} onClick={() => { onSelect(s); onClose() }} style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "8px 10px", borderRadius: 8,
                background: "none", border: "none", cursor: "pointer",
                color: C.text, textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: getLang(s.language).color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13 }}>{s.title}</span>
                <LangBadge lang={s.language} size="sm" />
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "16px 10px", fontSize: 13, color: C.textMuted, textAlign: "center" }}>
                No snippets match "{q}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


function TemplatesModal({
  onSelect, onClose,
}: {
  onSelect: (t: typeof STARTER_TEMPLATES[0]) => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9998, padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, borderRadius: 16, width: "100%", maxWidth: 640,
        border: `1px solid ${C.border}`, overflow: "hidden",
        maxHeight: "80vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} color={C.amber} /> Starter templates
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {STARTER_TEMPLATES.map(t => (
            <button key={t.title} onClick={() => onSelect(t)} style={{
              background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderActive)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <LangBadge lang={t.language} size="sm" />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.title}</span>
              </div>
              <pre style={{
                fontSize: 10, color: C.textMuted, margin: 0, overflow: "hidden",
                maxHeight: 48, lineHeight: 1.4, fontFamily: "monospace",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {t.code.slice(0, 120)}…
              </pre>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}


export default function SnippetList() {
  const { isAuthenticated, accessToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)


  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)


  const [search, setSearch] = useState("")
  const [selectedLangs, setSelectedLangs] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortKey>("newest")
  const [showPinnedOnly, setShowPinnedOnly] = useState(false)
  const [showStarredOnly, setShowStarredOnly] = useState(false)
  const [showPublicOnly, setShowPublicOnly] = useState(false)


  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)


  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())


  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showLibrary, setShowLibrary] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  )


  const [fullscreen, setFullscreen] = useState(false)
  const [wordWrap, setWordWrap] = useState<"on" | "off">("on")
  const [fontSize, setFontSize] = useState(14)


  const [form, setForm] = useState<CreateSnippetData>(emptyForm)
  const [tagInput, setTagInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadRequestId = useRef(0)


  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("fd_recent") || "[]") } catch { return [] }
  })

  useEffect(() => {
    if (!isAuthenticated || !accessToken) navigate("/login", { replace: true })
  }, [accessToken, isAuthenticated, navigate])
  useEffect(() => () => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    loadRequestId.current += 1
  }, [])


  useKeyboard({
    "ctrl+k": () => { setShowPalette(true) },
    "ctrl+m": () => { setForm(emptyForm); setShowCreate(true) },
    "escape": () => {
      setShowCreate(false); setShowEdit(false)
      setShowPalette(false); setShowTemplates(false)
      setShowFilters(false)
      if (fullscreen) setFullscreen(false)
    },
  })


  const loadSnippets = useCallback(async (
    sq?: string,
    sort: SortKey = "newest",
  ) => {
    const requestId = ++loadRequestId.current
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: 1, page_size: 100 }
      if (sq && sq.length >= 2) params.search = sq
      const data = await getSnippets(params)
      if (requestId !== loadRequestId.current) return

      let list: Snippet[] = data.snippets || []


      if (sort === "most_used") list = [...list].sort((a, b) => b.use_count - a.use_count)
      else if (sort === "alpha") list = [...list].sort((a, b) => a.title.localeCompare(b.title))
      else if (sort === "oldest") list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      else if (sort === "pinned") list = [...list].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
      else list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setSnippets(list)
      setTotal(data.total || 0)
    } catch (error: unknown) {
      if (requestId !== loadRequestId.current) return

      if (axios.isAxiosError<{ detail?: string }>(error)) {
        const status = error.response?.status
        const detail = error.response?.data?.detail

        if (status === 401) {
          toast.error(detail || "Your session expired. Please sign in again.")
          await logout()
          navigate("/login", { replace: true })
        } else if (status === 429) {
          toast.error("Too many requests. Please wait a moment and try again.")
        } else if (!error.response) {
          toast.error("Cannot reach the FlowDesk backend. Make sure it is running on port 8000.")
        } else {
          toast.error(detail || `Failed to load snippets (${status || "server error"}).`)
        }
      } else {
        toast.error("Failed to load snippets.")
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false)
    }
  }, [logout, navigate])

  useEffect(() => {
    // Loading remote data is the intended synchronization for this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAuthenticated && accessToken) void loadSnippets()
  }, [accessToken, isAuthenticated, loadSnippets])

  const refresh = () => loadSnippets(search, sortBy)


  const displaySnippets = (() => {
    let list = snippets
    if (selectedLangs.length > 0) list = list.filter(s => selectedLangs.includes(s.language))
    if (showPinnedOnly) list = list.filter(s => s.is_pinned)
    if (showPublicOnly) list = list.filter(s => s.is_public)
    if (showStarredOnly) list = list.filter(s => {
      try { return JSON.parse(localStorage.getItem(`fd_meta_${s.id}`) || "{}").starred } catch { return false }
    })
    return list
  })()

  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (displaySnippets.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      const next = Math.min(selectedIndex + 1, displaySnippets.length - 1)
      setSelectedIndex(next)
      setSelectedSnippet(displaySnippets[next])
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const prev = Math.max(selectedIndex - 1, 0)
      setSelectedIndex(prev)
      setSelectedSnippet(displaySnippets[prev])
    } else if (e.key === "Enter" && selectedSnippet) {
      void handleCopy(selectedSnippet)
    }
  }


  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => loadSnippets(v, sortBy), 280)
  }

  const toggleLang = (lang: string) => {
    const next = selectedLangs.includes(lang)
      ? selectedLangs.filter(l => l !== lang)
      : [...selectedLangs, lang]
    setSelectedLangs(next)
  }

  const toggleLibrary = () => {
    const next = !showLibrary
    if (next && window.matchMedia("(max-width: 768px)").matches) {
      setSelectedSnippet(null)
    }
    setShowLibrary(next)
    if (!next) setShowFilters(false)
  }

  const toggleFilters = () => {
    const next = !showFilters
    setShowFilters(next)
    if (next) setShowLibrary(true)
  }

  const handleSort = (s: SortKey) => {
    setSortBy(s)
    loadSnippets(search, s)
  }

  const handleSelect = (s: Snippet, idx: number) => {
    setSelectedSnippet(s)
    setSelectedIndex(idx)
    if (window.matchMedia("(max-width: 768px)").matches) setShowLibrary(false)

    setRecentIds(prev => {
      const next = [s.id, ...prev.filter(id => id !== s.id)].slice(0, 5)
      localStorage.setItem("fd_recent", JSON.stringify(next))
      return next
    })
  }

  const handleCopy = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.code)
      setCopiedId(snippet.id)
      toast.success("Copied!", { duration: 1800 })
      setTimeout(() => setCopiedId(null), 2000)

      try {
        await copySnippet(snippet.id)
        setSnippets(prev => prev.map(s => s.id === snippet.id ? { ...s, use_count: s.use_count + 1 } : s))
        setSelectedSnippet(prev => prev?.id === snippet.id ? { ...prev, use_count: prev.use_count + 1 } : prev)
      } catch {
        // The clipboard action succeeded even if usage tracking is unavailable.
      }
    } catch {
      toast.error("Could not copy this snippet")
    }
  }

  const handleExport = (snippet: Snippet) => {
    const exts: Record<string, string> = {
      python: "py", javascript: "js", typescript: "ts",
      rust: "rs", go: "go", java: "java", cpp: "cpp",
      sql: "sql", html: "html", css: "css", bash: "sh", json: "json", yaml: "yml",
    }
    const blob = new Blob([snippet.code], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url
    a.download = `${snippet.title.replace(/\s+/g, "_")}.${exts[snippet.language] || "txt"}`
    a.click(); URL.revokeObjectURL(url)
    toast.success("Exported!")
  }

  const handleShare = async (snippet: Snippet) => {
    if (!snippet.is_public) { toast.error("Make snippet public first"); return }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/snippets/public/${snippet.id}`)
      toast.success("Share link copied!")
    } catch {
      toast.error("Could not copy the share link")
    }
  }

  const handleDuplicate = async (snippet: Snippet) => {
    setSaving(true)
    try {
      await createSnippet({
        title: `${snippet.title} (copy)`,
        code: snippet.code,
        language: snippet.language,
        description: snippet.description,
        tags: snippet.tags,
        is_public: false,
      })
      toast.success("Duplicated!")
      await refresh()
    } catch { toast.error("Failed to duplicate") }
    finally { setSaving(false) }
  }

  const handlePin = async (snippet: Snippet) => {
    try {
      const result = await updateSnippet(snippet.id, { is_pinned: !snippet.is_pinned })
      const updated = result.snippet as Snippet
      setSnippets(prev => prev.map(s => s.id === updated.id ? updated : s))
      setSelectedSnippet(prev => prev?.id === updated.id ? updated : prev)
      toast.success(snippet.is_pinned ? "Unpinned" : "Pinned!")
    } catch {
      toast.error("Failed to update pin")
    }
  }

  const handleStar = (snippet: Snippet) => {
    const key = `fd_meta_${snippet.id}`
    const meta: LocalMeta = (() => { try { return JSON.parse(localStorage.getItem(key) || "{}") } catch { return {} } })()
    localStorage.setItem(key, JSON.stringify({ ...meta, starred: !meta.starred }))
    toast.success(meta.starred ? "Unstarred" : "Starred!")
    setSnippets(prev => [...prev])
  }

  const handleDelete = async (snippet: Snippet) => {
    if (!confirm(`Delete "${snippet.title}"?`)) return
    try {
      await deleteSnippet(snippet.id)
      toast.success("Deleted")
      if (selectedSnippet?.id === snippet.id) setSelectedSnippet(null)
      setSnippets(prev => prev.filter(s => s.id !== snippet.id))
      setTotal(prev => Math.max(0, prev - 1))
    } catch {
      toast.error("Failed to delete snippet")
    }
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${bulkSelected.size} snippets?`)) return
    const ids = [...bulkSelected]
    const results = await Promise.allSettled(ids.map(id => deleteSnippet(id)))
    const deletedIds = new Set(
      ids.filter((_, index) => results[index].status === "fulfilled"),
    )
    const failedCount = ids.length - deletedIds.size

    setSnippets(prev => prev.filter(s => !deletedIds.has(s.id)))
    setTotal(prev => Math.max(0, prev - deletedIds.size))
    setBulkSelected(prev => new Set([...prev].filter(id => !deletedIds.has(id))))
    if (selectedSnippet && deletedIds.has(selectedSnippet.id)) setSelectedSnippet(null)

    if (deletedIds.size > 0) toast.success(`Deleted ${deletedIds.size} snippets`)
    if (failedCount > 0) toast.error(`${failedCount} snippets could not be deleted`)
  }

  const handleBulkExportJSON = () => {
    const toExport = snippets.filter(s => bulkSelected.has(s.id))
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url
    a.download = `flowdesk_snippets_${Date.now()}.json`
    a.click(); URL.revokeObjectURL(url)
    toast.success(`Exported ${toExport.length} snippets`)
  }

  const handleExportAll = () => {
    const blob = new Blob([JSON.stringify(snippets, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url
    a.download = `flowdesk_all_snippets_${Date.now()}.json`
    a.click(); URL.revokeObjectURL(url)
    toast.success(`Exported all ${snippets.length} snippets`)
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const parsed: unknown = JSON.parse(ev.target?.result as string)
        if (!Array.isArray(parsed)) throw new Error("Expected an array")

        let imported = 0
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue
          const snippet = item as Partial<Snippet>
          if (
            typeof snippet.title !== "string" ||
            typeof snippet.code !== "string" ||
            typeof snippet.language !== "string"
          ) continue

          try {
            await createSnippet({
              title: snippet.title,
              code: snippet.code,
              language: snippet.language,
              description: snippet.description,
              tags: Array.isArray(snippet.tags) ? snippet.tags : [],
              is_public: false,
            })
            imported += 1
          } catch {
            // Continue importing valid snippets when one item is rejected.
          }
        }

        if (imported === 0) throw new Error("No valid snippets")
        toast.success(`Imported ${imported} snippets!`)
        await refresh()
      } catch { toast.error("Invalid JSON bundle") }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return }
    if (!form.code.trim()) { toast.error("Code is required"); return }
    setSaving(true)
    try {
      const result = await createSnippet(form)
      toast.success("Snippet created! 🚀")
      setShowCreate(false); setForm(emptyForm)
      refresh()
      setSelectedSnippet(result.snippet)
    } catch { toast.error("Failed to create") }
    finally { setSaving(false) }
  }

  const handleUpdate = async () => {
    if (!selectedSnippet) return
    setSaving(true)
    try {
      const result = await updateSnippet(selectedSnippet.id, form)
      toast.success("Updated!")
      setShowEdit(false)
      refresh()
      setSelectedSnippet(result.snippet)
    } catch { toast.error("Failed to update") }
    finally { setSaving(false) }
  }

  const handleEditOpen = (snippet: Snippet) => {
    setForm({
      title: snippet.title,
      code: snippet.code,
      language: snippet.language,
      description: snippet.description || "",
      tags: snippet.tags || [],
      is_public: snippet.is_public,
    })
    setShowEdit(true)
  }

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    if (!tag || (form.tags || []).includes(tag)) return
    if ((form.tags || []).length >= 10) { toast.error("Max 10 tags"); return }
    setForm(f => ({ ...f, tags: [...(f.tags || []), tag] }))
    setTagInput("")
  }


  const totalCopies = snippets.reduce((s, n) => s + n.use_count, 0)
  const langDist = snippets.reduce((acc: Record<string, number>, s) => {
    acc[s.language] = (acc[s.language] || 0) + 1; return acc
  }, {})
  const topLang = Object.entries(langDist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"
  const publicCount = snippets.filter(s => s.is_public).length
  const pinnedCount = snippets.filter(s => s.is_pinned).length


  const recentSnippets = recentIds
    .map(id => snippets.find(s => s.id === id))
    .filter(Boolean) as Snippet[]


  const isMobileDetailOpen = !!selectedSnippet

  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column",
      background: C.bg, color: C.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
    }}>


      <header className="snippet-header" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", height: 52, flexShrink: 0,
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
      }}>
        <div className="snippet-header-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => navigate("/dashboard")}
            style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            onClick={toggleLibrary}
            title={showLibrary ? "Close snippet library" : "Open snippet library"}
            aria-label={showLibrary ? "Close snippet library" : "Open snippet library"}
            aria-expanded={showLibrary}
            className="snippet-library-toggle"
            style={{
              background: showLibrary ? "rgba(99,102,241,0.15)" : "transparent",
              border: "none",
              borderRadius: 7,
              color: showLibrary ? C.indigo : C.textMuted,
              cursor: "pointer",
              display: "flex",
              padding: 5,
            }}
          >
            {showLibrary ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <button
            type="button"
            onClick={toggleFilters}
            title={showFilters ? "Close filters" : "Open filters"}
            aria-label={showFilters ? "Close snippet filters" : "Open snippet filters"}
            aria-expanded={showFilters}
            className="snippet-filter-toggle"
            style={{
              background: showFilters ? "rgba(99,102,241,0.15)" : "transparent",
              border: "none",
              borderRadius: 7,
              color: showFilters ? C.indigo : C.textMuted,
              cursor: "pointer",
              display: "flex",
              padding: 5,
            }}
          >
            <SlidersHorizontal size={16} />
          </button>
          <FileCode className="snippet-header-icon" size={18} color={C.indigo} />
          <span className="snippet-header-title" style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Snippets</span>
          <span className="snippet-count" style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 99,
            background: "rgba(99,102,241,0.15)", color: C.indigo,
            border: `1px solid rgba(99,102,241,0.25)`, fontFamily: "monospace",
          }}>{total}</span>
        </div>


        <div className="snippet-header-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setShowPalette(true)}
            title="Command palette (Ctrl+K)"
            className="snippet-command-button"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "5px 10px", color: C.textMuted,
              cursor: "pointer", fontSize: 12,
            }}
          >
            <Command size={13} />
            <span className="hide-mobile">Search</span>
            <kbd className="snippet-command-kbd" style={{ fontSize: 10, opacity: 0.5 }}>⌘K</kbd>
          </button>

          <button
            onClick={() => setShowStats(s => !s)}
            className="snippet-stats-button"
            style={{
              background: showStats ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${showStats ? C.borderActive : C.border}`,
              borderRadius: 8, padding: 7, color: showStats ? C.indigo : C.textMuted,
              cursor: "pointer", display: "flex",
            }}
          >
            <BarChart2 size={15} />
          </button>


          <label className="snippet-import" title="Import JSON" style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 8, padding: 7, color: C.textMuted,
            cursor: "pointer", display: "flex",
          }}>
            <Upload size={15} />
            <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
          </label>

          <button
            onClick={handleExportAll}
            title="Export all"
            className="snippet-export"
            style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: 7, color: C.textMuted, cursor: "pointer", display: "flex",
            }}
          >
            <Download size={15} />
          </button>

          <button
            onClick={() => { setForm(emptyForm); setShowCreate(true) }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: C.indigo, border: "none", borderRadius: 8,
              padding: "6px 14px", color: "#fff", cursor: "pointer",
              fontWeight: 600, fontSize: 13,
            }}
          >
            <Plus size={15} />
            <span className="hide-mobile">New</span>
          </button>
        </div>
      </header>


      {showStats && (
        <div className="snippet-stats-bar" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10, padding: "12px 16px",
          borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0,
        }}>
          {[
            { label: "Total", value: total, color: C.indigo },
            { label: "Copies", value: totalCopies, color: C.cyan },
            { label: "Public", value: publicCount, color: C.emerald },
            { label: "Pinned", value: pinnedCount, color: C.amber },
            { label: "Top lang", value: topLang, color: getLang(topLang).color },
            { label: "Languages", value: Object.keys(langDist).length, color: C.rose },
          ].map(s => (
            <div className="snippet-stat-card" key={s.label} style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 8,
              padding: "8px 12px", border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}


      {bulkSelected.size > 0 && (
        <div style={{
          padding: "8px 16px", background: "rgba(99,102,241,0.1)",
          borderBottom: `1px solid rgba(99,102,241,0.2)`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: C.indigo, fontWeight: 600 }}>
            {bulkSelected.size} selected
          </span>
          <button onClick={handleBulkExportJSON} style={{
            background: "rgba(34,211,238,0.1)", border: `1px solid rgba(34,211,238,0.25)`,
            borderRadius: 6, padding: "4px 12px", color: C.cyan, cursor: "pointer", fontSize: 12,
          }}>Export JSON</button>
          <DeleteButton onClick={handleBulkDelete} label="Delete" style={{ fontSize: 12 }} />
          <button onClick={() => setBulkSelected(new Set())} style={{
            background: "none", border: "none", color: C.textMuted, cursor: "pointer", marginLeft: "auto",
          }}><X size={14} /></button>
        </div>
      )}


      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>


        {showFilters && (
          <button
            type="button"
            className="snippet-filter-backdrop"
            onClick={() => setShowFilters(false)}
            aria-label="Close snippet filters"
          />
        )}
        {showFilters && (
          <div style={{
            width: 220, flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column",
            background: C.surface, overflowY: "auto",
          }} className="snippet-filter-rail">

          <div style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Filters</span>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              aria-label="Close snippet filters"
              style={{ background: "none", border: 0, color: C.textMuted, cursor: "pointer", display: "flex", padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>


          <div style={{ padding: "14px 12px 8px" }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Quick filters</div>
            {[
              { label: "All snippets", active: !showPinnedOnly && !showStarredOnly && !showPublicOnly, onClick: () => { setShowPinnedOnly(false); setShowStarredOnly(false); setShowPublicOnly(false) }, icon: <Layers size={12} /> },
              { label: "Pinned", active: showPinnedOnly, onClick: () => setShowPinnedOnly(v => !v), icon: <Pin size={12} /> },
              { label: "Starred", active: showStarredOnly, onClick: () => setShowStarredOnly(v => !v), icon: <Star size={12} /> },
              { label: "Public", active: showPublicOnly, onClick: () => setShowPublicOnly(v => !v), icon: <Globe size={12} /> },
            ].map(f => (
              <button key={f.label} onClick={f.onClick} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 10px", borderRadius: 7, border: "none",
                background: f.active ? "rgba(99,102,241,0.15)" : "none",
                color: f.active ? C.indigo : C.textMuted,
                cursor: "pointer", fontSize: 12, textAlign: "left",
                marginBottom: 2,
              }}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>

          <div style={{ width: "100%", height: 1, background: C.border }} />


          <div style={{ padding: "12px 12px 8px" }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Sort by</div>
            {SORT_OPTIONS.map(s => (
              <button key={s.value} onClick={() => handleSort(s.value as SortKey)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "5px 10px", borderRadius: 7, border: "none",
                background: sortBy === s.value ? "rgba(99,102,241,0.12)" : "none",
                color: sortBy === s.value ? C.indigo : C.textMuted,
                cursor: "pointer", fontSize: 12, textAlign: "left", marginBottom: 2,
              }}>
                {sortBy === s.value && <ChevronRight size={10} />}
                {sortBy !== s.value && <span style={{ width: 10 }} />}
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ width: "100%", height: 1, background: C.border }} />


          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>Language</span>
              {selectedLangs.length > 0 && (
                <button onClick={() => setSelectedLangs([])}
                  style={{ fontSize: 10, color: C.rose, background: "none", border: "none", cursor: "pointer" }}>
                  clear
                </button>
              )}
            </div>
            {LANGUAGES.map(l => {
              const count = snippets.filter(s => s.language === l.value).length
              if (count === 0) return null
              const active = selectedLangs.includes(l.value)
              return (
                <button key={l.value} onClick={() => toggleLang(l.value)} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "5px 8px", borderRadius: 7, border: "none",
                  background: active ? `${l.color}18` : "none",
                  color: active ? l.color : C.textMuted,
                  cursor: "pointer", fontSize: 12, textAlign: "left", marginBottom: 2,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{l.label}</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", opacity: 0.6 }}>{count}</span>
                </button>
              )
            })}
          </div>


          <div style={{ marginTop: "auto", padding: 12 }}>
            <button onClick={() => setShowTemplates(true)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              background: "rgba(245,158,11,0.08)", border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: 8, padding: "8px 12px", color: C.amber,
              cursor: "pointer", fontSize: 12,
            }}>
              <Sparkles size={13} /> Templates
            </button>
          </div>
          </div>
        )}


        <div style={{
          width: 300, flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          background: "#0C0F1A",
        }}
        className={`snippet-list-pane${showLibrary ? "" : " library-closed"}${isMobileDetailOpen ? " mobile-detail-open" : ""}`}
        >
          <div className="snippet-library-header" style={{
            padding: "9px 12px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <FileCode size={13} color={C.indigo} />
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>Library</span>
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>{displaySnippets.length}</span>
            </div>
            <button
              type="button"
              className="snippet-library-close"
              onClick={toggleLibrary}
              title="Close snippet library"
              aria-label="Close snippet library"
              style={{ background: "none", border: 0, color: C.textMuted, cursor: "pointer", display: "flex", padding: 2 }}
            >
              <PanelLeftClose size={15} />
            </button>
          </div>


          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textMuted }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search snippets…"
                style={{
                  width: "100%", background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "7px 28px 7px 32px", color: C.text, fontSize: 13,
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => (e.target.style.borderColor = C.borderActive)}
                onBlur={e => (e.target.style.borderColor = C.border)}
              />
              {search && (
                <button onClick={() => handleSearch("")} style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "flex",
                }}><X size={12} /></button>
              )}
            </div>
          </div>


          <div style={{
            padding: "6px 10px", borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 6, overflowX: "auto",
          }} className="show-mobile-flex hide-desktop">
            {SORT_OPTIONS.slice(0, 3).map(s => (
              <button key={s.value} onClick={() => handleSort(s.value as SortKey)} style={{
                flexShrink: 0, fontSize: 11, padding: "3px 10px", borderRadius: 99, border: "none",
                background: sortBy === s.value ? C.indigo : "rgba(255,255,255,0.06)",
                color: sortBy === s.value ? "#fff" : C.textMuted, cursor: "pointer",
              }}>{s.label}</button>
            ))}
            <button onClick={() => setShowTemplates(true)} style={{
              flexShrink: 0, fontSize: 11, padding: "3px 10px", borderRadius: 99,
              border: `1px solid rgba(245,158,11,0.3)`, background: "transparent",
              color: C.amber, cursor: "pointer",
            }}>Templates</button>
          </div>


          {recentSnippets.length > 0 && !search && (
            <div style={{ padding: "8px 12px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 5, display: "flex", alignItems: "center", gap: 5 }}>
                <Clock size={9} /> Recent
              </div>
              <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 8 }}>
                {recentSnippets.map(s => (
                  <button key={s.id} onClick={() => handleSelect(s, displaySnippets.indexOf(s))} style={{
                    flexShrink: 0, fontSize: 11, padding: "3px 9px", borderRadius: 99,
                    background: selectedSnippet?.id === s.id ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selectedSnippet?.id === s.id ? C.borderActive : C.border}`,
                    color: selectedSnippet?.id === s.id ? C.indigo : C.textMuted,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}>
                    {s.title.slice(0, 14)}{s.title.length > 14 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}


          <div
            ref={listRef}
            style={{ flex: 1, overflowY: "auto" }}
            tabIndex={0}
            onKeyDown={handleListKeyDown}
          >
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
                <Loader2 size={22} color={C.indigo} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : displaySnippets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 16px" }}>
                <FileCode size={36} color={C.textFaint} style={{ margin: "0 auto 12px" }} />
                <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 6 }}>
                  {search ? `No results for "${search}"` : "No snippets yet"}
                </p>
                <button
                  onClick={() => { setForm(emptyForm); setShowCreate(true) }}
                  style={{ color: C.indigo, background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
                >
                  + Create first snippet
                </button>
              </div>
            ) : (
              displaySnippets.map((s, i) => (
                <SnippetRow
                  key={s.id}
                  snippet={s}
                  selected={selectedSnippet?.id === s.id}
                  onSelect={() => handleSelect(s, i)}
                  onCopy={handleCopy}
                  copiedId={copiedId}
                  bulkSelected={bulkSelected.has(s.id)}
                  onBulkToggle={() => {
                    setBulkSelected(prev => {
                      const next = new Set(prev)
                      if (next.has(s.id)) next.delete(s.id)
                      else next.add(s.id)
                      return next
                    })
                  }}
                />
              ))
            )}
          </div>


          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${C.border}`,
            fontSize: 11, color: C.textMuted, display: "flex", justifyContent: "space-between",
          }}>
            <span>{displaySnippets.length} snippets</span>
            <button onClick={() => setBulkSelected(new Set(displaySnippets.map(s => s.id)))}
              style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 11 }}>
              Select all
            </button>
          </div>
        </div>


        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          background: C.bg, overflow: "hidden",
          ...(fullscreen ? { position: "fixed", inset: 0, zIndex: 500 } : {}),
        }}
        className={`snippet-detail-pane${!isMobileDetailOpen && showLibrary ? " hide-mobile-detail" : ""}`}
        >
          {selectedSnippet ? (
            <>

              <div className="snippet-detail-header" style={{
                padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
                background: C.surface, display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
              }}>

                <button
                  onClick={() => {
                    setSelectedSnippet(null)
                    setShowLibrary(true)
                  }}
                  style={{
                    background: "none", border: "none", color: C.textMuted,
                    cursor: "pointer", display: "flex", padding: 4,
                  }}
                  className="show-mobile"
                >
                  <ArrowLeft size={18} />
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    {selectedSnippet.is_pinned && <Pin size={11} color={C.amber} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedSnippet.title}
                    </span>
                    <LangBadge lang={selectedSnippet.language} />
                    {selectedSnippet.is_public
                      ? <span style={{ fontSize: 10, color: C.emerald, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}><Globe size={9} />Public</span>
                      : <span style={{ fontSize: 10, color: C.textMuted, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}><Lock size={9} />Private</span>
                    }
                  </div>
                  {selectedSnippet.description && (
                    <p style={{ fontSize: 12, color: C.textMuted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedSnippet.description}
                    </p>
                  )}
                  {selectedSnippet.tags?.length > 0 && (
                    <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                      {selectedSnippet.tags.map(t => (
                        <span key={t} style={{
                          fontSize: 10, background: "rgba(255,255,255,0.05)",
                          border: `1px solid ${C.border}`, borderRadius: 99,
                          padding: "1px 7px", color: C.textMuted,
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          <Hash size={8} />{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>


                <div className="snippet-detail-actions" style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <DetailActionButton
                    icon={<Star size={14} />}
                    title="Star"
                    color={C.amber}
                    onClick={() => handleStar(selectedSnippet)}
                  />
                  <DetailActionButton
                    icon={<Pin size={14} />}
                    title={selectedSnippet.is_pinned ? "Unpin" : "Pin"}
                    color={C.amber}
                    onClick={() => void handlePin(selectedSnippet)}
                  />
                  <DetailActionButton
                    icon={<Download size={14} />}
                    title="Export"
                    color={C.cyan}
                    onClick={() => handleExport(selectedSnippet)}
                  />
                  <DetailActionButton
                    icon={<Share2 size={14} />}
                    title="Share"
                    color={C.emerald}
                    onClick={() => void handleShare(selectedSnippet)}
                  />
                  <DetailActionButton
                    icon={<Layers size={14} />}
                    title="Duplicate"
                    color={C.textMuted}
                    onClick={() => void handleDuplicate(selectedSnippet)}
                  />
                  <DetailActionButton
                    icon={<Edit3 size={14} />}
                    title="Edit"
                    color={C.indigo}
                    onClick={() => handleEditOpen(selectedSnippet)}
                  />
                  <DeleteButton
                    iconSize={14}
                    title="Delete snippet"
                    onClick={() => void handleDelete(selectedSnippet)}
                  />

                  <button
                    onClick={() => handleCopy(selectedSnippet)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: copiedId === selectedSnippet.id ? C.emerald : C.indigo,
                      border: "none", borderRadius: 7, padding: "6px 14px",
                      color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      transition: "background 0.2s",
                    }}
                  >
                    {copiedId === selectedSnippet.id ? <Check size={14} /> : <Copy size={14} />}
                    <span className="hide-mobile">
                      {copiedId === selectedSnippet.id ? "Copied!" : "Copy"}
                    </span>
                  </button>
                </div>
              </div>


              <div className="snippet-editor-toolbar" style={{
                padding: "6px 16px", borderBottom: `1px solid ${C.border}`,
                background: "#0a0d14", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              }}>
                <ComplexityBadge code={selectedSnippet.code} />
                <div style={{ flex: 1 }} />

                <button onClick={() => setWordWrap(w => w === "on" ? "off" : "on")}
                  title="Toggle word wrap"
                  style={{
                    background: wordWrap === "on" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${wordWrap === "on" ? C.borderActive : C.border}`,
                    borderRadius: 6, padding: "3px 8px", color: wordWrap === "on" ? C.indigo : C.textMuted,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                  }}>
                  <WrapText size={12} /> Wrap
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => setFontSize(f => Math.max(10, f - 1))} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "flex" }}><ZoomOut size={13} /></button>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: C.textMuted, minWidth: 22, textAlign: "center" }}>{fontSize}</span>
                  <button onClick={() => setFontSize(f => Math.min(22, f + 1))} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "flex" }}><ZoomIn size={13} /></button>
                </div>

                <button onClick={() => setFullscreen(f => !f)} style={{
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: 4, color: C.textMuted, cursor: "pointer", display: "flex",
                }}>
                  {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
              </div>


              <div style={{ flex: 1, overflow: "hidden" }}>
                <Editor
                  height="100%"
                  language={selectedSnippet.language === "other" ? "plaintext" : selectedSnippet.language}
                  value={selectedSnippet.code}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: !fullscreen },
                    fontSize,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap,
                    padding: { top: 16, bottom: 16 },
                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                    renderLineHighlight: "all",
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: "on",
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true },
                    occurrencesHighlight: "off",
                  }}
                />
              </div>


              <div style={{
                padding: "6px 16px", borderTop: `1px solid ${C.border}`,
                background: C.surface, display: "flex", alignItems: "center",
                gap: 16, flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace" }}>
                  {selectedSnippet.code.split("\n").length}L
                </span>
                <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace" }}>
                  {selectedSnippet.code.length}B
                </span>
                <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
                  <Copy size={9} />{selectedSnippet.use_count}
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  {new Date(selectedSnippet.updated_at).toLocaleDateString()}
                </span>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
              <Code2 size={56} color={C.textFaint} style={{ marginBottom: 16 }} />
              <h3 style={{ color: C.textMuted, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Your code library</h3>
              <p style={{ color: "#1e293b", fontSize: 13, marginBottom: 20 }}>Select a snippet or create a new one</p>
              <div style={{ display: "flex", gap: 10 }}>
                {[["⌘K", "Search"], ["⌘M", "New"]].map(([k, l]) => (
                  <div key={k} style={{
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "6px 14px", fontSize: 12, color: C.textMuted,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <kbd style={{ fontFamily: "monospace", color: C.indigo }}>{k}</kbd> {l}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>


      {(showCreate || showEdit) && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: C.surface, borderRadius: 16, width: "100%", maxWidth: 840,
            border: `1px solid ${C.border}`,
            maxHeight: "92dvh", display: "flex", flexDirection: "column",
            boxShadow: `0 0 60px rgba(0,0,0,0.6)`,
          }}>

            <div style={{
              padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                  {showCreate ? "New snippet" : "Edit snippet"}
                </span>
                {showCreate && (
                  <button onClick={() => setShowTemplates(true)} style={{
                    fontSize: 11, display: "flex", alignItems: "center", gap: 5,
                    background: "rgba(245,158,11,0.1)", border: `1px solid rgba(245,158,11,0.2)`,
                    borderRadius: 6, padding: "3px 9px", color: C.amber, cursor: "pointer",
                  }}>
                    <Sparkles size={11} /> Templates
                  </button>
                )}
              </div>
              <button
                onClick={() => { setShowCreate(false); setShowEdit(false) }}
                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "flex" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

              <div className="snippet-form-heading-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 5 }}>Title *</label>
                  <input
                    autoFocus
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    maxLength={200}
                    placeholder="My awesome snippet"
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: "8px 12px", color: C.text, fontSize: 14, outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={e => (e.target.style.borderColor = C.borderActive)}
                    onBlur={e => (e.target.style.borderColor = C.border)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 5 }}>Language</label>
                  <select
                    value={form.language}
                    onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                    style={{
                      background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none",
                    }}
                  >
                    {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
              </div>


              <div>
                <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 5 }}>Code *</label>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <Editor
                    height="260px"
                    language={form.language === "other" ? "plaintext" : form.language}
                    value={form.code}
                    onChange={v => setForm(f => ({ ...f, code: v || "" }))}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8, bottom: 8 },
                      fontFamily: "'JetBrains Mono', Consolas, monospace",
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                </div>
              </div>


              <div>
                <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 5 }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this snippet do?"
                  rows={2}
                  maxLength={1000}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: "8px 12px", color: C.text, fontSize: 13,
                    outline: "none", resize: "none", boxSizing: "border-box",
                  }}
                />
              </div>


              <div>
                <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 5 }}>Tags <span style={{ opacity: 0.5 }}>(max 10)</span></label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {form.tags?.map(t => (
                    <span key={t} style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 12, background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${C.border}`, borderRadius: 99,
                      padding: "2px 8px", color: C.textMuted,
                    }}>
                      #{t}
                      <button onClick={() => setForm(f => ({ ...f, tags: f.tags?.filter(x => x !== t) }))}
                        style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "flex", padding: 0 }}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    placeholder="Type and press Enter"
                    style={{
                      flex: 1, background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: "6px 10px", color: C.text, fontSize: 13, outline: "none",
                    }}
                  />
                  <button onClick={handleAddTag} style={{
                    background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "6px 14px", color: C.textMuted, cursor: "pointer", fontSize: 13,
                  }}>Add</button>
                </div>
              </div>


              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={() => setForm(f => ({ ...f, is_public: !f.is_public }))}
                  style={{
                    position: "relative", width: 38, height: 20, borderRadius: 99,
                    background: form.is_public ? C.indigo : "rgba(255,255,255,0.1)",
                    border: "none", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2, width: 16, height: 16,
                    borderRadius: "50%", background: "#fff",
                    left: form.is_public ? 20 : 2, transition: "left 0.15s",
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: 13, color: C.text }}>{form.is_public ? "Public" : "Private"}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>
                    {form.is_public ? "Anyone with the link can view" : "Only you can see this"}
                  </div>
                </div>
              </div>
            </div>


            <div style={{
              padding: "12px 20px", borderTop: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexShrink: 0,
            }}>
              <button
                onClick={() => { setShowCreate(false); setShowEdit(false) }}
                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13, padding: "8px 12px" }}
              >
                Cancel
              </button>
              <button
                onClick={showCreate ? handleCreate : handleUpdate}
                disabled={saving}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: saving ? "rgba(99,102,241,0.5)" : C.indigo,
                  border: "none", borderRadius: 8, padding: "8px 20px",
                  color: "#fff", cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 600, fontSize: 13,
                }}
              >
                {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
                {saving ? "Saving…" : showCreate ? "Create snippet" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}


      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          snippets={snippets}
          onSelect={s => { setSelectedSnippet(s); setSelectedIndex(displaySnippets.indexOf(s)) }}
          onNew={() => { setForm(emptyForm); setShowCreate(true) }}
        />
      )}


      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onSelect={t => {
            setForm(f => ({ ...f, title: t.title, code: t.code, language: t.language }))
            setShowTemplates(false)
            setShowCreate(true)
          }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .snippet-filter-backdrop { display: none; }
        @media (max-width: 768px) {
          .snippet-header {
            padding: 0 8px !important;
          }
          .snippet-header-brand,
          .snippet-header-actions {
            gap: 4px !important;
            min-width: 0;
          }
          .snippet-stats-bar {
            display: flex !important;
            overflow-x: auto;
            padding: 9px 10px !important;
          }
          .snippet-stat-card {
            min-width: 104px;
            flex-shrink: 0;
          }
          .hide-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
          .show-mobile-flex { display: flex !important; }
          .hide-desktop { display: flex !important; }
          .snippet-list-pane {
            width: 100% !important;
          }
          .snippet-library-header {
            display: none !important;
          }
          .snippet-library-close {
            display: none !important;
          }
          .snippet-list-pane.library-closed {
            display: none !important;
          }
          .snippet-row {
            width: calc(100% - 20px);
            margin: 5px 10px;
            padding: 12px !important;
            box-sizing: border-box;
            border-radius: 10px;
            background: rgba(255,255,255,0.025) !important;
          }
          .snippet-row.is-selected {
            background: rgba(99,102,241,0.12) !important;
          }
          .snippet-bulk-check:not(.is-selected) {
            display: none !important;
          }
          .snippet-row-copy {
            opacity: 1 !important;
          }
          .snippet-code-thumbnail {
            display: none !important;
          }
          .snippet-form-heading-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .snippet-filter-backdrop {
            display: block;
            position: fixed;
            inset: 52px 0 0;
            z-index: 690;
            border: 0;
            background: rgba(0,0,0,0.62);
          }
          .snippet-filter-rail {
            position: fixed !important;
            top: 52px;
            bottom: 0;
            left: 0;
            z-index: 700;
            width: min(86vw, 280px) !important;
            box-shadow: 18px 0 44px rgba(0,0,0,0.52);
          }
          .snippet-list-pane.mobile-detail-open {
            display: none !important;
          }
          .snippet-detail-header {
            align-items: flex-start !important;
            flex-wrap: wrap;
            padding: 9px 10px !important;
          }
          .snippet-detail-actions {
            width: 100%;
            overflow-x: auto;
            padding-bottom: 2px;
          }
          .snippet-detail-actions > * {
            flex-shrink: 0;
          }
          .snippet-editor-toolbar {
            overflow-x: auto;
            padding-inline: 10px !important;
          }
          .snippet-editor-toolbar > * {
            flex-shrink: 0;
          }
          .hide-mobile-detail {
            display: none !important;
          }
        }
        @media (max-width: 640px) {
          .snippet-count,
          .snippet-header-icon,
          .snippet-command-kbd,
          .snippet-command-button,
          .snippet-stats-button,
          .snippet-import,
          .snippet-export {
            display: none !important;
          }
          .snippet-header-title {
            display: inline !important;
            max-width: 92px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
          .show-mobile-flex { display: none !important; }
          .hide-desktop { display: none !important; }
          .hide-mobile-detail {
            display: flex !important;
          }
          .snippet-list-pane.library-closed {
            display: none !important;
          }
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  )
}
