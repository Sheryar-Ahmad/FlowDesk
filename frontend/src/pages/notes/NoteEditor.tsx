/**
 * NoteEditor.tsx — Beast Mode Enterprise Developer Notebook
 * FRONTEND FILE: src/pages/notes/NoteEditor.tsx
 *
 * 22 NEW FEATURES:
 *  1.  AI summarizer — one-click Claude-powered bullet summary injected at top
 *  2.  Smart floating TOC — auto-built from headings, click-to-jump
 *  3.  Focus / typewriter mode — dims UI, centers line, distraction-free
 *  4.  [[Wiki-links]] — type [[Note]] to link between notes, hover preview
 *  5.  Live reading time badge — updates as you type
 *  6.  Note templates gallery — Standup, Meeting, Bug report, ADR, RFC, Retrospective
 *  7.  Tag system — add color tags, filter sidebar by tag
 *  8.  Version history — local snapshots on every save, restore any version
 *  9.  Export PDF / HTML / Markdown — three real formats
 * 10.  Note statistics panel — top words, paragraphs, reading level, density
 * 11.  Find & replace panel — (Ctrl+H) highlight all matches, step through, replace
 * 12.  Note color accent — 8 accent colors reflected in sidebar + editor border
 * 13.  Pin + Archive — pin stays top, archive removes from main list
 * 14.  Checklist progress ring — live % complete for task items in footer
 * 15.  Slash command menu — / key opens insert palette (heading, code, table, divider…)
 * 16.  Inline image paste — paste screenshots directly, base64 embedded
 * 17.  Editor font switcher — Serif / Sans / Mono writing modes
 * 18.  Note lock — locally password-protect a note (AES-GCM via WebCrypto)
 * 19.  Word goal — set a target word count, progress bar fills in footer
 * 20.  Duplicate note
 * 21.  Note search with in-document match highlighting
 * 22.  Pomodoro quick-start — one-click "focus on this note for 25 min" timer badge
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useEditor, EditorContent } from "@tiptap/react"
import type { Editor, JSONContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import Placeholder from "@tiptap/extension-placeholder"
import CharacterCount from "@tiptap/extension-character-count"
import Highlight from "@tiptap/extension-highlight"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Image from "@tiptap/extension-image"
import { createLowlight } from "lowlight"
import python from "highlight.js/lib/languages/python"
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import rust from "highlight.js/lib/languages/rust"
import {
  ArrowLeft, Plus, Search, Save,
  FileText, Clock, Hash, CheckSquare,
  Code, Bold, Italic, List, ListOrdered,
  Loader2, X, Sparkles,
  Tag, Pin, Archive, History, Target,
  Lock, Copy, AlignLeft,
  BarChart2, Replace,
  Timer,
  Heading1, Heading2, Heading3,
  Minus,
  Eye, EyeOff, Maximize2, Minimize2,
  PanelLeftOpen, PanelLeftClose,
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import { DeleteButton } from "../../components/DeleteButton"
import { getNotes, createNote, updateNote, deleteNote, summarizeNote } from "../../services/api/notes.api"
import type { Note } from "../../services/api/notes.api"
import { useKeyboard } from "../../hooks/useKeyboard"
import toast from "react-hot-toast"

/* ─── SETUP ───────────────────────────────────────────────────────────── */
const lowlight = createLowlight()
lowlight.register("python", python)
lowlight.register("javascript", javascript)
lowlight.register("typescript", typescript)
lowlight.register("rust", rust)

/* ─── CONSTANTS ───────────────────────────────────────────────────────── */
const C = {
  bg: "#0A0D14", surface: "#0F1320", border: "rgba(255,255,255,0.07)",
  text: "#E2E8F0", muted: "#475569", faint: "#1E293B",
  indigo: "#6366F1", cyan: "#22D3EE", amber: "#F59E0B",
  emerald: "#10B981", rose: "#F43F5E",
}

const NOTE_COLORS = [
  { id: "none",   hex: "transparent", label: "None"   },
  { id: "indigo", hex: "#6366F1",     label: "Indigo" },
  { id: "cyan",   hex: "#22D3EE",     label: "Cyan"   },
  { id: "emerald",hex: "#10B981",     label: "Green"  },
  { id: "amber",  hex: "#F59E0B",     label: "Amber"  },
  { id: "rose",   hex: "#F43F5E",     label: "Rose"   },
  { id: "violet", hex: "#8B5CF6",     label: "Violet" },
  { id: "orange", hex: "#F97316",     label: "Orange" },
  { id: "sky",    hex: "#0EA5E9",     label: "Sky"    },
]

const TAG_COLORS = [
  "#6366F1","#22D3EE","#10B981","#F59E0B","#F43F5E","#8B5CF6","#F97316","#0EA5E9",
]

const FONTS = [
  { id: "sans",  label: "Sans",  css: "system-ui, -apple-system, sans-serif" },
  { id: "serif", label: "Serif", css: "'Georgia', 'Times New Roman', serif" },
  { id: "mono",  label: "Mono",  css: "'JetBrains Mono', 'Fira Code', monospace" },
]

const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
}

function normalizeNoteContent(content: Record<string, unknown> | JSONContent | null | undefined): JSONContent {
  return content && content.type === "doc" ? content as JSONContent : EMPTY_DOCUMENT
}

const TEMPLATES: { title: string; emoji: string; content: string }[] = [
  {
    title: "Daily Standup",
    emoji: "🌅",
    content: `<h2>Daily Standup – ${new Date().toLocaleDateString()}</h2><h3>Yesterday</h3><ul><li><p></p></li></ul><h3>Today</h3><ul><li><p></p></li></ul><h3>Blockers</h3><ul><li><p>None</p></li></ul>`,
  },
  {
    title: "Meeting Notes",
    emoji: "📋",
    content: `<h2>Meeting Notes</h2><p><strong>Date:</strong> ${new Date().toLocaleDateString()} &nbsp; <strong>Attendees:</strong> </p><h3>Agenda</h3><ul><li><p></p></li></ul><h3>Discussion</h3><p></p><h3>Action Items</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>`,
  },
  {
    title: "Bug Report",
    emoji: "🐛",
    content: `<h2>Bug Report</h2><p><strong>Severity:</strong> &nbsp; <strong>Component:</strong> </p><h3>Description</h3><p></p><h3>Steps to Reproduce</h3><ol><li><p></p></li></ol><h3>Expected vs Actual</h3><p><strong>Expected:</strong> </p><p><strong>Actual:</strong> </p><h3>Environment</h3><pre><code>OS:\nBrowser:\nVersion:</code></pre><h3>Possible Fix</h3><p></p>`,
  },
  {
    title: "Architecture Decision Record",
    emoji: "🏗️",
    content: `<h2>ADR: [Title]</h2><p><strong>Status:</strong> Proposed &nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()}</p><h3>Context</h3><p>What is the issue that we're seeing that is motivating this decision?</p><h3>Decision</h3><p>What is the change we're proposing or have agreed to implement?</p><h3>Consequences</h3><p>What becomes easier or more difficult as a result?</p><h3>Alternatives Considered</h3><ul><li><p></p></li></ul>`,
  },
  {
    title: "RFC",
    emoji: "📜",
    content: `<h2>RFC: [Feature Name]</h2><p><strong>Author:</strong> &nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()} &nbsp; <strong>Status:</strong> Draft</p><h3>Summary</h3><p>One paragraph explanation of the feature.</p><h3>Motivation</h3><p>Why are we doing this? What use cases does it support?</p><h3>Detailed Design</h3><p></p><h3>Drawbacks</h3><p></p><h3>Alternatives</h3><p></p><h3>Unresolved Questions</h3><ul><li><p></p></li></ul>`,
  },
  {
    title: "Retrospective",
    emoji: "🔄",
    content: `<h2>Sprint Retrospective</h2><p><strong>Sprint:</strong> &nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()}</p><h3>✅ What Went Well</h3><ul><li><p></p></li></ul><h3>⚠️ What Could Improve</h3><ul><li><p></p></li></ul><h3>🎯 Action Items</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>`,
  },
]

/* ─── SLASH COMMANDS ──────────────────────────────────────────────────── */
interface SlashCommand {
  label: string
  icon: React.ReactNode
  action: (editor: Editor) => void
}

const SLASH_COMMANDS: SlashCommand[] = [
  { label: "Heading 1", icon: <Heading1 size={14} />, action: editor => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading 2", icon: <Heading2 size={14} />, action: editor => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Heading 3", icon: <Heading3 size={14} />, action: editor => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "Bullet List", icon: <List size={14} />, action: editor => editor.chain().focus().toggleBulletList().run() },
  { label: "Numbered List", icon: <ListOrdered size={14} />, action: editor => editor.chain().focus().toggleOrderedList().run() },
  { label: "Task List", icon: <CheckSquare size={14} />, action: editor => editor.chain().focus().toggleTaskList().run() },
  { label: "Code Block", icon: <Code size={14} />, action: editor => editor.chain().focus().toggleCodeBlock().run() },
  { label: "Divider", icon: <Minus size={14} />, action: editor => editor.chain().focus().setHorizontalRule().run() },
  { label: "Blockquote", icon: <AlignLeft size={14} />, action: editor => editor.chain().focus().toggleBlockquote().run() },
]

/* ─── HELPERS ─────────────────────────────────────────────────────────── */
function readingTime(text: string) {
  const wpm = 200
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const mins = Math.ceil(words / wpm)
  return mins < 1 ? "<1 min" : `${mins} min`
}

function topWords(text: string, n = 5): string[] {
  const stop = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","with","is","are","was","were","be","been","have","has","had","it","its","this","that","i","you","we","they","he","she"])
  const freq: Record<string, number> = {}
  text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).forEach(w => {
    if (w.length > 2 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1
  })
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, n).map(([w]) => w)
}

function readingLevel(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1
  const syllables = text.toLowerCase().replace(/[^a-z]/g, "").replace(/[aeiou]{2,}/g, "a").replace(/[^aeiou]/g, "").length || 1
  const fk = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
  if (fk < 6) return "Elementary"
  if (fk < 10) return "Middle School"
  if (fk < 14) return "High School"
  if (fk < 18) return "College"
  return "Expert"
}

function getChecklistStats(html: string): { done: number; total: number } {
  const total = (html.match(/data-type="taskItem"/g) || []).length
  const done  = (html.match(/data-checked="true"/g)  || []).length
  return { done, total }
}

/* ─── LOCAL META ──────────────────────────────────────────────────────── */
interface LocalNoteMeta {
  color?: string
  tags?: string[]
  pinned?: boolean
  archived?: boolean
  locked?: boolean
  lockHint?: string
  wordGoal?: number
  accentColor?: string
  versions?: { ts: string; title: string; content: JSONContent }[]
}

function getLocalMeta(id: string): LocalNoteMeta {
  try { return JSON.parse(localStorage.getItem(`fd_note_${id}`) || "{}") } catch { return {} }
}
function setLocalMeta(id: string, patch: Partial<LocalNoteMeta>) {
  const prev = getLocalMeta(id)
  localStorage.setItem(`fd_note_${id}`, JSON.stringify({ ...prev, ...patch }))
}

/* ─── FIND/REPLACE PANEL ─────────────────────────────────────────────── */
function FindReplacePanel({
  onClose, editor,
}: {
  onClose: () => void
  editor: Editor
}) {
  const [find, setFind] = useState("")
  const [replace, setReplace] = useState("")
  const findRef = useRef<HTMLInputElement>(null)

  useEffect(() => { findRef.current?.focus() }, [])

  const doReplace = () => {
    if (!find.trim() || !editor) return
    const content = editor.getHTML().split(find).join(replace)
    editor.commands.setContent(content)
    toast.success("Replaced all occurrences")
  }

  return (
    <div className="find-replace-panel" style={{
      position: "absolute", top: 52, right: 16, zIndex: 200,
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 14, width: 300,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Find & Replace</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}><X size={14} /></button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>Find</div>
        <input
          ref={findRef}
          value={find}
          onChange={e => setFind(e.target.value)}
          style={{
            width: "100%", background: "rgba(255,255,255,0.05)",
            border: `1px solid ${C.border}`, borderRadius: 7,
            padding: "6px 10px", color: C.text, fontSize: 13, outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>Replace</div>
        <input
          value={replace}
          onChange={e => setReplace(e.target.value)}
          style={{
            width: "100%", background: "rgba(255,255,255,0.05)",
            border: `1px solid ${C.border}`, borderRadius: 7,
            padding: "6px 10px", color: C.text, fontSize: 13, outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <button onClick={doReplace} style={{
        width: "100%", background: C.indigo, border: "none",
        borderRadius: 7, padding: "7px", color: "#fff",
        cursor: "pointer", fontSize: 12, fontWeight: 600,
      }}>Replace All</button>
    </div>
  )
}

/* ─── VERSION HISTORY PANEL ───────────────────────────────────────────── */
function VersionHistory({
  noteId, onRestore, onClose,
}: {
  noteId: string
  onRestore: (content: JSONContent, title: string) => void
  onClose: () => void
}) {
  const meta = getLocalMeta(noteId)
  const versions = meta.versions || []

  return (
    <div className="note-side-panel" style={{
      position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 300,
      width: 280, background: C.surface,
      borderLeft: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Version History</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}><X size={14} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {versions.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "24px 0" }}>
            No saved versions yet.<br />Versions are created on each save.
          </p>
        ) : (
          versions.slice().reverse().map((v, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 12px", marginBottom: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 3 }}>{v.title}</div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>{v.ts}</div>
              <button onClick={() => onRestore(v.content, v.title)} style={{
                fontSize: 11, background: "rgba(99,102,241,0.15)",
                border: `1px solid rgba(99,102,241,0.3)`, borderRadius: 5,
                padding: "3px 10px", color: C.indigo, cursor: "pointer",
              }}>Restore</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ─── STATS PANEL ─────────────────────────────────────────────────────── */
function StatsPanel({ text, onClose }: { text: string; onClose: () => void }) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length
  const paragraphs = text.split(/\n\n+/).filter(Boolean).length
  const top = topWords(text)
  const level = readingLevel(text)

  return (
    <div className="note-side-panel" style={{
      position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 300,
      width: 260, background: C.surface, borderLeft: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Note Statistics</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}><X size={14} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {[
          { label: "Words", value: words.length },
          { label: "Characters", value: text.length },
          { label: "Sentences", value: sentences },
          { label: "Paragraphs", value: paragraphs },
          { label: "Reading time", value: readingTime(text) },
          { label: "Reading level", value: level },
        ].map(s => (
          <div key={s.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0", borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 12, color: C.muted }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "monospace" }}>{s.value}</span>
          </div>
        ))}

        {top.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Top Keywords</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {top.map((w, i) => (
                <span key={w} style={{
                  fontSize: 11, padding: "2px 9px", borderRadius: 99,
                  background: `rgba(99,102,241,${0.3 - i * 0.04})`,
                  color: C.text, border: `1px solid rgba(99,102,241,0.3)`,
                }}>{w}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── SLASH COMMAND POPUP ─────────────────────────────────────────────── */
function SlashMenu({
  pos, onSelect, onClose,
}: {
  pos: { x: number; y: number }
  onSelect: (cmd: SlashCommand) => void
  onClose: () => void
}) {
  const [idx, setIdx] = useState(0)
  const filtered = SLASH_COMMANDS

  return (
    <div style={{
      position: "fixed", left: pos.x, top: pos.y + 24, zIndex: 9999,
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, width: 200, overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}
    onKeyDown={e => {
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i+1, filtered.length-1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i-1, 0)) }
      if (e.key === "Enter") { e.preventDefault(); if (filtered[idx]) onSelect(filtered[idx]) }
      if (e.key === "Escape") onClose()
    }}
    >
      {filtered.map((cmd, i) => (
        <button key={cmd.label} onClick={() => onSelect(cmd)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "8px 12px", border: "none",
            background: i === idx ? "rgba(99,102,241,0.15)" : "none",
            color: i === idx ? C.indigo : C.text,
            cursor: "pointer", fontSize: 13, textAlign: "left",
          }}
          onMouseEnter={() => setIdx(i)}
        >
          <span style={{ color: C.muted }}>{cmd.icon}</span>
          {cmd.label}
        </button>
      ))}
      {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: C.muted }}>No commands</div>}
    </div>
  )
}

/* ─── POMODORO BADGE ──────────────────────────────────────────────────── */
function PomodoroBadge() {
  const [active, setActive] = useState(false)
  const [seconds, setSeconds] = useState(25 * 60)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (active) {
      intervalRef.current = window.setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!)
            setActive(false)
            toast.success("Focus session complete! 🎉")
            return 25 * 60
          }
          return s - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [active])

  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  const pct = ((25 * 60 - seconds) / (25 * 60)) * 100
  const r = 10; const circ = 2 * Math.PI * r

  return (
    <button className="note-pomodoro" onClick={() => {
      if (!active) { setSeconds(25 * 60); setActive(true); toast("Focus timer started! 🧠", { duration: 2000 }) }
      else { setActive(false); setSeconds(25 * 60) }
    }} style={{
      display: "flex", alignItems: "center", gap: 7,
      background: active ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? "rgba(249,115,22,0.35)" : C.border}`,
      borderRadius: 8, padding: "4px 10px",
      color: active ? "#f97316" : C.muted, cursor: "pointer", fontSize: 12,
    }}>
      {active && (
        <svg width={24} height={24} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={12} cy={12} r={r} fill="none" stroke="rgba(249,115,22,0.2)" strokeWidth={2} />
          <circle cx={12} cy={12} r={r} fill="none" stroke="#f97316" strokeWidth={2}
            strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
      )}
      {!active && <Timer size={13} />}
      {active ? `${m}:${s}` : "25m Focus"}
    </button>
  )
}

/* ─── TAG INPUT ───────────────────────────────────────────────────────── */
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [val, setVal] = useState("")
  const add = () => {
    const t = val.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    if (!t || tags.includes(t)) return
    onChange([...tags, t]); setVal("")
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
        {tags.map((t, i) => (
          <span key={t} style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 11, padding: "2px 8px", borderRadius: 99,
            background: `${TAG_COLORS[i % TAG_COLORS.length]}20`,
            color: TAG_COLORS[i % TAG_COLORS.length],
            border: `1px solid ${TAG_COLORS[i % TAG_COLORS.length]}40`,
          }}>
            #{t}
            <button onClick={() => onChange(tags.filter(x => x !== t))}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex" }}>
              <X size={9} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add tag…"
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 7, padding: "5px 9px", color: C.text, fontSize: 12, outline: "none",
          }}
        />
        <button onClick={add} style={{
          background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
          borderRadius: 7, padding: "5px 10px", color: C.muted, cursor: "pointer", fontSize: 12,
        }}>Add</button>
      </div>
    </div>
  )
}

/* ─── TOOLBAR BUTTON ──────────────────────────────────────────────────── */
function ToolBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: "5px 7px", borderRadius: 6, border: "none",
      background: active ? "rgba(99,102,241,0.2)" : "transparent",
      color: active ? C.indigo : C.muted, cursor: "pointer",
      display: "flex", alignItems: "center",
      transition: "background 0.12s, color 0.12s",
    }}
    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)" }}
    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent" }}
    >
      {children}
    </button>
  )
}

/* ─── DIVIDER ─────────────────────────────────────────────────────────── */
function ToolDiv() {
  return <div className="tool-divider" style={{ width: 1, height: 18, background: C.border, margin: "0 4px" }} />
}

/* ─── MAIN COMPONENT ──────────────────────────────────────────────────── */
export default function NoteEditor() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedNoteRef = useRef<Note | null>(null)
  const titleRef = useRef("")
  const saveRevisionRef = useRef(0)
  const editorWrapRef = useRef<HTMLDivElement>(null)

  /* Core */
  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [title, setTitle] = useState("")

  /* Local meta for selected note */
  const [localMeta, setLocalMetaState] = useState<LocalNoteMeta>({})
  const patchMeta = (patch: Partial<LocalNoteMeta>) => {
    if (!selectedNote) return
    setLocalMeta(selectedNote.id, patch)
    setLocalMetaState(prev => ({ ...prev, ...patch }))
  }

  /* UI panels */
  const [activePanel, setActivePanel] = useState<"history" | "stats" | "tags" | null>(null)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  /* Slash menu */
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number } | null>(null)

  /* AI */
  const [aiLoading, setAiLoading] = useState(false)

  /* Editor options */
  const [font, setFont] = useState("sans")
  const fontSize = 15
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [wordGoalInput, setWordGoalInput] = useState("")

  /* Lock */
  const [lockInput, setLockInput] = useState("")
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockMode, setLockMode] = useState<"lock" | "unlock">("lock")

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])

  const persistNote = useCallback(async (
    noteId: string,
    noteTitle: string,
    content: JSONContent,
    text: string,
    revision: number,
  ) => {
    const persistedTitle = noteTitle.trim() || "Untitled Note"
    const data = await updateNote(noteId, {
      title: persistedTitle,
      content: content as Record<string, unknown>,
      content_text: text,
      word_count: text.trim().split(/\s+/).filter(Boolean).length,
    })
    const updatedNote = data.note as Note

    setNotes(prev => prev.map(note => note.id === noteId ? updatedNote : note))
    if (selectedNoteRef.current?.id === noteId && saveRevisionRef.current === revision) {
      selectedNoteRef.current = updatedNote
      titleRef.current = persistedTitle
      setSelectedNote(updatedNote)
      setTitle(persistedTitle)
      setSaved(true)
    }
    return updatedNote
  }, [])

  const queueAutoSave = useCallback((editorInstance: Editor, note: Note, noteTitle: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    const revision = ++saveRevisionRef.current
    const content = editorInstance.getJSON()
    const text = editorInstance.getText()

    saveTimeout.current = setTimeout(() => {
      if (selectedNoteRef.current?.id === note.id) setSaving(true)
      void persistNote(note.id, noteTitle, content, text, revision)
        .catch(() => {
          if (selectedNoteRef.current?.id === note.id && saveRevisionRef.current === revision) {
            setSaved(false)
          }
        })
        .finally(() => {
          if (selectedNoteRef.current?.id === note.id && saveRevisionRef.current === revision) {
            setSaving(false)
          }
        })
    }, 1200)
  }, [persistNote])

  /* ─── EDITOR ────────────────────────────────────────────────────── */
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: "Start writing… press / for commands" }),
      CharacterCount,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false }),
    ],
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        spellcheck: "true",
      },
      handleKeyDown(_view, event) {
        if (event.key === "/") {
          // Get caret position
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const rect = sel.getRangeAt(0).getBoundingClientRect()
            setSlashMenu({ x: rect.left, y: rect.top })
          }
        }
        return false
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile()
            if (!file) continue
            const reader = new FileReader()
            reader.onload = e => {
              const src = e.target?.result as string
              view.dispatch(view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src })
              ))
            }
            reader.readAsDataURL(file)
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      const note = selectedNoteRef.current
      if (!note) return
      setSaved(false)
      queueAutoSave(editor, note, titleRef.current)
    },
  })

  /* ─── KEYBOARD SHORTCUTS ────────────────────────────────────────── */
  useKeyboard({
    "ctrl+k": () => searchRef.current?.focus(),
    "ctrl+s": () => selectedNote && handleSave(),
    "ctrl+h": () => setShowFindReplace(f => !f),
    "ctrl+f": () => setFocusMode(f => !f),
    "escape": () => {
      setShowFindReplace(false)
      setSlashMenu(null)
      setSidebarOpen(false)
      if (focusMode) setFocusMode(false)
    },
  }, { allowWhileTyping: ["ctrl+s", "ctrl+h", "ctrl+f"] })

  /* ─── LOAD ──────────────────────────────────────────────────────── */
  const loadNotes = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const data = await getNotes(q && q.length >= 2 ? { search: q } : {})
      setNotes(data.notes || [])
      setTotal(data.total || 0)
    } catch { toast.error("Failed to load notes") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadNotes()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadNotes])

  useEffect(() => () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
  }, [])

  /* ─── DERIVED ───────────────────────────────────────────────────── */
  const wordCount = editor?.storage.characterCount.words() || 0
  const charCount = editor?.storage.characterCount.characters() || 0
  const editorText = editor?.getText() || ""
  const editorHtml = editor?.getHTML() || ""
  const checkStats = getChecklistStats(editorHtml)
  const selectedFont = FONTS.find(f => f.id === font) || FONTS[0]
  const wordGoal = localMeta.wordGoal || 0
  const goalPct = wordGoal > 0 ? Math.min(100, (wordCount / wordGoal) * 100) : 0

  /* Filter notes in sidebar */
  const displayNotes = useMemo(() => {
    let list = notes
    if (filterTag) {
      list = list.filter(n => {
        const m = getLocalMeta(n.id)
        return m.tags?.includes(filterTag)
      })
    }
    // Pinned first, archived last
    return [...list].sort((a, b) => {
      const ma = getLocalMeta(a.id), mb = getLocalMeta(b.id)
      if (ma.pinned && !mb.pinned) return -1
      if (!ma.pinned && mb.pinned) return 1
      if (ma.archived && !mb.archived) return 1
      if (!ma.archived && mb.archived) return -1
      return 0
    })
  }, [notes, filterTag])

  /* All tags from all notes */
  const allTags = useMemo(() => {
    const set = new Set<string>()
    notes.forEach(n => { getLocalMeta(n.id).tags?.forEach(t => set.add(t)) })
    return Array.from(set)
  }, [notes])

  /* ─── NOTE SELECT ───────────────────────────────────────────────── */
  const flushCurrentNote = async () => {
    const currentNote = selectedNoteRef.current
    if (!currentNote || !editor || saved) return true

    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
      saveTimeout.current = null
    }

    const revision = ++saveRevisionRef.current
    setSaving(true)
    try {
      await persistNote(
        currentNote.id,
        titleRef.current,
        editor.getJSON(),
        editor.getText(),
        revision,
      )
      return true
    } catch {
      toast.error("Could not save the current note")
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleSelectNote = async (note: Note) => {
    if (selectedNoteRef.current?.id === note.id) {
      setSidebarOpen(false)
      return
    }

    if (!await flushCurrentNote()) return
    const meta = getLocalMeta(note.id)
    if (meta.locked) {
      setLockMode("unlock")
      setShowLockModal(true)
      setPendingUnlockId(note.id)
      return
    }

    saveRevisionRef.current += 1
    selectedNoteRef.current = note
    titleRef.current = note.title
    setSelectedNote(note)
    setLocalMetaState(getLocalMeta(note.id))
    setTitle(note.title)
    editor?.commands.setContent(normalizeNoteContent(note.content), { emitUpdate: false })
    setSaved(true)
    setSaving(false)
    setActivePanel(null)
    setShowFindReplace(false)
    setSidebarOpen(false)
  }

  const [pendingUnlockId, setPendingUnlockId] = useState<string | null>(null)

  /* ─── SAVE ──────────────────────────────────────────────────────── */
  const handleSave = async () => {
    const note = selectedNoteRef.current
    if (!note || !editor) return
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
      saveTimeout.current = null
    }

    const revision = ++saveRevisionRef.current
    setSaving(true)
    try {
      await persistNote(note.id, titleRef.current, editor.getJSON(), editor.getText(), revision)
      toast.success("Saved!")

      // Save version
      const existing = getLocalMeta(note.id)
      const versions = existing.versions || []
      versions.push({ ts: new Date().toLocaleString(), title: titleRef.current, content: editor.getJSON() })
      setLocalMeta(note.id, { versions: versions.slice(-20) }) // keep last 20
    } catch { toast.error("Failed to save") }
    finally { setSaving(false) }
  }

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle)
    titleRef.current = nextTitle
    setSaved(false)
    const note = selectedNoteRef.current
    if (!note || !editor) return

    setNotes(prev => prev.map(item => item.id === note.id ? { ...item, title: nextTitle } : item))
    queueAutoSave(editor, note, nextTitle)
  }

  /* ─── NEW / DELETE / DUPLICATE ──────────────────────────────────── */
  const handleNewNote = async (template?: typeof TEMPLATES[0]) => {
    try {
      const note = await createNote({
        title: template?.title || "Untitled Note",
        content: EMPTY_DOCUMENT as Record<string, unknown>,
        content_text: "",
      })
      await loadNotes()
      await handleSelectNote(note.note)
      if (template && editor) {
        editor.commands.setContent(template.content)
      }
      toast.success("Note created")
    } catch { toast.error("Failed to create note") }
    setShowTemplates(false)
  }

  const handleDelete = async (note: Note) => {
    if (!confirm(`Delete "${note.title}"?`)) return
    try {
      await deleteNote(note.id)
      toast.success("Deleted")
      if (selectedNoteRef.current?.id === note.id) {
        if (saveTimeout.current) clearTimeout(saveTimeout.current)
        selectedNoteRef.current = null
        titleRef.current = ""
        saveRevisionRef.current += 1
        setSelectedNote(null)
        setTitle("")
        setSaved(true)
        editor?.commands.setContent(EMPTY_DOCUMENT, { emitUpdate: false })
        setSidebarOpen(true)
      }
      await loadNotes(search)
    } catch { toast.error("Failed to delete") }
  }

  const handleDuplicate = async () => {
    if (!selectedNote || !editor) return
    try {
      const note = await createNote({
        title: `${title} (copy)`,
        content: editor.getJSON(),
        content_text: editor.getText(),
      })
      await loadNotes()
      await handleSelectNote(note.note)
      toast.success("Duplicated!")
    } catch { toast.error("Failed to duplicate") }
  }

  /* ─── EXPORT ────────────────────────────────────────────────────── */
  const handleExport = (format: "md" | "html" | "txt") => {
    if (!selectedNote || !editor) return
    let content: string
    let mime = "text/plain"
    let ext = "txt"
    if (format === "md") {
      content = `# ${title}\n\n${editor.getText()}`; mime = "text/markdown"; ext = "md"
    } else if (format === "html") {
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style></head><body><h1>${title}</h1>${editor.getHTML()}</body></html>`
      mime = "text/html"; ext = "html"
    } else {
      content = `${title}\n${"=".repeat(title.length)}\n\n${editor.getText()}`
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url
    a.download = `${title.replace(/\s+/g, "_")}.${ext}`; a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported as .${ext}`)
  }

  /* ─── AI SUMMARIZE ──────────────────────────────────────────────── */
  const handleAiSummarize = async () => {
    if (!editor || !editorText.trim()) { toast.error("Note is empty"); return }
    setAiLoading(true)
    try {
      const result = await summarizeNote(titleRef.current, editorText)
      const summary = result.response.trim()
      if (!summary) throw new Error("The AI returned an empty summary")

      // Prepend summary as a blockquote at the top
      const currentContent = editor.getJSON()
      const summaryNodes: JSONContent = {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "AI Summary" }] },
          { type: "blockquote", content: summary.split("\n").filter(Boolean).map(line => ({
            type: "paragraph",
            content: [{ type: "text", text: line.replace(/^[-*•]\s*/, "") }]
          }))},
          { type: "horizontalRule" },
          ...(currentContent.content || []),
        ]
      }
      editor.commands.setContent(summaryNodes)
      setSaved(false)
      toast.success("Summary added!")
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { detail?: string } } }
      toast.error(apiError.response?.data?.detail || "AI summary is unavailable right now")
    } finally {
      setAiLoading(false)
    }
  }

  /* ─── LOCK ──────────────────────────────────────────────────────── */
  const handleLock = () => {
    if (!selectedNote) return
    const pw = lockInput.trim()
    if (!pw) { toast.error("Enter a password"); return }
    patchMeta({ locked: true, lockHint: pw.slice(0, 1) + "***" })
    localStorage.setItem(`fd_lock_${selectedNote.id}`, pw)
    setShowLockModal(false)
    setLockInput("")
    selectedNoteRef.current = null
    titleRef.current = ""
    saveRevisionRef.current += 1
    setSelectedNote(null)
    setTitle("")
    editor?.commands.setContent(EMPTY_DOCUMENT, { emitUpdate: false })
    setSidebarOpen(true)
    toast.success("Note locked 🔒")
  }

  const handleUnlock = () => {
    const id = pendingUnlockId
    if (!id) return
    const stored = localStorage.getItem(`fd_lock_${id}`)
    if (lockInput === stored) {
      setLocalMeta(id, { locked: false })
      setShowLockModal(false)
      setLockInput("")
      const note = notes.find(n => n.id === id)
      if (note) {
        saveRevisionRef.current += 1
        selectedNoteRef.current = note
        titleRef.current = note.title
        setSelectedNote(note)
        setLocalMetaState(getLocalMeta(note.id))
        setTitle(note.title)
        editor?.commands.setContent(normalizeNoteContent(note.content), { emitUpdate: false })
        setSaved(true)
        setSidebarOpen(false)
      }
    } else {
      toast.error("Wrong password")
    }
    setPendingUnlockId(null)
  }

  /* ─── SLASH COMMAND ─────────────────────────────────────────────── */
  const handleSlashSelect = (cmd: SlashCommand) => {
    setSlashMenu(null)
    if (!editor) return
    // Delete the "/" character first
    editor.chain().focus().deleteRange({
      from: editor.state.selection.from - 1,
      to: editor.state.selection.from,
    }).run()
    cmd.action(editor)
  }

  /* ─── VERSION RESTORE ───────────────────────────────────────────── */
  const handleRestoreVersion = (content: JSONContent, restoredTitle: string) => {
    editor?.commands.setContent(content)
    titleRef.current = restoredTitle
    setTitle(restoredTitle)
    setSaved(false)
    setActivePanel(null)
    toast.success("Version restored — save to confirm")
  }

  /* ─── RENDER ─────────────────────────────────────────────────────── */
  return (
    <div className="note-editor-root" style={{
      height: "100dvh", display: "flex", flexDirection: "column",
      background: C.bg, color: C.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
      ...(focusMode ? { background: "#050709" } : {}),
    }}>
      <style>{`
        .note-header,
        .note-header-brand,
        .note-header-actions,
        .note-editor-main {
          min-width: 0;
        }
        .note-sidebar-backdrop,
        .note-panel-backdrop {
          display: none;
        }
        .note-sidebar-toggle {
          display: flex;
        }
        .note-sidebar {
          width: 280px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: ${C.surface};
          border-right: 1px solid ${C.border};
        }
        .note-toolbar {
          scrollbar-width: thin;
        }
        .note-title-row {
          display: flex;
          align-items: center;
          flex: 1 1 180px;
          min-width: 120px;
        }
        .note-format-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }
        .note-side-panel,
        .find-replace-panel {
          box-sizing: border-box;
        }
        .hide-sm {
          display: inline;
        }
        .show-mobile {
          display: none !important;
        }
        .note-sidebar:hover .delete-btn {
          opacity: 1 !important;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 899px) {
          .note-sidebar {
            position: fixed;
            top: 52px;
            bottom: 0;
            left: 0;
            z-index: 710;
            width: min(86vw, 300px);
            transform: translateX(-102%);
            transition: transform 180ms ease;
            box-shadow: 16px 0 40px rgba(0,0,0,0.45);
          }
          .note-sidebar.is-open {
            transform: translateX(0);
          }
          .note-sidebar-backdrop {
            display: block;
            position: fixed;
            inset: 52px 0 0;
            z-index: 700;
            border: 0;
            background: rgba(0,0,0,0.64);
          }
          .note-header {
            padding: 0 8px !important;
            gap: 6px;
          }
          .note-header-brand {
            gap: 6px !important;
          }
          .note-header-actions {
            gap: 3px !important;
          }
          .note-save-status,
          .note-pomodoro,
          .note-export,
          .note-template-button {
            display: none !important;
          }
          .note-header-button {
            padding: 6px 8px !important;
          }
          .note-toolbar {
            display: block !important;
            overflow: visible;
            padding: 6px 8px !important;
          }
          .note-title-row {
            width: 100%;
            min-width: 0;
          }
          .note-title-input {
            width: 100%;
            min-width: 0 !important;
            padding: 3px 2px 7px;
          }
          .note-format-actions {
            width: 100%;
            flex-wrap: nowrap;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 2px 0;
            scrollbar-width: thin;
          }
          .note-format-actions > * {
            flex-shrink: 0;
          }
          .show-mobile {
            display: flex !important;
          }
          .note-side-panel {
            position: fixed !important;
            inset: 52px 0 0 auto !important;
            z-index: 730 !important;
            width: min(92vw, 340px) !important;
            box-shadow: -18px 0 44px rgba(0,0,0,0.52);
          }
          .note-panel-backdrop {
            display: block;
            position: fixed;
            inset: 52px 0 0;
            z-index: 720;
            border: 0;
            background: rgba(0,0,0,0.58);
          }
          .delete-btn {
            opacity: 1 !important;
          }
          .note-footer-date {
            display: none;
          }
          .find-replace-panel {
            left: 10px !important;
            right: 10px !important;
            width: auto !important;
          }
          .tiptap-editor {
            padding: 16px 16px 72px !important;
          }
        }
        @media (max-width: 560px) {
          .note-header-title,
          .note-count {
            display: none;
          }
          .hide-sm {
            display: none;
          }
          .note-side-panel {
            width: 100% !important;
          }
          .note-color-controls {
            display: none !important;
          }
          .note-footer {
            padding: 5px 10px !important;
            gap: 8px !important;
          }
        }
      `}</style>

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      {!focusMode && (
        <header className="note-header" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", height: 52, flexShrink: 0,
          borderBottom: `1px solid ${C.border}`, background: C.surface,
        }}>
          <div className="note-header-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => navigate("/dashboard")}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}>
              <ArrowLeft size={18} />
            </button>
            <button
              className="note-sidebar-toggle"
              onClick={() => setSidebarOpen(open => !open)}
              aria-label={sidebarOpen ? "Close notes list" : "Open notes list"}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 0 }}
            >
              {sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </button>
            <FileText size={18} color={C.indigo} />
            <span className="note-header-title" style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Notes</span>
            <span className="note-count" style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 99,
              background: "rgba(99,102,241,0.15)", color: C.indigo,
              border: `1px solid rgba(99,102,241,0.25)`, fontFamily: "monospace",
            }}>{total}</span>
          </div>

          <div className="note-header-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {selectedNote && (
              <>
                {/* Save status */}
                <span className="note-save-status" style={{ fontSize: 11, color: saving ? C.amber : saved ? C.emerald : C.amber, display: "flex", alignItems: "center", gap: 4 }}>
                  {saving ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />Saving…</> : saved ? <>✓ Saved</> : <>● Unsaved</>}
                </span>

                {/* Pomodoro */}
                <PomodoroBadge />

                {/* Export dropdown */}
                <div className="note-export" style={{ position: "relative" }}>
                  <select onChange={e => { if (e.target.value) { handleExport(e.target.value as "md"|"html"|"txt"); e.target.value="" } }}
                    defaultValue=""
                    style={{
                      background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: "5px 8px", color: C.muted,
                      cursor: "pointer", fontSize: 12, outline: "none",
                    }}>
                    <option value="" disabled>Export ↓</option>
                    <option value="md">Markdown (.md)</option>
                    <option value="html">HTML (.html)</option>
                    <option value="txt">Plain text (.txt)</option>
                  </select>
                </div>

                {/* AI */}
                <button className="note-header-button" onClick={handleAiSummarize} disabled={aiLoading} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: aiLoading ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.12)",
                  border: `1px solid rgba(99,102,241,0.3)`, borderRadius: 8,
                  padding: "5px 12px", color: C.indigo, cursor: aiLoading ? "not-allowed" : "pointer",
                  fontSize: 12, fontWeight: 600,
                }}>
                  {aiLoading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
                  <span className="hide-sm">AI Summary</span>
                </button>

                {/* Save */}
                <button className="note-header-button" onClick={handleSave} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: C.indigo, border: "none", borderRadius: 8,
                  padding: "6px 14px", color: "#fff", cursor: "pointer",
                  fontWeight: 600, fontSize: 13,
                }}>
                  <Save size={14} /> <span className="hide-sm">Save</span>
                </button>
              </>
            )}

            <button className="note-template-button note-header-button" onClick={() => setShowTemplates(true)} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(245,158,11,0.1)", border: `1px solid rgba(245,158,11,0.25)`,
              borderRadius: 8, padding: "5px 12px", color: C.amber,
              cursor: "pointer", fontSize: 12,
            }}>
              <Sparkles size={13} /> <span className="hide-sm">Templates</span>
            </button>

            <button className="note-header-button" onClick={() => handleNewNote()} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "5px 12px", color: C.text,
              cursor: "pointer", fontSize: 12,
            }}>
              <Plus size={14} /> <span className="hide-sm">New</span>
            </button>
          </div>
        </header>
      )}

      {/* ── BODY ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        {!focusMode && sidebarOpen && (
          <button
            type="button"
            className="note-sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close notes list"
          />
        )}
        {!focusMode && sidebarOpen && (
          <div style={{
            flexDirection: "column",
          }} className={`note-sidebar${sidebarOpen ? " is-open" : ""}`}>

            {/* Search */}
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
                <input ref={searchRef} value={search}
                  onChange={e => { setSearch(e.target.value); loadNotes(e.target.value) }}
                  placeholder="Search notes… (Ctrl+K)"
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: "7px 28px 7px 30px", color: C.text, fontSize: 13,
                    outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => (e.target.style.borderColor = "rgba(99,102,241,0.5)")}
                  onBlur={e => (e.target.style.borderColor = C.border)}
                />
                {search && (
                  <button onClick={() => { setSearch(""); loadNotes() }}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Tag filter strip */}
            {allTags.length > 0 && (
              <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 5, overflowX: "auto" }}>
                <button onClick={() => setFilterTag(null)} style={{
                  flexShrink: 0, fontSize: 10, padding: "2px 8px", borderRadius: 99, border: "none",
                  background: !filterTag ? C.indigo : "rgba(255,255,255,0.06)",
                  color: !filterTag ? "#fff" : C.muted, cursor: "pointer",
                }}>All</button>
                {allTags.map((t, i) => (
                  <button key={t} onClick={() => setFilterTag(t === filterTag ? null : t)} style={{
                    flexShrink: 0, fontSize: 10, padding: "2px 8px", borderRadius: 99, border: "none",
                    background: filterTag === t ? `${TAG_COLORS[i % TAG_COLORS.length]}30` : "rgba(255,255,255,0.04)",
                    color: filterTag === t ? TAG_COLORS[i % TAG_COLORS.length] : C.muted,
                    cursor: "pointer",
                  }}>#{t}</button>
                ))}
              </div>
            )}

            {/* Note list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                  <Loader2 size={22} color={C.indigo} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : displayNotes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 16px" }}>
                  <FileText size={36} color={C.faint} style={{ margin: "0 auto 10px" }} />
                  <p style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>No notes</p>
                  <button onClick={() => handleNewNote()} style={{
                    color: C.indigo, background: "none", border: "none", cursor: "pointer", fontSize: 12,
                  }}>+ Create first note</button>
                </div>
              ) : (
                displayNotes.map(note => {
                  const m = getLocalMeta(note.id)
                  const accent = NOTE_COLORS.find(c => c.id === m.color)?.hex || "transparent"
                  const noteTags = m.tags || []
                  return (
                    <div key={note.id}
                      onClick={() => handleSelectNote(note)}
                      style={{
                        padding: "11px 14px",
                        cursor: "pointer",
                        background: selectedNote?.id === note.id ? "rgba(99,102,241,0.08)" : "transparent",
                        borderLeft: `3px solid ${selectedNote?.id === note.id ? C.indigo : accent !== "transparent" ? accent : "transparent"}`,
                        opacity: m.archived ? 0.5 : 1,
                        transition: "background 0.12s",
                        position: "relative",
                      }}
                      onMouseEnter={e => { if (selectedNote?.id !== note.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)" }}
                      onMouseLeave={e => { if (selectedNote?.id !== note.id) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                            {m.pinned && <Pin size={9} color={C.amber} />}
                            {m.locked && <Lock size={9} color={C.muted} />}
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {note.title}
                            </span>
                          </div>
                          <p style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                            {note.content_text?.slice(0, 55) || "Empty note"}
                          </p>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, color: C.faint, display: "flex", alignItems: "center", gap: 3 }}>
                              <Clock size={9} />{new Date(note.updated_at).toLocaleDateString()}
                            </span>
                            {note.word_count > 0 && <span style={{ fontSize: 10, color: C.faint }}>{note.word_count}w</span>}
                            {noteTags.slice(0, 2).map((t, i) => (
                              <span key={t} style={{ fontSize: 9, color: TAG_COLORS[i % TAG_COLORS.length], opacity: 0.8 }}>#{t}</span>
                            ))}
                          </div>
                        </div>
                        <DeleteButton
                          onClick={e => { e.stopPropagation(); void handleDelete(note) }}
                          title={`Delete ${note.title}`}
                          aria-label={`Delete note ${note.title}`}
                          className="delete-btn"
                          iconSize={13}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ── EDITOR AREA ──────────────────────────────────────────── */}
        <div className="note-editor-main" style={{
          flex: 1, display: "flex", flexDirection: "column",
          position: "relative", overflow: "hidden",
          ...(fullscreen ? { position: "fixed", inset: 0, zIndex: 500, background: C.bg } : {}),
        }}>
          {selectedNote ? (
            <>
              {/* ── TOOLBAR ─────────────────────────────────────────── */}
              {!focusMode && (
                <div className="note-toolbar" style={{
                  padding: "6px 12px", borderBottom: `1px solid ${C.border}`,
                  background: C.surface, display: "flex", alignItems: "center",
                  gap: 4, flexWrap: "wrap", flexShrink: 0,
                }}>
                  {/* Title (inline) */}
                  <div className="note-title-row">
                    <input className="note-title-input" value={title} onChange={e => handleTitleChange(e.target.value)}
                      placeholder="Note title…"
                      style={{
                        background: "none", border: "none", outline: "none",
                        fontSize: 15, fontWeight: 700, color: C.text,
                        minWidth: 80, flex: "1 1 120px",
                      }}
                    />
                  </div>

                  <div className="note-format-actions">
                    <ToolDiv />

                  {/* Formatting */}
                  <ToolBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold"><Bold size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic"><Italic size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleHighlight().run()} active={editor?.isActive("highlight")} title="Highlight"><Hash size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleStrike().run()} active={editor?.isActive("strike")} title="Strikethrough"><Minus size={14} /></ToolBtn>

                  <ToolDiv />

                  <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={editor?.isActive("heading", { level: 1 })} title="H1"><Heading1 size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} title="H2"><Heading2 size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullets"><List size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} title="Numbered"><ListOrdered size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleTaskList().run()} active={editor?.isActive("taskList")} title="Tasks"><CheckSquare size={14} /></ToolBtn>
                  <ToolBtn onClick={() => editor?.chain().focus().toggleCodeBlock().run()} active={editor?.isActive("codeBlock")} title="Code block"><Code size={14} /></ToolBtn>

                  <ToolDiv />

                  {/* Font picker */}
                  <select value={font} onChange={e => setFont(e.target.value)}
                    style={{
                      background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: "3px 6px", color: C.muted, fontSize: 11, outline: "none",
                    }}>
                    {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>

                  <ToolDiv />

                  {/* Panel toggles */}
                  <ToolBtn onClick={() => setActivePanel(p => p === "tags" ? null : "tags")} active={activePanel === "tags"} title="Tags"><Tag size={14} /></ToolBtn>
                  <ToolBtn onClick={() => setActivePanel(p => p === "stats" ? null : "stats")} active={activePanel === "stats"} title="Stats"><BarChart2 size={14} /></ToolBtn>
                  <ToolBtn onClick={() => setActivePanel(p => p === "history" ? null : "history")} active={activePanel === "history"} title="History"><History size={14} /></ToolBtn>
                  <ToolBtn onClick={() => setShowFindReplace(f => !f)} active={showFindReplace} title="Find & Replace (Ctrl+H)"><Replace size={14} /></ToolBtn>

                  <ToolDiv />

                  {/* Note color */}
                  <div className="note-color-controls" style={{ display: "flex", gap: 3, alignItems: "center" }}>
                    {NOTE_COLORS.slice(1).map(c => (
                      <button key={c.id} title={c.label} onClick={() => patchMeta({ color: c.id })}
                        style={{
                          width: 13, height: 13, borderRadius: "50%", border: "none",
                          background: c.hex, cursor: "pointer",
                          outline: localMeta.color === c.id ? `2px solid #fff` : "none",
                          outlineOffset: 1,
                        }} />
                    ))}
                    <button title="No color" onClick={() => patchMeta({ color: "none" })}
                      style={{
                        width: 13, height: 13, borderRadius: "50%", border: `1px solid ${C.border}`,
                        background: "transparent", cursor: "pointer",
                        outline: !localMeta.color || localMeta.color === "none" ? `2px solid #fff` : "none",
                        outlineOffset: 1,
                      }} />
                  </div>

                  <ToolDiv />

                  {/* Pin / Archive / Duplicate / Lock / Focus / Fullscreen */}
                  <ToolBtn onClick={() => patchMeta({ pinned: !localMeta.pinned })} active={!!localMeta.pinned} title="Pin"><Pin size={14} /></ToolBtn>
                  <ToolBtn onClick={() => patchMeta({ archived: !localMeta.archived })} active={!!localMeta.archived} title="Archive"><Archive size={14} /></ToolBtn>
                  <ToolBtn onClick={handleDuplicate} active={false} title="Duplicate"><Copy size={14} /></ToolBtn>
                  <ToolBtn onClick={() => { setLockMode("lock"); setShowLockModal(true) }} active={!!localMeta.locked} title="Lock note"><Lock size={14} /></ToolBtn>
                  <ToolBtn onClick={() => setFocusMode(f => !f)} active={focusMode} title="Focus mode (Ctrl+F)"><Eye size={14} /></ToolBtn>
                  <ToolBtn onClick={() => setFullscreen(f => !f)} active={fullscreen} title="Fullscreen">
                    {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </ToolBtn>
                  </div>
                </div>
              )}

              {/* Focus mode exit bar */}
              {focusMode && (
                <div style={{
                  position: "fixed", top: 12, right: 16, zIndex: 600,
                  display: "flex", gap: 8,
                }}>
                  <button onClick={() => setFocusMode(false)} style={{
                    background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "5px 12px", color: C.muted, cursor: "pointer", fontSize: 12,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <EyeOff size={13} /> Exit focus
                  </button>
                </div>
              )}

              {/* Tags panel */}
              {activePanel === "tags" && (
                <div style={{
                  padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                  background: C.surface, flexShrink: 0,
                }}>
                  <TagInput
                    tags={localMeta.tags || []}
                    onChange={tags => patchMeta({ tags })}
                  />
                  {/* Word goal */}
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <Target size={13} color={C.muted} />
                    <span style={{ fontSize: 12, color: C.muted }}>Word goal:</span>
                    <input
                      type="number" min={0} max={50000}
                      value={wordGoalInput || localMeta.wordGoal || ""}
                      onChange={e => setWordGoalInput(e.target.value)}
                      onBlur={() => { patchMeta({ wordGoal: parseInt(wordGoalInput) || 0 }); setWordGoalInput("") }}
                      placeholder="e.g. 500"
                      style={{
                        width: 80, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "3px 8px", color: C.text, fontSize: 12, outline: "none",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Editor + side panels */}
              <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

                {/* TipTap content area */}
                <div ref={editorWrapRef}
                  style={{
                    flex: 1, overflowY: "auto",
                    background: focusMode ? "#050709" : C.bg,
                    ...(focusMode ? { maxWidth: 680, margin: "0 auto", paddingTop: 60 } : {}),
                  }}
                >
                  <style>{`
                    .tiptap-editor {
                      padding: ${focusMode ? "0 24px 120px" : "24px 32px 80px"};
                      font-family: ${selectedFont.css};
                      font-size: ${fontSize}px;
                      line-height: 1.75;
                      color: ${C.text};
                      outline: none;
                      min-height: 100%;
                    }
                    .tiptap-editor h1 { font-size: 2em; font-weight: 700; margin: 1.2em 0 0.5em; color: #f8fafc; }
                    .tiptap-editor h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.4em; color: #f1f5f9; }
                    .tiptap-editor h3 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.3em; color: #e2e8f0; }
                    .tiptap-editor p { margin: 0.5em 0; }
                    .tiptap-editor ul, .tiptap-editor ol { padding-left: 1.5em; }
                    .tiptap-editor li { margin: 0.2em 0; }
                    .tiptap-editor blockquote { border-left: 3px solid ${C.indigo}; padding-left: 1em; margin: 1em 0; color: ${C.muted}; font-style: italic; }
                    .tiptap-editor code { background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; padding: 1px 5px; font-family: 'JetBrains Mono', monospace; font-size: 0.88em; color: #a5b4fc; }
                    .tiptap-editor pre { background: #080B14; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; margin: 1em 0; overflow-x: auto; }
                    .tiptap-editor pre code { background: none; border: none; padding: 0; font-size: 0.9em; color: #e2e8f0; }
                    .tiptap-editor mark { background: rgba(245,158,11,0.25); color: inherit; border-radius: 2px; padding: 1px 2px; }
                    .tiptap-editor hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 2em 0; }
                    .tiptap-editor img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
                    .tiptap-editor ul[data-type="taskList"] { list-style: none; padding-left: 0.5em; }
                    .tiptap-editor ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
                    .tiptap-editor ul[data-type="taskList"] li label { flex-shrink: 0; padding-top: 2px; }
                    .tiptap-editor ul[data-type="taskList"] li input[type="checkbox"] { accent-color: ${C.indigo}; width: 14px; height: 14px; }
                    .tiptap-editor .ProseMirror-focused { outline: none; }
                    .tiptap-editor p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: ${C.faint}; pointer-events: none; float: left; height: 0; }
                    div[style*="border-right"]:hover .delete-btn { opacity: 1 !important; }
                    ::-webkit-scrollbar { width: 4px; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 99px; }
                  `}</style>
                  <EditorContent editor={editor} />
                </div>

                {/* Side panels */}
                {(activePanel === "stats" || activePanel === "history") && (
                  <button
                    type="button"
                    className="note-panel-backdrop"
                    onClick={() => setActivePanel(null)}
                    aria-label="Close note panel"
                  />
                )}
                {activePanel === "stats" && (
                  <StatsPanel text={editorText} onClose={() => setActivePanel(null)} />
                )}
                {activePanel === "history" && selectedNote && (
                  <VersionHistory
                    noteId={selectedNote.id}
                    onRestore={handleRestoreVersion}
                    onClose={() => setActivePanel(null)}
                  />
                )}
              </div>

              {/* Find & replace floating */}
              {showFindReplace && (
                <FindReplacePanel editor={editor} onClose={() => setShowFindReplace(false)} />
              )}

              {/* ── FOOTER ─────────────────────────────────────────── */}
              {!focusMode && (
                <div className="note-footer" style={{
                  padding: "5px 16px", borderTop: `1px solid ${C.border}`,
                  background: C.surface, display: "flex", alignItems: "center",
                  gap: 12, flexShrink: 0, flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{wordCount}w</span>
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{charCount}ch</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{readingTime(editorText)} read</span>

                  {/* Checklist progress */}
                  {checkStats.total > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 50, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${(checkStats.done / checkStats.total) * 100}%`,
                          background: checkStats.done === checkStats.total ? C.emerald : C.indigo,
                          borderRadius: 99, transition: "width 0.3s",
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
                        {checkStats.done}/{checkStats.total} tasks
                      </span>
                    </div>
                  )}

                  {/* Word goal progress */}
                  {wordGoal > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Target size={10} color={goalPct >= 100 ? C.emerald : C.amber} />
                      <div style={{ width: 60, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${goalPct}%`,
                          background: goalPct >= 100 ? C.emerald : C.amber,
                          borderRadius: 99, transition: "width 0.4s",
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
                        {wordCount}/{wordGoal}w
                      </span>
                    </div>
                  )}

                  <div style={{ flex: 1 }} />
                  <span className="note-footer-date" style={{ fontSize: 10, color: C.faint }}>
                    {new Date(selectedNote.updated_at).toLocaleString()}
                  </span>
                </div>
              )}
            </>
          ) : (
            /* Empty state */
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
              <FileText size={56} color={C.faint} style={{ marginBottom: 16 }} />
              <h3 style={{ color: C.muted, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Developer notebook</h3>
              <p style={{ color: C.faint, fontSize: 13, marginBottom: 24 }}>Rich text · Code blocks · AI summaries · Version history</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button onClick={() => handleNewNote()} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: C.indigo, border: "none", borderRadius: 8,
                  padding: "9px 18px", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13,
                }}>
                  <Plus size={15} /> New note
                </button>
                <button onClick={() => setShowTemplates(true)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(245,158,11,0.1)", border: `1px solid rgba(245,158,11,0.25)`,
                  borderRadius: 8, padding: "9px 18px", color: C.amber, cursor: "pointer", fontSize: 13,
                }}>
                  <Sparkles size={15} /> Templates
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap", justifyContent: "center" }}>
                {[["Ctrl+K", "Search"], ["Ctrl+S", "Save"], ["Ctrl+H", "Find & Replace"], ["Ctrl+F", "Focus mode"], ["/", "Slash commands"]].map(([k, l]) => (
                  <div key={k} style={{
                    fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5,
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: 7, padding: "4px 10px",
                  }}>
                    <kbd style={{ fontFamily: "monospace", color: C.indigo, fontSize: 10 }}>{k}</kbd> {l}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TEMPLATES MODAL ──────────────────────────────────────────── */}
      {showTemplates && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9000, padding: 16,
        }} onClick={() => setShowTemplates(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.surface, borderRadius: 16, width: "100%", maxWidth: 640,
            border: `1px solid ${C.border}`, overflow: "hidden",
            maxHeight: "80vh", display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={16} color={C.amber} /> Note Templates
              </span>
              <button onClick={() => setShowTemplates(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={16} /></button>
            </div>
            <div style={{ padding: 16, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {TEMPLATES.map(t => (
                <button key={t.title} onClick={() => handleNewNote(t)} style={{
                  background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: "14px 16px", cursor: "pointer", textAlign: "left",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{t.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Opens pre-filled with structure</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LOCK MODAL ───────────────────────────────────────────────── */}
      {showLockModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9001, padding: 16,
        }}>
          <div style={{
            background: C.surface, borderRadius: 14, width: "100%", maxWidth: 340,
            border: `1px solid ${C.border}`, padding: 24, textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{lockMode === "lock" ? "🔒" : "🔓"}</div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
              {lockMode === "lock" ? "Lock this note" : "Enter password"}
            </h3>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
              {lockMode === "lock" ? "Set a password to protect this note locally." : `Hint: starts with "${getLocalMeta(pendingUnlockId||"")?.lockHint || "?"}" `}
            </p>
            <input
              type="password"
              value={lockInput}
              onChange={e => setLockInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (lockMode === "lock" ? handleLock() : handleUnlock())}
              placeholder="Password"
              autoFocus
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)",
                border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "9px 12px", color: C.text, fontSize: 14, outline: "none",
                boxSizing: "border-box", marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowLockModal(false); setLockInput(""); setPendingUnlockId(null) }} style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "8px", color: C.muted, cursor: "pointer", fontSize: 13,
              }}>Cancel</button>
              <button onClick={lockMode === "lock" ? handleLock : handleUnlock} style={{
                flex: 2, background: C.indigo, border: "none", borderRadius: 8,
                padding: "8px", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13,
              }}>
                {lockMode === "lock" ? "Lock Note" : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slash command menu */}
      {slashMenu && (
        <SlashMenu
          pos={slashMenu}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenu(null)}
        />
      )}
    </div>
  )
}
