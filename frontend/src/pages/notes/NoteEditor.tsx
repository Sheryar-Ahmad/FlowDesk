/**
 * NoteEditor.tsx - A rich text note editor for developers with support for code blocks, task lists, and more.
 * Features: Rich text, code blocks, auto-save,
 * word count, version history, search, keyboard shortcuts.
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import Placeholder from "@tiptap/extension-placeholder"
import CharacterCount from "@tiptap/extension-character-count"
import Highlight from "@tiptap/extension-highlight"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import { createLowlight } from "lowlight"
import python from "highlight.js/lib/languages/python"
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import rust from "highlight.js/lib/languages/rust"
import {
  ArrowLeft, Plus, Trash2, Search, Save,
  FileText, Clock, Hash, CheckSquare,
  Code, Bold, Italic, List, ListOrdered,
  Loader2, X, Download
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import { getNotes, createNote, updateNote, deleteNote } from "../../services/api/notes.api"
import type { Note } from "../../services/api/notes.api"
import { useKeyboard } from "../../hooks/useKeyboard"
import toast from "react-hot-toast"

const lowlight = createLowlight()
lowlight.register("python", python)
lowlight.register("javascript", javascript)
lowlight.register("typescript", typescript)
lowlight.register("rust", rust)

export default function NoteEditor() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [title, setTitle] = useState("")
  const [searchTimeout_, setSearchTimeout_] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])

  useKeyboard({
    "ctrl+k": () => searchRef.current?.focus(),
    "ctrl+s": () => selectedNote && handleSave(),
    "escape": () => {},
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: "Start writing your note... Use / for commands" }),
      CharacterCount,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-invert prose-sm max-w-none focus:outline-none min-h-full p-6",
      },
    },
    onUpdate: ({ editor }) => {
      setSaved(false)
      // Auto-save after 2 seconds of no typing
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => {
        if (selectedNote) autoSave(editor.getJSON(), editor.getText())
      }, 2000)
    },
  })

  const loadNotes = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const data = await getNotes(q && q.length >= 2 ? { search: q } : {})
      setNotes(data.notes || [])
      setTotal(data.total || 0)
    } catch { toast.error("Failed to load notes") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes]) // eslint-disable-line react-hooks/set-state-in-effect

  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchTimeout_) clearTimeout(searchTimeout_)
    setSearchTimeout_(setTimeout(() => loadNotes(v), 300))
  }

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note)
    setTitle(note.title)
    editor?.commands.setContent(note.content || {})
    setSaved(true)
  }

  const handleNewNote = async () => {
    try {
      const note = await createNote({ title: "Untitled Note", content: {}, content_text: "" })
      await loadNotes()
      handleSelectNote(note.note)
      toast.success("New note created")
    } catch {
      toast.error("Failed to create note")
    }
  }

  const autoSave = async (content: Record<string, unknown>, text: string) => {
    if (!selectedNote) return
    try {
      await updateNote(selectedNote.id, { content, content_text: text, title })
      setSaved(true)
      setNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, title, updated_at: new Date().toISOString() } : n))
    } catch { /* silent fail on auto-save */ }
  }

  const handleSave = async () => {
    if (!selectedNote || !editor) return
    setSaving(true)
    try {
      await updateNote(selectedNote.id, {
        title, content: editor.getJSON(), content_text: editor.getText()
      })
      setSaved(true)
      toast.success("Saved! ?")
      loadNotes(search)
    } catch { toast.error("Failed to save") }
    finally { setSaving(false) }
  }

  const handleTitleChange = (v: string) => {
    setTitle(v)
    setSaved(false)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      if (selectedNote && editor) autoSave(editor.getJSON(), editor.getText())
    }, 2000)
  }

  const handleDelete = async (note: Note) => {
    if (!confirm(`Delete "${note.title}"?`)) return
    try {
      await deleteNote(note.id)
      toast.success("Note deleted")
      if (selectedNote?.id === note.id) { setSelectedNote(null); editor?.commands.clearContent() }
      loadNotes(search)
    } catch { toast.error("Failed to delete") }
  }

  const handleExport = () => {
    if (!selectedNote || !editor) return
    const blob = new Blob([`# ${title}\n\n${editor.getText()}`], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url
    a.download = `${title.replace(/\s+/g, "_")}.md`; a.click()
    URL.revokeObjectURL(url)
    toast.success("Exported as Markdown!")
  }

  const wordCount = editor?.storage.characterCount.words() || 0
  const charCount = editor?.storage.characterCount.characters() || 0

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <FileText className="text-indigo-500" size={22} />
            <h1 className="text-xl font-bold text-white">Notes</h1>
            <span className="bg-indigo-900 text-indigo-300 text-xs px-2 py-0.5 rounded-full">{total}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedNote && (
            <>
              <span className={`text-xs flex items-center gap-1 ${saved ? "text-green-500" : "text-yellow-500"}`}>
                {saving ? <><Loader2 size={12} className="animate-spin" />Saving...</> : saved ? <>? Saved</> : <>? Unsaved</>}
              </span>
              <button onClick={handleExport} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors" title="Export as Markdown">
                <Download size={16} />
              </button>
              <button onClick={handleSave} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-medium">
                <Save size={14} />Save <span className="text-indigo-300 text-xs">Ctrl+S</span>
              </button>
            </>
          )}
          <button onClick={handleNewNote} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors text-sm">
            <Plus size={14} />New Note
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left Panel - Note List */}
        <div className="w-72 border-r border-gray-800 flex flex-col bg-gray-900">
          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <input ref={searchRef} type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search notes... (Ctrl+K)"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {search && <button onClick={() => handleSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={12} /></button>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-indigo-500" size={24} /></div>
            ) : notes.length === 0 ? (
              <div className="text-center py-12 px-4">
                <FileText className="text-gray-700 mx-auto mb-3" size={40} />
                <p className="text-gray-500 text-sm mb-4">No notes yet</p>
                <button onClick={handleNewNote} className="text-indigo-400 hover:text-indigo-300 text-sm">+ Create your first note</button>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {notes.map(note => (
                  <div key={note.id} onClick={() => handleSelectNote(note)}
                    className={`p-3 cursor-pointer transition-all hover:bg-gray-800 group ${selectedNote?.id === note.id ? "bg-gray-800 border-l-2 border-indigo-500" : "border-l-2 border-transparent"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white text-sm font-medium truncate mb-1">{note.title}</h3>
                        <p className="text-gray-600 text-xs truncate">{note.content_text?.slice(0, 60) || "Empty note"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-gray-600 text-xs flex items-center gap-0.5">
                            <Clock size={9} />{new Date(note.updated_at).toLocaleDateString()}
                          </span>
                          {note.word_count > 0 && <span className="text-gray-600 text-xs">{note.word_count}w</span>}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(note) }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1 rounded hover:bg-gray-700">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Editor */}
        <div className="flex-1 flex flex-col bg-gray-950">
          {selectedNote ? (
            <>
              {/* Toolbar */}
              <div className="border-b border-gray-800 px-6 py-2 flex items-center gap-1 bg-gray-900 flex-wrap">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="flex-1 bg-transparent text-xl font-bold text-white focus:outline-none mr-4 min-w-0"
                  placeholder="Note title..."
                />
                <div className="flex items-center gap-0.5 border-r border-gray-700 pr-2 mr-2">
                  <ToolBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold"><Bold size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic"><Italic size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleHighlight().run()} active={editor?.isActive("highlight")} title="Highlight"><Hash size={14} /></ToolBtn>
                </div>
                <div className="flex items-center gap-0.5 border-r border-gray-700 pr-2 mr-2">
                  <ToolBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullet List"><List size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} title="Numbered List"><ListOrdered size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleTaskList().run()} active={editor?.isActive("taskList")} title="Task List"><CheckSquare size={14} /></ToolBtn>
                </div>
                <div className="flex items-center gap-0.5">
                  <ToolBtn onClick={() => editor?.chain().focus().toggleCodeBlock().run()} active={editor?.isActive("codeBlock")} title="Code Block"><Code size={14} /></ToolBtn>
                </div>
              </div>

              {/* TipTap Editor */}
              <div className="flex-1 overflow-y-auto">
                <EditorContent editor={editor} className="h-full" />
              </div>

              {/* Footer */}
              <div className="border-t border-gray-800 px-6 py-2 bg-gray-900 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span>{wordCount} words</span>
                  <span>{charCount} characters</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Updated: {new Date(selectedNote.updated_at).toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileText className="text-gray-800 mx-auto mb-4" size={80} />
                <h3 className="text-gray-500 text-xl font-semibold mb-2">Your Developer Notebook</h3>
                <p className="text-gray-600 text-sm mb-6">Rich text notes with code blocks, task lists, and more</p>
                <div className="flex items-center justify-center gap-3 text-xs text-gray-600 mb-6">
                  <span className="bg-gray-800 px-3 py-1.5 rounded-lg">Ctrl+K to search</span>
                  <span className="bg-gray-800 px-3 py-1.5 rounded-lg">Ctrl+S to save</span>
                  <span className="bg-gray-800 px-3 py-1.5 rounded-lg">Auto-saves every 2s</span>
                </div>
                <button onClick={handleNewNote} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors mx-auto">
                  <Plus size={16} />Create First Note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Toolbar button component
function ToolBtn({ onClick, active, title, children }: { onClick: () => void, active?: boolean, title: string, children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded transition-colors ${active ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
      {children}
    </button>
  )
}
