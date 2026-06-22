import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import axios from "axios"
import toast from "react-hot-toast"
import {
  ArrowLeft,
  Beaker,
  Code2,
  Copy,
  Cpu,
  Download,
  FileCode2,
  Gauge,
  History,
  Loader2,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Zap,
} from "lucide-react"

import {
  createCompilerFile,
  deleteCompilerFile,
  duplicateCompilerFile,
  getCompilerFiles,
  getCompilerRuntimes,
  getRunHistory,
  getRunStats,
  runCompilerCode,
  runCompilerFile,
  runTestCases,
  updateCompilerFile,
  type CompilerFile,
  type CompilerLanguage,
  type CompilerRunEvent,
  type CompilerRunResult,
  type CompilerRunStats,
  type CompilerRuntime,
  type CompilerTestCaseResult,
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
  { value: "kotlin", label: "Kotlin", monaco: "kotlin", template: 'fun main() {\n  println("Hello from FlowDesk Compiler")\n}\n' },
  { value: "swift", label: "Swift", monaco: "swift", template: 'print("Hello from FlowDesk Compiler")\n' },
  { value: "dart", label: "Dart", monaco: "dart", template: 'void main() {\n  print("Hello from FlowDesk Compiler");\n}\n' },
  { value: "scala", label: "Scala", monaco: "scala", template: 'object Main extends App {\n  println("Hello from FlowDesk Compiler")\n}\n' },
  { value: "r", label: "R", monaco: "r", template: 'cat("Hello from FlowDesk Compiler\\n")\n' },
  { value: "perl", label: "Perl", monaco: "perl", template: 'print "Hello from FlowDesk Compiler\\n";\n' },
  { value: "lua", label: "Lua", monaco: "lua", template: 'print("Hello from FlowDesk Compiler")\n' },
  { value: "haskell", label: "Haskell", monaco: "haskell", template: 'main :: IO ()\nmain = putStrLn "Hello from FlowDesk Compiler"\n' },
  { value: "elixir", label: "Elixir", monaco: "elixir", template: 'IO.puts("Hello from FlowDesk Compiler")\n' },
  { value: "erlang", label: "Erlang", monaco: "erlang", template: '-module(main).\n-export([main/0]).\n\nmain() -> io:format("Hello from FlowDesk Compiler~n").\n' },
  { value: "clojure", label: "Clojure", monaco: "clojure", template: '(println "Hello from FlowDesk Compiler")\n' },
  { value: "fsharp", label: "F#", monaco: "fsharp", template: 'printfn "Hello from FlowDesk Compiler"\n' },
  { value: "powershell", label: "PowerShell", monaco: "powershell", template: 'Write-Output "Hello from FlowDesk Compiler"\n' },
  { value: "groovy", label: "Groovy", monaco: "groovy", template: 'println "Hello from FlowDesk Compiler"\n' },
  { value: "julia", label: "Julia", monaco: "julia", template: 'println("Hello from FlowDesk Compiler")\n' },
  { value: "matlab", label: "MATLAB", monaco: "matlab", template: 'disp("Hello from FlowDesk Compiler")\n' },
  { value: "objectivec", label: "Objective-C", monaco: "objective-c", template: '#import <Foundation/Foundation.h>\n\nint main() {\n  @autoreleasepool {\n    NSLog(@"Hello from FlowDesk Compiler");\n  }\n  return 0;\n}\n' },
  { value: "vb", label: "Visual Basic", monaco: "vb", template: 'Module Program\n  Sub Main()\n    Console.WriteLine("Hello from FlowDesk Compiler")\n  End Sub\nEnd Module\n' },
  { value: "html", label: "HTML", monaco: "html", template: '<!doctype html>\n<html>\n  <body>\n    <h1>Hello from FlowDesk Compiler</h1>\n  </body>\n</html>\n' },
  { value: "css", label: "CSS", monaco: "css", template: 'body {\n  font-family: system-ui, sans-serif;\n  color: #f8fafc;\n  background: #080b14;\n}\n' },
  { value: "markdown", label: "Markdown", monaco: "markdown", template: '# Hello from FlowDesk Compiler\n\nWrite notes, docs, and specs here.\n' },
  { value: "yaml", label: "YAML", monaco: "yaml", template: 'name: FlowDesk Compiler\nstatus: ready\n' },
  { value: "json", label: "JSON", monaco: "json", template: '{\n  "message": "Hello from FlowDesk Compiler"\n}\n' },
  { value: "xml", label: "XML", monaco: "xml", template: '<message>Hello from FlowDesk Compiler</message>\n' },
]

const languageByValue = new Map(LANGUAGE_OPTIONS.map(option => [option.value, option]))

const extensionByLanguage: Record<CompilerLanguage, string> = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  java: "java",
  cpp: "cpp",
  c: "c",
  go: "go",
  rust: "rs",
  csharp: "cs",
  php: "php",
  ruby: "rb",
  sql: "sql",
  bash: "sh",
  kotlin: "kt",
  swift: "swift",
  dart: "dart",
  scala: "scala",
  r: "r",
  perl: "pl",
  lua: "lua",
  haskell: "hs",
  elixir: "exs",
  erlang: "erl",
  clojure: "clj",
  fsharp: "fs",
  powershell: "ps1",
  groovy: "groovy",
  julia: "jl",
  matlab: "m",
  objectivec: "m",
  vb: "vb",
  html: "html",
  css: "css",
  markdown: "md",
  yaml: "yml",
  json: "json",
  xml: "xml",
}

type MobileTab = "files" | "editor" | "io"
type IoTab = "output" | "tests" | "history"

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

// Debounce so the file list isn't re-filtered on every keystroke
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = globalThis.setTimeout(() => setDebounced(value), delayMs)
    return () => globalThis.clearTimeout(handle)
  }, [value, delayMs])
  return debounced
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
  const [mobileTab, setMobileTab] = useState<MobileTab>("editor")
  const [ioTab, setIoTab] = useState<IoTab>("output")
  const [showProgramInput, setShowProgramInput] = useState(false)

  // Test-case runner state
  const [testCases, setTestCases] = useState<Array<{ stdin: string; expected: string }>>([
    { stdin: "", expected: "" },
  ])
  const [testResults, setTestResults] = useState<CompilerTestCaseResult | null>(null)
  const [testRunning, setTestRunning] = useState(false)

  // Run history / stats - both backed by real endpoints
  const [history, setHistory] = useState<CompilerRunEvent[]>([])
  const [stats, setStats] = useState<CompilerRunStats | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const debouncedSearch = useDebouncedValue(search, 200)

  const activeFile = useMemo(
    () => files.find(file => file.id === activeId) ?? null,
    [activeId, files],
  )

  const runtime = useMemo(
    () => runtimes.find(item => item.language === language),
    [language, runtimes],
  )

  const filteredFiles = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()
    if (!query) return files
    return files.filter(file => (
      file.title.toLowerCase().includes(query)
      || file.language.toLowerCase().includes(query)
      || file.code.toLowerCase().includes(query)
    ))
  }, [files, debouncedSearch])

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

  // 30-day stats: cheap, non-blocking fetch on mount
  useEffect(() => {
    getRunStats()
      .then(setStats)
      .catch(() => undefined)
  }, [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await getRunHistory({ limit: 50 })
      setHistory(response.events)
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load run history."))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const selectFile = (file: CompilerFile) => {
    setActiveId(file.id)
    setTitle(file.title)
    setLanguage(file.language)
    setCode(file.code)
    setStdin(file.stdin)
    setOutput(file.output)
    setRunResult(null)
    setTestResults(null)
    setShowProgramInput(Boolean(file.stdin.trim()))
    setIoTab("output")
    setMobileTab("editor")
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
    setTestResults(null)
    setShowProgramInput(false)
    setIoTab("output")
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
    setIoTab("output")
    setMobileTab("io")
    try {
      const savedFile = await saveCurrentFile()
      if (!savedFile) return

      let response: Awaited<ReturnType<typeof runCompilerFile>>
      try {
        response = await runCompilerFile(savedFile.id)
      } catch {
        response = await runCompilerCode({ language, code, stdin })
      }
      setRunResult(response.result)
      setOutput(response.result.output || response.result.message || "")
      // Optimistic local patch - avoids waiting on a refetch to feel snappy
      const updatedFile: CompilerFile = {
        ...savedFile,
        output: response.result.output,
        run_count: savedFile.run_count + 1,
        last_run_at: new Date().toISOString(),
      }
      upsertLocalFile(updatedFile)

      if (response.result.status === "success") {
        toast.success(response.result.cached ? "Code ran successfully (cached)" : "Code ran successfully")
      } else if (response.result.status === "unsupported" || response.result.status === "disabled") {
        toast(response.result.message ?? "Runtime unavailable right now")
      } else if (response.result.status === "timeout") {
        toast.error(response.result.message ?? "Execution timed out")
      } else {
        toast.error(response.result.message ?? "Code finished with errors")
      }

      // Refresh stats in the background since a new run just landed
      getRunStats().then(setStats).catch(() => undefined)
    } catch (error) {
      const message = getErrorMessage(error, "Failed to run code.")
      const failedResult: CompilerRunResult = {
        status: "error",
        stdout: "",
        stderr: message,
        output: message,
        exit_code: null,
        duration_ms: 0,
        timed_out: false,
        truncated: false,
        language,
        message,
        warnings: [],
        cached: false,
      }
      setRunResult(failedResult)
      setOutput(message)
      toast.error(message)
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
      toast.success("Compiler file moved to trash")
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

  const handleDuplicate = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      const response = await duplicateCompilerFile(activeFile.id)
      upsertLocalFile(response.file)
      selectFile(response.file)
      toast.success("File duplicated")
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to duplicate file."))
    } finally {
      setSaving(false)
    }
  }

  const runTests = async () => {
    if (!code.trim()) {
      toast.error("Write some code before running tests.")
      return
    }
    const cases = testCases.filter(testCase => testCase.expected.trim())
    if (!cases.length) {
      toast.error("Add at least one test case with an expected output.")
      return
    }
    setTestRunning(true)
    setIoTab("tests")
    setMobileTab("io")
    try {
      const response = await runTestCases({ language, code, test_cases: cases })
      setTestResults(response)
      if (response.failed === 0) {
        toast.success(`All ${response.total} test cases passed`)
      } else {
        toast.error(`${response.passed}/${response.total} test cases passed`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to run test cases."))
    } finally {
      setTestRunning(false)
    }
  }

  const openHistoryTab = () => {
    setIoTab("history")
    setMobileTab("io")
    if (!history.length) void loadHistory()
  }

  const copyOutput = async () => {
    if (!output.trim()) return
    await navigator.clipboard.writeText(output)
    toast.success("Output copied")
  }

  const clearOutput = () => {
    setOutput("")
    setRunResult(null)
    toast.success("Output cleared")
  }

  const copyCode = async () => {
    if (!code.trim()) return
    await navigator.clipboard.writeText(code)
    toast.success("Code copied")
  }

  const loadLanguageTemplate = () => {
    setCode(selectedLanguage?.template ?? "")
    setRunResult(null)
    setOutput("")
    toast.success("Template loaded")
  }

  const downloadCode = () => {
    const extension = extensionByLanguage[language] ?? "txt"
    const cleanTitle = (title.trim() || makeUntitled(language))
      .replace(/[^a-z0-9-_ ]/gi, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" })
    const href = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = href
    link.download = `${cleanTitle || "flowdesk-code"}.${extension}`
    link.click()
    URL.revokeObjectURL(href)
  }

  const handleWorkspaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isModifierPressed = event.ctrlKey || event.metaKey
    if (!isModifierPressed) return

    if (event.key.toLowerCase() === "s") {
      event.preventDefault()
      void saveCurrentFile()
    }

    if (event.key === "Enter") {
      event.preventDefault()
      void runCurrentFile()
    }
  }

  const selectedLanguage = languageByValue.get(language)
  const executableLanguageCount = useMemo(
    () => runtimes.filter(item => item.executable).length,
    [runtimes],
  )
  const codeStats = useMemo(() => {
    const lines = code ? code.split(/\r?\n/).length : 0
    return {
      lines,
      characters: code.length,
    }
  }, [code])
  const runtimeStatus = runtime?.executable ? "Runnable" : "Edit only"

  // Shared sub-views used by both the desktop grid and mobile tabs.

  const FileSidebar = (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.025]">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Files</p>
            <p className="text-sm text-slate-300">{filteredFiles.length} of {files.length}</p>
          </div>
          <ShieldCheck className="text-emerald-300" size={20} />
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0D1117] px-3 py-2">
          <Search size={16} className="shrink-0 text-slate-500" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search files..."
            className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
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
                    {file.is_pinned && <Pin size={12} className="shrink-0 text-amber-300" />}
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

      {stats && (
        <div className="border-t border-white/10 p-4 text-xs text-slate-500">
          <p className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1"><Gauge size={12} /> Last 30 days</span>
            <span>{stats.successful_runs}/{stats.total_runs} successful</span>
          </p>
          <p className="mt-1">Avg duration: {Math.round(stats.avg_duration_ms)}ms</p>
        </div>
      )}
    </aside>
  )

  const EditorPanel = (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
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
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <button
            type="button"
            onClick={() => void togglePin()}
            disabled={!activeFile || saving}
            title="Pin"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pin size={15} /> Pin
          </button>
          <button
            type="button"
            onClick={() => void handleDuplicate()}
            disabled={!activeFile || saving}
            title="Duplicate"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy size={15} /> Clone
          </button>
          <button
            type="button"
            onClick={() => void copyCode()}
            disabled={!code.trim()}
            title="Copy code"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy size={15} /> Copy
          </button>
          <button
            type="button"
            onClick={loadLanguageTemplate}
            title="Load template"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
          >
            <RefreshCw size={15} /> Template
          </button>
          <button
            type="button"
            onClick={downloadCode}
            disabled={!code.trim()}
            title="Download"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={15} /> Export
          </button>
          <button
            type="button"
            onClick={() => void deleteCurrentFile()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-3 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <Code2 size={13} />
            {selectedLanguage?.label ?? language}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            Runtime: {runtimeStatus}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {codeStats.lines} lines / {codeStats.characters} chars
          </span>
          {runtime?.queue && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              <Zap size={12} /> {runtime.queue.global_slots_free}/{runtime.queue.global_slots_total} run slots free
            </span>
          )}
          {runtime?.reason && <span className="text-slate-600">{runtime.reason}</span>}
          {isDirty && <span className="text-amber-300">Unsaved changes</span>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-[#0D1117]">
        <Editor
          height="100%"
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
    </div>
  )

  const IOPanel = (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
        <button
          type="button"
          onClick={() => setShowProgramInput(current => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-sm font-bold text-white">Program input</h2>
            <p className="mt-1 text-xs text-slate-500">
              Optional. Use this only when your code reads from input() or stdin.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
            {showProgramInput ? "Hide" : "Add input"}
          </span>
        </button>
        <div className={showProgramInput ? "mt-4" : "hidden"}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">stdin</span>
            <span className="text-xs text-slate-600">{stdin.length}/12000</span>
          </div>
          <textarea
            value={stdin}
            onChange={event => setStdin(event.target.value)}
            placeholder="Example: text your Python input() should read..."
            className="min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-[#0D1117] p-4 font-mono text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
            maxLength={12000}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-white/5 pb-3">
          <button
            type="button"
            onClick={() => setIoTab("output")}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              ioTab === "output" ? "bg-indigo-500/20 text-indigo-200" : "text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            <TerminalSquare size={13} /> Output
          </button>
          <button
            type="button"
            onClick={() => setIoTab("tests")}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              ioTab === "tests" ? "bg-indigo-500/20 text-indigo-200" : "text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            <Beaker size={13} /> Test cases
          </button>
          <button
            type="button"
            onClick={openHistoryTab}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              ioTab === "history" ? "bg-indigo-500/20 text-indigo-200" : "text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            <History size={13} /> History
          </button>
        </div>

        {ioTab === "output" && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${resultBadgeClasses(runResult?.status)}`}>
                {runResult?.status ?? "idle"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearOutput}
                  disabled={!output.trim() && !runResult}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => void copyOutput()}
                  disabled={!output.trim()}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy size={14} /> Copy
                </button>
              </div>
            </div>
            <pre className="min-h-36 max-h-80 overflow-auto rounded-2xl border border-white/10 bg-[#060912] p-4 text-sm leading-6 text-slate-200">
              {output || runResult?.message || "Run your code to see output here."}
            </pre>
            {runResult && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{runResult.duration_ms}ms</span>
                {runResult.cpu_time_ms !== null && runResult.cpu_time_ms !== undefined && (
                  <span className="inline-flex items-center gap-1"><Cpu size={11} /> CPU: {runResult.cpu_time_ms}ms</span>
                )}
                {runResult.memory_kb !== null && runResult.memory_kb !== undefined && (
                  <span>Memory: {Math.round(runResult.memory_kb / 1024)}MB</span>
                )}
                <span>Exit: {runResult.exit_code ?? "n/a"}</span>
                {runResult.cached && <span className="text-cyan-300">Cached</span>}
                {runResult.truncated && <span className="text-amber-300">Output truncated</span>}
                {runResult.warnings?.map(warning => (
                  <span key={warning} className="text-amber-300">{warning}</span>
                ))}
              </div>
            )}
          </>
        )}

        {ioTab === "tests" && (
          <div className="space-y-3">
            {testCases.map((testCase, index) => (
              <div key={index} className="grid gap-2 rounded-2xl border border-white/10 bg-[#0D1117] p-3 sm:grid-cols-2">
                <textarea
                  value={testCase.stdin}
                  onChange={event => setTestCases(current =>
                    current.map((tc, i) => (i === index ? { ...tc, stdin: event.target.value } : tc)))}
                  placeholder={`Test ${index + 1} input`}
                  className="min-h-16 resize-y rounded-xl border border-white/10 bg-[#060912] p-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600"
                />
                <textarea
                  value={testCase.expected}
                  onChange={event => setTestCases(current =>
                    current.map((tc, i) => (i === index ? { ...tc, expected: event.target.value } : tc)))}
                  placeholder={`Test ${index + 1} expected output`}
                  className="min-h-16 resize-y rounded-xl border border-white/10 bg-[#060912] p-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600"
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTestCases(current => [...current, { stdin: "", expected: "" }])}
                disabled={testCases.length >= 25}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                <Plus size={13} /> Add case
              </button>
              <button
                type="button"
                onClick={() => void runTests()}
                disabled={testRunning}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                {testRunning ? <Loader2 className="animate-spin" size={13} /> : <Beaker size={13} />}
                Run tests
              </button>
              {testResults && (
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  testResults.failed === 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}>
                  {testResults.passed}/{testResults.total} passed
                </span>
              )}
            </div>
            {testResults && (
              <div className="space-y-2">
                {testResults.results.map(result => (
                  <div key={result.index} className={`rounded-xl border p-2 text-xs ${result.passed ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
                    <p className="font-semibold text-slate-200">Test {result.index + 1}: {result.passed ? "Passed" : "Failed"}</p>
                    {!result.passed && (
                      <p className="mt-1 text-slate-400">Expected: {result.expected || "(empty)"} - Got: {result.actual || "(empty)"}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {ioTab === "history" && (
          <div className="space-y-2">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : history.length ? (
              history.map(event => (
                <div key={event.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0D1117] p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${resultBadgeClasses(event.status)}`}>
                      {event.status}
                    </span>
                    <span className="text-slate-500">{event.language}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500">
                    {event.cached && <span className="text-cyan-300">cached</span>}
                    <span>{event.duration_ms}ms</span>
                    <span>{new Date(event.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No runs recorded yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      className="flex min-h-[100svh] flex-col bg-[#080B14] text-slate-100"
      onKeyDown={handleWorkspaceKeyDown}
    >
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
              <p className="truncate text-xs text-slate-500">
                {LANGUAGE_OPTIONS.length} languages - {executableLanguageCount || 1} runnable now
              </p>
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

        {/* Mobile tab bar replaces the cramped fixed sidebar below lg */}
        <div className="flex border-t border-white/5 lg:hidden">
          {([
            { id: "files", label: "Files", icon: FileCode2 },
            { id: "editor", label: "Editor", icon: Code2 },
            { id: "io", label: "Run & Output", icon: TerminalSquare },
          ] as const).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={[
                "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition",
                mobileTab === tab.id ? "border-b-2 border-indigo-400 text-indigo-200" : "text-slate-500",
              ].join(" ")}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-3 sm:p-4 lg:hidden">
        <div className="h-[calc(100svh-148px)] min-h-0 overflow-hidden">
          {mobileTab === "files" && FileSidebar}
          {mobileTab === "editor" && EditorPanel}
          {mobileTab === "io" && IOPanel}
        </div>
      </main>

      <main className="hidden flex-1 gap-4 p-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_360px] lg:p-6 xl:grid-cols-[300px_minmax(0,1fr)_420px]">
        <div className="h-[calc(100svh-104px)]">{FileSidebar}</div>
        <div className="h-[calc(100svh-104px)] min-w-0">{EditorPanel}</div>
        <div className="h-[calc(100svh-104px)] overflow-y-auto">{IOPanel}</div>
      </main>
    </div>
  )
}
