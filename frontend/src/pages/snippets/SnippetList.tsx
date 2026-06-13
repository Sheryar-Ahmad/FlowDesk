/**
 * SnippetList.tsx - Snippet Manager
 * ----------------------------------------------
 *   Features:
 * - Keyboard shortcuts (Ctrl+K, Ctrl+M, Escape)
 * - Real-time search with instant results
 * - Monaco Editor with full VS Code experience
 * - One-click copy with satisfying animation
 * - Pin favorites to top
 * - Language filter with colors
 * - Export snippet as file
 * - Share public snippets
 * - Usage statistics
 * - Smooth animations everywhere
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import {
  Search, Plus, Copy, Trash2, Pin, PinOff, Code2,
  X, Check, Loader2, Tag, Globe, Lock, FileCode,
  Edit3, Save, ArrowLeft, Download, Share2,
  BarChart2, Zap
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import {
  getSnippets, createSnippet, updateSnippet,
  deleteSnippet, copySnippet
} from "../../services/api/snippets.api"
import type { Snippet, CreateSnippetData } from "../../services/api/snippets.api"
import { useKeyboard } from "../../hooks/useKeyboard"
import toast from "react-hot-toast"

const LANGUAGES = [
  { value: "all", label: "All", color: "#6366f1" },
  { value: "python", label: "Python", color: "#3776ab" },
  { value: "javascript", label: "JavaScript", color: "#f7df1e" },
  { value: "typescript", label: "TypeScript", color: "#3178c6" },
  { value: "rust", label: "Rust", color: "#ce422b" },
  { value: "go", label: "Go", color: "#00add8" },
  { value: "java", label: "Java", color: "#ed8b00" },
  { value: "cpp", label: "C++", color: "#00599c" },
  { value: "sql", label: "SQL", color: "#f29111" },
  { value: "html", label: "HTML", color: "#e34c26" },
  { value: "css", label: "CSS", color: "#264de4" },
  { value: "bash", label: "Bash", color: "#4eaa25" },
  { value: "other", label: "Other", color: "#6b7280" },
]

const getLangColor = (lang: string) => LANGUAGES.find(l => l.value === lang)?.color || "#6b7280"

const emptyForm: CreateSnippetData = {
  title: "", code: "", language: "python",
  description: "", tags: [], is_public: false,
}

export default function SnippetList() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedLang, setSelectedLang] = useState("all")
  const [sortBy, setSortBy] = useState<"newest"|"most_used"|"pinned">("newest")
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [form, setForm] = useState<CreateSnippetData>(emptyForm)
  const [tagInput, setTagInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) navigate("/login")
  }, [isAuthenticated, navigate])

  // Keyboard shortcuts - makes users addicted
  useKeyboard({
    "ctrl+k": () => searchRef.current?.focus(),
    "ctrl+m": () => { setForm(emptyForm); setShowCreateModal(true) },
    "escape": () => { setShowCreateModal(false); setShowEditModal(false); setShowStats(false) },
  })

  const loadSnippets = useCallback(async (searchQuery?: string, lang?: string, sort?: string) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: 1, page_size: 100 }
      if (searchQuery && searchQuery.length >= 2) params.search = searchQuery
      if (lang && lang !== "all") params.language = lang
      const data = await getSnippets(params)
      let sorted = data.snippets || []

      // Client side sorting
      if (sort === "most_used") sorted = [...sorted].sort((a, b) => b.use_count - a.use_count)
      else if (sort === "pinned") sorted = [...sorted].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
      else sorted = [...sorted].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setSnippets(sorted)
      setTotal(data.total || 0)
    } catch {
      toast.error("Failed to load snippets")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSnippets() }, [loadSnippets]) // eslint-disable-line react-hooks/set-state-in-effect

  const handleSearch = (value: string) => {
    setSearch(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    const timeout = setTimeout(() => loadSnippets(value, selectedLang, sortBy), 300)
    setSearchTimeout(timeout)
  }

  const handleLangFilter = (lang: string) => {
    setSelectedLang(lang)
    loadSnippets(search, lang, sortBy)
  }

  const handleSort = (sort: "newest"|"most_used"|"pinned") => {
    setSortBy(sort)
    loadSnippets(search, selectedLang, sort)
  }

  const handleCopy = async (snippet: Snippet) => {
    await navigator.clipboard.writeText(snippet.code)
    await copySnippet(snippet.id).catch(() => {})
    setCopiedId(snippet.id)
    toast.success("Copied to clipboard!", { icon: "📋" })
    setTimeout(() => setCopiedId(null), 2000)
    // Update use count locally
    setSnippets(prev => prev.map(s => s.id === snippet.id ? {...s, use_count: s.use_count + 1} : s))
  }

  const handleExport = (snippet: Snippet) => {
    const extensions: Record<string, string> = {
      python: "py", javascript: "js", typescript: "ts",
      rust: "rs", go: "go", java: "java", cpp: "cpp",
      sql: "sql", html: "html", css: "css", bash: "sh",
    }
    const ext = extensions[snippet.language] || "txt"
    const blob = new Blob([snippet.code], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${snippet.title.replace(/\s+/g, "_")}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Snippet exported!", { icon: "??" })
  }

  const handleShare = async (snippet: Snippet) => {
    if (!snippet.is_public) {
      toast.error("Make snippet public first to share it")
      return
    }
    const url = `${window.location.origin}/snippets/public/${snippet.id}`
    await navigator.clipboard.writeText(url)
    toast.success("Share link copied!", { icon: "??" })
  }

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    if (!tag) return
    if (form.tags && form.tags.length >= 10) { toast.error("Max 10 tags"); return }
    if (form.tags && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...(form.tags || []), tag] })
    }
    setTagInput("")
  }

  const handleRemoveTag = (tag: string) => {
    setForm({ ...form, tags: form.tags?.filter(t => t !== tag) || [] })
  }

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return }
    if (!form.code.trim()) { toast.error("Code is required"); return }
    setSaving(true)
    try {
      const result = await createSnippet(form)
      toast.success("Snippet created! 🚀")
      setShowCreateModal(false)
      setForm(emptyForm)
      loadSnippets(search, selectedLang, sortBy)
      setSelectedSnippet(result.snippet)
    } catch {
      toast.error("Failed to create snippet")
    } finally {
      setSaving(false)
    }
  }

  const handleEditOpen = (snippet: Snippet) => {
    setForm({
      title: snippet.title, code: snippet.code,
      language: snippet.language, description: snippet.description || "",
      tags: snippet.tags || [], is_public: snippet.is_public,
    })
    setSelectedSnippet(snippet)
    setShowEditModal(true)
  }

  const handleUpdate = async () => {
    if (!selectedSnippet) return
    setSaving(true)
    try {
      const result = await updateSnippet(selectedSnippet.id, form)
      toast.success("Snippet updated! ✅")
      setShowEditModal(false)
      loadSnippets(search, selectedLang, sortBy)
      setSelectedSnippet(result.snippet)
    } catch {
      toast.error("Failed to update")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (snippet: Snippet) => {
    if (!confirm(`Delete "${snippet.title}"? Recoverable for 30 days.`)) return
    try {
      await deleteSnippet(snippet.id)
      toast.success("Snippet deleted")
      if (selectedSnippet?.id === snippet.id) setSelectedSnippet(null)
      loadSnippets(search, selectedLang, sortBy)
    } catch {
      toast.error("Failed to delete snippet")
    }
  }

  const handlePin = async (snippet: Snippet) => {
    try {
      await updateSnippet(snippet.id, { is_pinned: !snippet.is_pinned })
      toast.success(snippet.is_pinned ? "Unpinned" : "Pinned! 📌")
      loadSnippets(search, selectedLang, sortBy)
    } catch {
      toast.error("Failed to update")
    }
  }

  // Stats
  const totalCopies = snippets.reduce((sum, s) => sum + s.use_count, 0)
  const topLanguage = snippets.length > 0
    ? Object.entries(snippets.reduce((acc: Record<string, number>, s) => { acc[s.language] = (acc[s.language] || 0) + 1; return acc }, {}))
        .sort((a, b) => b[1] - a[1])[0]?.[0]
    : "none"
  const publicCount = snippets.filter(s => s.is_public).length

  return (
    <div className="min-h-screen h-[100dvh] bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-800">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <FileCode className="text-indigo-500" size={24} />
            <h1 className="text-xl font-bold text-white">Snippets</h1>
            <span className="bg-indigo-900 text-indigo-300 text-xs px-2 py-0.5 rounded-full font-medium">{total}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors text-sm"
          >
            <BarChart2 size={16} /><span className="hidden sm:inline">Stats</span>
          </button>
          <button
            onClick={() => { setForm(emptyForm); setShowCreateModal(true) }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
          >
            <Plus size={16} /><span className="hidden min-[390px]:inline">New Snippet</span>
            <span className="text-indigo-300 text-xs hidden lg:inline">Ctrl+M</span>
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {showStats && (
        <div className="border-b border-gray-800 bg-gray-900 px-3 sm:px-6 py-3 sm:py-4 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {[
            { label: "Total Snippets", value: total, icon: FileCode, color: "text-indigo-400" },
            { label: "Total Copies", value: totalCopies, icon: Copy, color: "text-green-400" },
            { label: "Public Snippets", value: publicCount, icon: Globe, color: "text-blue-400" },
            { label: "Top Language", value: topLanguage, icon: Zap, color: "text-yellow-400" },
          ].map(stat => (
            <div key={stat.label} className="bg-gray-800 rounded-lg p-3 flex items-center gap-3">
              <stat.icon className={stat.color} size={20} />
              <div>
                <p className="text-gray-400 text-xs">{stat.label}</p>
                <p className="text-white font-bold">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left Panel */}
        <div className={`${selectedSnippet ? "hidden md:flex" : "flex"} w-full md:w-80 border-r border-gray-800 flex-col bg-gray-900`}>

          {/* Search */}
          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search... (Ctrl+K)"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {search && (
                <button onClick={() => handleSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Sort */}
          <div className="px-3 py-2 border-b border-gray-800 flex gap-1">
            {[
              { value: "newest" as const, label: "Newest" },
              { value: "most_used" as const, label: "Popular" },
              { value: "pinned" as const, label: "Pinned" },
            ].map(s => (
              <button
                key={s.value}
                onClick={() => handleSort(s.value)}
                className={`flex-1 text-xs py-1 rounded transition-colors ${sortBy === s.value ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Language Filter */}
          <div className="px-3 py-2 border-b border-gray-800 flex gap-1.5 overflow-x-auto">
            {LANGUAGES.map(lang => (
              <button
                key={lang.value}
                onClick={() => handleLangFilter(lang.value)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
                  selectedLang === lang.value ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Snippet List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-indigo-500" size={24} />
              </div>
            ) : snippets.length === 0 ? (
              <div className="text-center py-12 px-4">
                <FileCode className="text-gray-700 mx-auto mb-3" size={40} />
                <p className="text-gray-500 text-sm mb-1">No snippets found</p>
                <p className="text-gray-600 text-xs mb-4">Press Ctrl+M to create one</p>
                <button
                  onClick={() => { setForm(emptyForm); setShowCreateModal(true) }}
                  className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                  + Create your first snippet
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {snippets.map(snippet => (
                  <div
                    key={snippet.id}
                    onClick={() => setSelectedSnippet(snippet)}
                    className={`p-3 cursor-pointer transition-all hover:bg-gray-800 group ${
                      selectedSnippet?.id === snippet.id
                        ? "bg-gray-800 border-l-2 border-indigo-500"
                        : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          {snippet.is_pinned && <Pin size={10} className="text-yellow-500 flex-shrink-0" />}
                          <h3 className="text-white text-sm font-medium truncate">{snippet.title}</h3>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ backgroundColor: getLangColor(snippet.language) + "25", color: getLangColor(snippet.language) }}
                          >
                            {snippet.language}
                          </span>
                          {snippet.is_public && <Globe size={9} className="text-green-500" />}
                          {snippet.use_count > 0 && (
                            <span className="text-xs text-gray-600 flex items-center gap-0.5">
                              <Copy size={9} />{snippet.use_count}
                            </span>
                          )}
                          {snippet.tags?.slice(0, 2).map(tag => (
                            <span key={tag} className="text-xs text-gray-600">#{tag}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(snippet) }}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-500 hover:text-white transition-all flex-shrink-0 p-1 rounded hover:bg-gray-700"
                      >
                        {copiedId === snippet.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Detail View */}
        <div className={`${selectedSnippet ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-gray-950`}>
          {selectedSnippet ? (
            <>
              {/* Detail Header */}
              <div className="border-b border-gray-800 px-3 sm:px-6 py-3 flex items-start sm:items-center justify-between gap-2 bg-gray-900">
                <button
                  onClick={() => setSelectedSnippet(null)}
                  className="mobile-only text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 flex-shrink-0"
                  aria-label="Back to snippets"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 mb-1 min-w-0">
                    {selectedSnippet.is_pinned && <Pin size={12} className="text-yellow-500" />}
                    <h2 className="text-lg font-bold text-white truncate">{selectedSnippet.title}</h2>
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
                      style={{ backgroundColor: getLangColor(selectedSnippet.language) + "25", color: getLangColor(selectedSnippet.language) }}
                    >
                      {selectedSnippet.language}
                    </span>
                    {selectedSnippet.is_public
                      ? <span className="hidden sm:flex items-center gap-1 text-xs text-green-500 flex-shrink-0"><Globe size={10} />Public</span>
                      : <span className="hidden sm:flex items-center gap-1 text-xs text-gray-500 flex-shrink-0"><Lock size={10} />Private</span>
                    }
                  </div>
                  {selectedSnippet.description && (
                    <p className="text-gray-400 text-sm truncate">{selectedSnippet.description}</p>
                  )}
                  {selectedSnippet.tags?.length > 0 && (
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {selectedSnippet.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-0.5 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                          <Tag size={8} />#{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 overflow-x-auto">
                  <button onClick={() => handlePin(selectedSnippet)} className="p-2 text-gray-400 hover:text-yellow-500 transition-colors rounded-lg hover:bg-gray-800" title={selectedSnippet.is_pinned ? "Unpin" : "Pin"}>
                    {selectedSnippet.is_pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                  <button onClick={() => handleExport(selectedSnippet)} className="p-2 text-gray-400 hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-800" title="Export as file">
                    <Download size={15} />
                  </button>
                  <button onClick={() => handleShare(selectedSnippet)} className="p-2 text-gray-400 hover:text-green-400 transition-colors rounded-lg hover:bg-gray-800" title="Share link">
                    <Share2 size={15} />
                  </button>
                  <button onClick={() => handleEditOpen(selectedSnippet)} className="p-2 text-gray-400 hover:text-indigo-400 transition-colors rounded-lg hover:bg-gray-800" title="Edit (E)">
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleCopy(selectedSnippet)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
                      copiedId === selectedSnippet.id
                        ? "bg-green-600 text-white"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                    }`}
                  >
                    {copiedId === selectedSnippet.id ? <><Check size={14} /><span className="hidden sm:inline">Copied!</span></> : <><Copy size={14} /><span className="hidden sm:inline">Copy</span></>}
                  </button>
                  <button onClick={() => handleDelete(selectedSnippet)} className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Monaco Editor */}
              <div className="flex-1">
                <Editor
                  height="100%"
                  language={selectedSnippet.language}
                  value={selectedSnippet.code}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 16, bottom: 16 },
                    fontFamily: "JetBrains Mono, Consolas, monospace",
                    renderLineHighlight: "all",
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: "on",
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true },
                  }}
                />
              </div>

              {/* Footer Bar */}
              <div className="border-t border-gray-800 px-3 sm:px-6 py-2 bg-gray-900 flex items-center justify-between gap-3 text-xs text-gray-500">
                <div className="hidden md:flex items-center gap-4">
                  <span>Lines: {selectedSnippet.code.split("\n").length}</span>
                  <span>Chars: {selectedSnippet.code.length}</span>
                  <span className="flex items-center gap-1"><Copy size={10} />{selectedSnippet.use_count} copies</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Created: {new Date(selectedSnippet.created_at).toLocaleDateString()}</span>
                  <span>Updated: {new Date(selectedSnippet.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Code2 className="text-gray-800 mx-auto mb-4" size={80} />
                <h3 className="text-gray-500 text-xl font-semibold mb-2">Your Code Library</h3>
                <p className="text-gray-600 text-sm mb-6">Select a snippet or create a new one</p>
                <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
                  <span className="bg-gray-800 px-3 py-1.5 rounded-lg">Ctrl+K to search</span>
                  <span className="bg-gray-800 px-3 py-1.5 rounded-lg">Ctrl+M to create</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[92dvh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">
                {showCreateModal ? "? Create New Snippet" : "?? Edit Snippet"}
              </h2>
              <button onClick={() => { setShowCreateModal(false); setShowEditModal(false) }} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="My awesome snippet"
                    maxLength={200}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Language *</label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {LANGUAGES.filter(l => l.value !== "all").map(lang => (
                      <option key={lang.value} value={lang.value}>{lang.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Code *</label>
                <div className="border border-gray-700 rounded-lg overflow-hidden">
                  <Editor
                    height="280px"
                    language={form.language}
                    value={form.code}
                    onChange={(value) => setForm({ ...form, code: value || "" })}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8, bottom: 8 },
                      fontFamily: "JetBrains Mono, Consolas, monospace",
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="What does this snippet do?"
                  rows={2}
                  maxLength={1000}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Tags <span className="text-gray-600">(max 10)</span></label>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {form.tags?.map(tag => (
                    <span key={tag} className="flex items-center gap-1 bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full border border-gray-700">
                      #{tag}
                      <button onClick={() => handleRemoveTag(tag)} className="text-gray-500 hover:text-red-400 ml-0.5">
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Type tag and press Enter"
                  />
                  <button onClick={handleAddTag} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors text-sm">
                    Add
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setForm({ ...form, is_public: !form.is_public })}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.is_public ? "bg-indigo-600" : "bg-gray-700"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.is_public ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <div>
                  <p className="text-gray-300 text-sm">{form.is_public ? "Public" : "Private"}</p>
                  <p className="text-gray-600 text-xs">{form.is_public ? "Anyone with link can view" : "Only you can see this"}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-gray-800">
              <button onClick={() => { setShowCreateModal(false); setShowEditModal(false) }} className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm">
                Cancel (Esc)
              </button>
              <button
                onClick={showCreateModal ? handleCreate : handleUpdate}
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
              >
                {saving
                  ? <><Loader2 size={15} className="animate-spin" />Saving...</>
                  : <><Save size={15} />{showCreateModal ? "Create Snippet" : "Save Changes"}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
