/**
 * SnippetList.tsx - The Beast Mode Snippet Manager
 * -------------------------------------------------
 * Features:
 * - Real-time search as you type
 * - Monaco Editor (VS Code in browser)
 * - Language filter with icons
 * - Create, Edit, Delete, Pin snippets
 * - One-click copy with animation
 * - Tag system
 * - Beautiful dark UI
 * - Keyboard shortcuts
 * - Smooth animations
 */

import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import {
  Search, Plus, Copy, Trash2, Pin, PinOff, Code2,
  ChevronDown, X, Check, Loader2, Tag, Globe, Lock,
  FileCode, Edit3, Save, ArrowLeft
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import {
  getSnippets, createSnippet, updateSnippet,
  deleteSnippet, copySnippet
} from "../../services/api/snippets.api"
import type { Snippet, CreateSnippetData } from "../../services/api/snippets.api"
import toast from "react-hot-toast"

// Language options with colors
const LANGUAGES = [
  { value: "all", label: "All Languages", color: "#6366f1" },
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

const getLangColor = (lang: string) => {
  return LANGUAGES.find(l => l.value === lang)?.color || "#6b7280"
}

// Empty snippet form
const emptyForm: CreateSnippetData = {
  title: "",
  code: "",
  language: "python",
  description: "",
  tags: [],
  is_public: false,
}

export default function SnippetList() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  // State
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedLang, setSelectedLang] = useState("all")
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [form, setForm] = useState<CreateSnippetData>(emptyForm)
  const [tagInput, setTagInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<any>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) navigate("/login")
  }, [isAuthenticated, navigate])

  // Load snippets
  const loadSnippets = useCallback(async (searchQuery?: string, lang?: string) => {
    setLoading(true)
    try {
      const params: any = { page: 1, page_size: 50 }
      if (searchQuery && searchQuery.length >= 2) params.search = searchQuery
      if (lang && lang !== "all") params.language = lang
      const data = await getSnippets(params)
      setSnippets(data.snippets || [])
      setTotal(data.total || 0)
    } catch (err) {
      toast.error("Failed to load snippets")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSnippets()
  }, [loadSnippets])

  // Real-time search with debounce
  const handleSearch = (value: string) => {
    setSearch(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    const timeout = setTimeout(() => {
      loadSnippets(value, selectedLang)
    }, 300)
    setSearchTimeout(timeout)
  }

  // Language filter
  const handleLangFilter = (lang: string) => {
    setSelectedLang(lang)
    loadSnippets(search, lang)
  }

  // Copy snippet
  const handleCopy = async (snippet: Snippet) => {
    await navigator.clipboard.writeText(snippet.code)
    await copySnippet(snippet.id)
    setCopiedId(snippet.id)
    toast.success("Copied to clipboard!")
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Add tag
  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (!tag) return
    if (form.tags && form.tags.length >= 10) {
      toast.error("Maximum 10 tags allowed")
      return
    }
    if (form.tags && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...(form.tags || []), tag] })
    }
    setTagInput("")
  }

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    setForm({ ...form, tags: form.tags?.filter(t => t !== tag) || [] })
  }

  // Create snippet
  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return }
    if (!form.code.trim()) { toast.error("Code is required"); return }
    setSaving(true)
    try {
      await createSnippet(form)
      toast.success("Snippet created!")
      setShowCreateModal(false)
      setForm(emptyForm)
      loadSnippets(search, selectedLang)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create snippet")
    } finally {
      setSaving(false)
    }
  }

  // Edit snippet
  const handleEditOpen = (snippet: Snippet) => {
    setForm({
      title: snippet.title,
      code: snippet.code,
      language: snippet.language,
      description: snippet.description || "",
      tags: snippet.tags || [],
      is_public: snippet.is_public,
    })
    setSelectedSnippet(snippet)
    setShowEditModal(true)
  }

  const handleUpdate = async () => {
    if (!selectedSnippet) return
    setSaving(true)
    try {
      await updateSnippet(selectedSnippet.id, form)
      toast.success("Snippet updated!")
      setShowEditModal(false)
      loadSnippets(search, selectedLang)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to update snippet")
    } finally {
      setSaving(false)
    }
  }

  // Delete snippet
  const handleDelete = async (snippet: Snippet) => {
    if (!confirm(`Delete "${snippet.title}"? You can recover it within 30 days.`)) return
    try {
      await deleteSnippet(snippet.id)
      toast.success("Snippet deleted")
      if (selectedSnippet?.id === snippet.id) setSelectedSnippet(null)
      loadSnippets(search, selectedLang)
    } catch (err) {
      toast.error("Failed to delete snippet")
    }
  }

  // Pin snippet
  const handlePin = async (snippet: Snippet) => {
    try {
      await updateSnippet(snippet.id, { is_pinned: !snippet.is_pinned } as any)
      toast.success(snippet.is_pinned ? "Unpinned" : "Pinned!")
      loadSnippets(search, selectedLang)
    } catch (err) {
      toast.error("Failed to update snippet")
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between bg-gray-900">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <FileCode className="text-indigo-500" size={24} />
            <h1 className="text-xl font-bold text-white">Snippets</h1>
            <span className="bg-indigo-900 text-indigo-400 text-xs px-2 py-0.5 rounded-full">{total}</span>
          </div>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setShowCreateModal(true) }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Plus size={18} />
          New Snippet
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left Panel - Snippet List */}
        <div className="w-96 border-r border-gray-800 flex flex-col bg-gray-900">

          {/* Search */}
          <div className="p-4 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search snippets... (Ctrl+K)"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {search && (
                <button onClick={() => handleSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Language Filter */}
          <div className="px-4 py-2 border-b border-gray-800 flex gap-2 overflow-x-auto scrollbar-hide">
            {LANGUAGES.slice(0, 8).map(lang => (
              <button
                key={lang.value}
                onClick={() => handleLangFilter(lang.value)}
                className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
                  selectedLang === lang.value
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
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
                <p className="text-gray-500 text-sm">No snippets found</p>
                <button
                  onClick={() => { setForm(emptyForm); setShowCreateModal(true) }}
                  className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm"
                >
                  Create your first snippet
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {snippets.map(snippet => (
                  <div
                    key={snippet.id}
                    onClick={() => setSelectedSnippet(snippet)}
                    className={`p-4 cursor-pointer transition-colors hover:bg-gray-800 ${
                      selectedSnippet?.id === snippet.id ? "bg-gray-800 border-l-2 border-indigo-500" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {snippet.is_pinned && <Pin size={12} className="text-yellow-500 flex-shrink-0" />}
                          <h3 className="text-white text-sm font-medium truncate">{snippet.title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: getLangColor(snippet.language) + "20", color: getLangColor(snippet.language) }}
                          >
                            {snippet.language}
                          </span>
                          {snippet.is_public && <Globe size={10} className="text-green-500" />}
                          {snippet.tags?.slice(0, 2).map(tag => (
                            <span key={tag} className="text-xs text-gray-500">#{tag}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(snippet) }}
                        className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
                      >
                        {copiedId === snippet.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Snippet Detail */}
        <div className="flex-1 flex flex-col bg-gray-950">
          {selectedSnippet ? (
            <>
              {/* Snippet Header */}
              <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between bg-gray-900">
                <div>
                  <div className="flex items-center gap-3">
                    {selectedSnippet.is_pinned && <Pin size={14} className="text-yellow-500" />}
                    <h2 className="text-lg font-bold text-white">{selectedSnippet.title}</h2>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: getLangColor(selectedSnippet.language) + "20", color: getLangColor(selectedSnippet.language) }}
                    >
                      {selectedSnippet.language}
                    </span>
                    {selectedSnippet.is_public
                      ? <span className="flex items-center gap-1 text-xs text-green-500"><Globe size={10} />Public</span>
                      : <span className="flex items-center gap-1 text-xs text-gray-500"><Lock size={10} />Private</span>
                    }
                  </div>
                  {selectedSnippet.description && (
                    <p className="text-gray-400 text-sm mt-1">{selectedSnippet.description}</p>
                  )}
                  {selectedSnippet.tags?.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {selectedSnippet.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                          <Tag size={8} />#{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handlePin(selectedSnippet)} className="p-2 text-gray-400 hover:text-yellow-500 transition-colors rounded-lg hover:bg-gray-800" title={selectedSnippet.is_pinned ? "Unpin" : "Pin"}>
                    {selectedSnippet.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </button>
                  <button onClick={() => handleEditOpen(selectedSnippet)} className="p-2 text-gray-400 hover:text-indigo-400 transition-colors rounded-lg hover:bg-gray-800" title="Edit">
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => handleCopy(selectedSnippet)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors text-sm"
                  >
                    {copiedId === selectedSnippet.id ? <><Check size={14} />Copied!</> : <><Copy size={14} />Copy</>}
                  </button>
                  <button onClick={() => handleDelete(selectedSnippet)} className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Monaco Editor - Read Only View */}
              <div className="flex-1">
                <Editor
                  height="100%"
                  language={selectedSnippet.language === "cpp" ? "cpp" : selectedSnippet.language}
                  value={selectedSnippet.code}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 16 },
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Code2 className="text-gray-700 mx-auto mb-4" size={64} />
                <h3 className="text-gray-500 text-lg font-medium mb-2">Select a snippet</h3>
                <p className="text-gray-600 text-sm">Choose a snippet from the list or create a new one</p>
                <button
                  onClick={() => { setForm(emptyForm); setShowCreateModal(true) }}
                  className="mt-4 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors mx-auto"
                >
                  <Plus size={16} />New Snippet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl max-h-screen overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-xl font-bold text-white">
                {showCreateModal ? "Create New Snippet" : "Edit Snippet"}
              </h2>
              <button
                onClick={() => { setShowCreateModal(false); setShowEditModal(false) }}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="My awesome snippet"
                  maxLength={200}
                />
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Language *</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                >
                  {LANGUAGES.filter(l => l.value !== "all").map(lang => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
              </div>

              {/* Code Editor */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Code *</label>
                <div className="border border-gray-700 rounded-lg overflow-hidden">
                  <Editor
                    height="300px"
                    language={form.language === "cpp" ? "cpp" : form.language}
                    value={form.code}
                    onChange={(value) => setForm({ ...form, code: value || "" })}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8 },
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="What does this snippet do?"
                  rows={2}
                  maxLength={1000}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tags (max 10)</label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {form.tags?.map(tag => (
                    <span key={tag} className="flex items-center gap-1 bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-full">
                      #{tag}
                      <button onClick={() => handleRemoveTag(tag)} className="text-gray-500 hover:text-red-400">
                        <X size={10} />
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
                    className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Add tag and press Enter"
                  />
                  <button onClick={handleAddTag} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Public Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm({ ...form, is_public: !form.is_public })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.is_public ? "bg-indigo-600" : "bg-gray-700"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.is_public ? "translate-x-7" : "translate-x-1"}`} />
                </button>
                <span className="text-gray-300 text-sm">
                  {form.is_public ? "Public — anyone with link can view" : "Private — only you can see this"}
                </span>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
              <button
                onClick={() => { setShowCreateModal(false); setShowEditModal(false) }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={showCreateModal ? handleCreate : handleUpdate}
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {saving ? <><Loader2 size={16} className="animate-spin" />Saving...</> : <><Save size={16} />{showCreateModal ? "Create Snippet" : "Save Changes"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
