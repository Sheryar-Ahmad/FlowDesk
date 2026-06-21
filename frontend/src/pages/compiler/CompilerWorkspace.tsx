import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import axios from "axios"
import toast from "react-hot-toast"
import {
  ArrowLeft,
  Code2,
  Copy,
  FileCode2,
  Loader2,
  Pin,
  Play,
  Plus,
  Save,
  Search,
  ShieldCheck,
  TerminalSquare,
  Trash2,
} from "lucide-react"

import {
  createCompilerFile,
  deleteCompilerFile,
  getCompilerFiles,
  getCompilerRuntimes,
  runCompilerFile,
  updateCompilerFile,
  type CompilerFile,
  type CompilerLanguage,
  type CompilerRunResult,
  type CompilerRuntime,
} from "../../services/api/compiler.api"

const LANGUAGE_OPTIONS: Array<{ value: CompilerLanguage; label: string; monaco: string; template: string }> = [
  { value: "python", label: "Python", monaco: "python", template: 'print("Hello from FlowDesk Compiler")\n' },
  { value: "javascript", label: "JavaScript", monaco: "javascript", template: 'console.log("Hello from FlowDesk Compiler")\n' },
  { value: "typescript", label: "TypeScript", monaco: "typescript", template: 'const message: string = "Hello from FlowDesk Compiler"\nconsole.log(message)\n' },
  { value: "java", label: "Java", monaco: "java", template: 'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from FlowDesk Compiler");\n  }\n}\n' },
  { value: "cpp", label: "C++", monaco: "cpp", template: '#include <iostream>\nint main() {\n  std::cout << "Hello from FlowDesk Compiler\\n";\n  return 0;\n}\n' },
  { value: "c", label: "C", monaco: "c", template: '#include <stdio.h>\nint main() {\n  printf("Hello from FlowDesk Compiler\\n");\n  return 0;\n}\n' },
  { value: "go", label: "Go", monaco: "go", template: 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello from FlowDesk Compiler")\n}\n' },
  { value: "rust", label: "Rust", monaco: "rust", template: 'fn main() {\n    println!("Hello from FlowDesk Compiler");\n}\n' },
  { value: "csharp", label: "C#", monaco: "csharp", template: 'using System;\n\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello from FlowDesk Compiler");\n  }\n}\n' },
  { value: "php", label: "PHP", monaco: "php", template: '<?php\necho "Hello from FlowDesk Compiler\\n";\n' },
  { value: "ruby", label: "Ruby", monaco: "ruby", template: 'puts "Hello from FlowDesk Compiler"\n' },
  { value: "sql", label: "SQL", monaco: "sql", template: "SELECT 'Hello from FlowDesk Compiler' AS message;\n" },
  { value: "bash", label: "Bash", monaco: "shell", template: 'echo "Hello from FlowDesk Compiler"\n' },
]

const languageByValue = new Map(LANGUAGE_OPTIONS.map(option => [option.value, option]))

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === "string") return detail
  }
  return error instanceof Error ? error.message : fallback
}

function makeUntitled(language: CompilerLanguage) {
  const label = languageByValue.get(language)?.label ?? "Code"
  return `Untitled ${label}`
}

function resultBadgeClasses(status?: string) {
  switch (status) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    case "timeout":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300"
    case "unsupported":
    case "disabled":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300"
    case "error":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300"
    default:
      return "border-white/10 bg-white/5 text-slate-400"
  }
}

export default function CompilerWorkspace() {
  const navigate = useNavigate()
  const [files, setFiles] = useState<CompilerFile[]>([])
  const [runtimes, setRuntimes] = useState<CompilerRuntime[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState(makeUntitled("python"))
  const [language, setLanguage] = useState<CompilerLanguage>("python")
  const [code, setCode] = useState(languageByValue.get("python")?.template ?? "")
  const [stdin, setStdin] = useState("")
  const [output, setOutput] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<CompilerRunResult | null>(null)

  const activeFile = useMemo(
    () => files.find(file => file.id === activeId) ?? null,
    [activeId, files],
  )

  const runtime = useMemo(
    () => runtimes.find(item => item.language === language),
    [language, runtimes],
  )

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return files
    return files.filter(file => (
      file.title.toLowerCase().includes(query)
      || file.language.toLowerCase().includes(query)
      || file.code.toLowerCase().includes(query)
    ))
  }, [files, search])

  const isDirty = useMemo(() => {
    if (!activeFile) {
      return Boolean(title.trim() || code.trim() || stdin.trim())
    }
    return (
      activeFile.title !== title
      || activeFile.language !== language
      || activeFile.code !== code
      || activeFile.stdin !== stdin
      || activeFile.output !== output
    )
  }, [activeFile, code, language, output, stdin, title])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    try {
      const [fileResponse, runtimeResponse] = await Promise.all([
        getCompilerFiles({ page_size: 100 }),
        getCompilerRuntimes(),
      ])
      setFiles(fileResponse.files)
      setRuntimes(runtimeResponse.runtimes)
      const firstFile = fileResponse.files[0]
      if (firstFile) {
        setActiveId(firstFile.id)
        setTitle(firstFile.title)
        setLanguage(firstFile.language)
        setCode(firstFile.code)
        setStdin(firstFile.stdin)
        setOutput(firstFile.output)
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load compiler workspace."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void loadWorkspace()
    }, 0)
    return () => globalThis.clearTimeout(timer)
  }, [loadWorkspace])

  const selectFile = (file: CompilerFile) => {
    setActiveId(file.id)
    setTitle(file.title)
    setLanguage(file.language)
    setCode(file.code)
    setStdin(file.stdin)
    setOutput(file.output)
    setRunResult(null)
  }

  const startNewFile = () => {
    const option = languageByValue.get("python")
    setActiveId(null)
    setTitle(makeUntitled("python"))
    setLanguage("python")
    setCode(option?.template ?? "")
    setStdin("")
    setOutput("")
    setRunResult(null)
  }

  const handleLanguageChange = (nextLanguage: CompilerLanguage) => {
    setLanguage(nextLanguage)
    if (!activeFile && !code.trim()) {
      setCode(languageByValue.get(nextLanguage)?.template ?? "")
      setTitle(makeUntitled(nextLanguage))
    }
  }

  const upsertLocalFile = (file: CompilerFile) => {
    setFiles(current => {
      const exists = current.some(item => item.id === file.id)
      if (!exists) return [file, ...current]
      return current.map(item => (item.id === file.id ? file : item))
    })
  }

  const saveCurrentFile = async () => {
    const cleanTitle = title.trim() || makeUntitled(language)
    setSaving(true)
    try {
      if (activeId) {
        const response = await updateCompilerFile(activeId, {
          title: cleanTitle,
          language,
          code,
          stdin,
          output,
        })
        upsertLocalFile(response.file)
        setTitle(response.file.title)
        toast.success("Compiler file saved")
        return response.file
      }

      const response = await createCompilerFile({
        title: cleanTitle,
        language,
        code,
        stdin,
      })
      upsertLocalFile(response.file)
      setActiveId(response.file.id)
      setTitle(response.file.title)
      toast.success("Compiler file created")
      return response.file
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save compiler file."))
      return null
    } finally {
      setSaving(false)
    }
  }

  const runCurrentFile = async () => {
    if (!code.trim()) {
      toast.error("Write some code before running.")
      return
    }
    setRunning(true)
    setRunResult(null)
    try {
      const savedFile = await saveCurrentFile()
      if (!savedFile) return

      const response = await runCompilerFile(savedFile.id)
      setRunResult(response.result)
      setOutput(response.result.output || response.result.message || "")
      const updatedFile: CompilerFile = {
        ...savedFile,
        output: response.result.output,
        run_count: savedFile.run_count + 1,
        last_run_at: new Date().toISOString(),
      }
      upsertLocalFile(updatedFile)
      if (response.result.status === "success") {
        toast.success("Code ran successfully")
      } else if (response.result.status === "unsupported" || response.result.status === "disabled") {
        toast(response.result.message ?? "Runtime unavailable right now")
      } else {
        toast.error(response.result.message ?? "Code finished with errors")
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to run code."))
    } finally {
      setRunning(false)
    }
  }

  const deleteCurrentFile = async () => {
    if (!activeId) {
      startNewFile()
      return
    }
    setSaving(true)
    try {
      await deleteCompilerFile(activeId)
      setFiles(current => current.filter(file => file.id !== activeId))
      startNewFile()
      toast.success("Compiler file deleted")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete compiler file."))
    } finally {
      setSaving(false)
    }
  }

  const togglePin = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      const response = await updateCompilerFile(activeFile.id, { is_pinned: !activeFile.is_pinned })
      upsertLocalFile(response.file)
      toast.success(response.file.is_pinned ? "Pinned" : "Unpinned")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update pin."))
    } finally {
      setSaving(false)
    }
  }

  const copyOutput = async () => {
    if (!output.trim()) return
    await navigator.clipboard.writeText(output)
    toast.success("Output copied")
  }

  const selectedLanguage = languageByValue.get(language)

  return (
    <div className="min-h-screen bg-[#080B14] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0D1117]/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:border-indigo-400/40 hover:text-white"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <TerminalSquare size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold text-white">Compiler</h1>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Safe mode
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">Save, run, and test code inside FlowDesk</p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={startNewFile}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-indigo-400/40 hover:bg-white/10 sm:flex-none"
            >
              <Plus size={16} /> New
            </button>
            <button
              type="button"
              onClick={() => void saveCurrentFile()}
              disabled={saving || !isDirty}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => void runCurrentFile()}
              disabled={running || saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
              Run
            </button>
          </div>
        </div>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-6">
        <aside className="rounded-3xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Files</p>
                <p className="text-sm text-slate-300">{files.length} saved</p>
              </div>
              <ShieldCheck className="text-emerald-300" size={20} />
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0D1117] px-3 py-2">
              <Search size={16} className="text-slate-500" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search files..."
                className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="max-h-[34vh] space-y-2 overflow-y-auto p-3 lg:max-h-[calc(100vh-220px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <Loader2 className="animate-spin" size={22} />
              </div>
            ) : filteredFiles.length ? (
              filteredFiles.map(file => (
                <button
                  type="button"
                  key={file.id}
                  onClick={() => selectFile(file)}
                  className={[
                    "w-full rounded-2xl border p-3 text-left transition",
                    file.id === activeId
                      ? "border-indigo-400/40 bg-indigo-500/10"
                      : "border-transparent bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.045]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {file.is_pinned && <Pin size={12} className="text-amber-300" />}
                        <p className="truncate text-sm font-semibold text-white">{file.title}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                          {file.language}
                        </span>
                        <span className="text-[11px] text-slate-500">{file.run_count} runs</span>
                      </div>
                    </div>
                    <FileCode2 size={16} className="mt-1 shrink-0 text-slate-500" />
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                No compiler files yet.
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#0D1117] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/50"
                placeholder="File title"
                maxLength={200}
              />
              <select
                value={language}
                onChange={event => handleLanguageChange(event.target.value as CompilerLanguage)}
                className="rounded-2xl border border-white/10 bg-[#0D1117] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-indigo-400/50"
              >
                {LANGUAGE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void togglePin()}
                disabled={!activeFile || saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pin size={16} /> Pin
              </button>
              <button
                type="button"
                onClick={() => void deleteCurrentFile()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <Code2 size={13} />
                {selectedLanguage?.label ?? language}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Runtime: {runtime?.executable ? "available" : "saved only"}
              </span>
              {runtime?.reason && <span className="text-slate-600">{runtime.reason}</span>}
              {isDirty && <span className="text-amber-300">Unsaved changes</span>}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0D1117]">
            <Editor
              height="min(58vh, 620px)"
              theme="vs-dark"
              language={selectedLanguage?.monaco ?? "plaintext"}
              value={code}
              onChange={value => setCode(value ?? "")}
              options={{
                automaticLayout: true,
                fontLigatures: true,
                fontSize: 14,
                minimap: { enabled: false },
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Standard Input</h2>
                <span className="text-xs text-slate-600">{stdin.length}/12000</span>
              </div>
              <textarea
                value={stdin}
                onChange={event => setStdin(event.target.value)}
                placeholder="Input for your program..."
                className="min-h-36 w-full resize-y rounded-2xl border border-white/10 bg-[#0D1117] p-4 font-mono text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
                maxLength={12000}
              />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">Output</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${resultBadgeClasses(runResult?.status)}`}>
                    {runResult?.status ?? "idle"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void copyOutput()}
                  disabled={!output.trim()}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy size={14} /> Copy
                </button>
              </div>
              <pre className="min-h-36 max-h-80 overflow-auto rounded-2xl border border-white/10 bg-[#060912] p-4 text-sm leading-6 text-slate-200">
                {output || runResult?.message || "Run your code to see output here."}
              </pre>
              {runResult && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{runResult.duration_ms}ms</span>
                  <span>Exit: {runResult.exit_code ?? "n/a"}</span>
                  {runResult.truncated && <span className="text-amber-300">Output truncated</span>}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
