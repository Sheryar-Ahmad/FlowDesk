import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import toast from "react-hot-toast"
import {
  ArrowLeft,
  FilePlus2,
  FolderOpen,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Save,
  Settings2,
  TerminalSquare,
} from "lucide-react"

import {
  createCompilerFile,
  getCompilerFiles,
  getCompilerRuntimes,
  runCompilerCode,
  updateCompilerFile,
  type CompilerFile,
  type CompilerLanguage,
  type CompilerRunResult,
  type CompilerRuntime,
} from "../../services/api/compiler.api"

type LanguageOption = {
  value: CompilerLanguage
  label: string
  shortLabel: string
  filename: string
  template: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    value: "python",
    label: "Python",
    shortLabel: "PY",
    filename: "main.py",
    template: 'print("Hello from FlowDesk")\n',
  },
  {
    value: "javascript",
    label: "JavaScript",
    shortLabel: "JS",
    filename: "main.js",
    template: 'console.log("Hello from FlowDesk")\n',
  },
  {
    value: "java",
    label: "Java",
    shortLabel: "JAVA",
    filename: "Main.java",
    template: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from FlowDesk");\n  }\n}\n',
  },
  {
    value: "c",
    label: "C",
    shortLabel: "C",
    filename: "main.c",
    template: '#include <stdio.h>\n\nint main(void) {\n  printf("Hello from FlowDesk\\n");\n  return 0;\n}\n',
  },
  {
    value: "cpp",
    label: "C++",
    shortLabel: "C++",
    filename: "main.cpp",
    template: '#include <iostream>\n\nint main() {\n  std::cout << "Hello from FlowDesk\\n";\n  return 0;\n}\n',
  },
  {
    value: "html",
    label: "HTML",
    shortLabel: "HTML",
    filename: "index.html",
    template: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>FlowDesk Preview</title>\n</head>\n<body>\n  <h1>Hello from FlowDesk</h1>\n</body>\n</html>\n',
  },
  {
    value: "css",
    label: "CSS",
    shortLabel: "CSS",
    filename: "styles.css",
    template: 'body {\n  margin: 0;\n  padding: 2rem;\n  font-family: system-ui, sans-serif;\n  color: #111827;\n  background: #f8fafc;\n}\n',
  },
]

const languageByValue = new Map(LANGUAGE_OPTIONS.map(option => [option.value, option]))

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      const messages = detail
        .map(item => item && typeof item === "object" && "msg" in item ? String(item.msg) : "")
        .filter(Boolean)
      if (messages.length) return messages.join(" ")
    }
    if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") {
      return detail.message
    }
  }
  return error instanceof Error ? error.message : fallback
}

function isPreviewLanguage(language: CompilerLanguage) {
  return language === "html" || language === "css"
}

function buildPreviewDocument(language: CompilerLanguage, source: string) {
  if (language === "html") return source
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>${source}</style>
  </head>
  <body>
    <main>
      <h1>FlowDesk CSS Preview</h1>
      <p>Your stylesheet is applied to this sample page.</p>
      <button>Sample button</button>
    </main>
  </body>
</html>`
}

function normalizeRunResult(result: CompilerRunResult): CompilerRunResult {
  if (result.exit_code === 0 && result.status === "error") {
    return { ...result, status: "success", message: null }
  }
  return result
}

function getRunOutput(result: CompilerRunResult) {
  if (result.output?.trim()) return result.output
  const streams = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
  return streams || result.message || ""
}

function statusClasses(status?: CompilerRunResult["status"]) {
  switch (status) {
    case "success":
      return "text-emerald-300"
    case "error":
    case "timeout":
    case "rejected":
      return "text-rose-300"
    case "unsupported":
    case "disabled":
      return "text-amber-300"
    default:
      return "text-slate-500"
  }
}

export default function CompilerWorkspace() {
  const navigate = useNavigate()
  const lineNumbersRef = useRef<HTMLPreElement | null>(null)
  const [files, setFiles] = useState<CompilerFile[]>([])
  const [runtimes, setRuntimes] = useState<CompilerRuntime[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState("Untitled Python")
  const [language, setLanguage] = useState<CompilerLanguage>("python")
  const [code, setCode] = useState(languageByValue.get("python")?.template ?? "")
  const [stdin, setStdin] = useState("")
  const [output, setOutput] = useState("")
  const [runResult, setRunResult] = useState<CompilerRunResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobilePane, setMobilePane] = useState<"code" | "output">("code")

  const selectedLanguage = languageByValue.get(language) ?? LANGUAGE_OPTIONS[0]
  const runtime = runtimes.find(item => item.language === language)
  const previewLanguage = isPreviewLanguage(language)
  const runtimeUnavailable = !previewLanguage && runtime !== undefined && !runtime.executable
  const canRun = previewLanguage || loading || runtime?.executable === true
  const previewDocument = useMemo(
    () => previewLanguage ? buildPreviewDocument(language, code) : "",
    [code, language, previewLanguage],
  )

  const codeStats = useMemo(() => ({
    chars: code.length,
    lines: Math.max(1, code.split("\n").length),
  }), [code])

  const lineNumbers = useMemo(() => {
    return Array.from({ length: codeStats.lines }, (_, index) => String(index + 1)).join("\n")
  }, [codeStats.lines])

  const terminalText = useMemo(() => {
    if (running) return "Running..."
    if (!runResult) return output || "Run your code to see output here."
    const body = output || runResult.message || ""
    let processLine = ""
    if (runResult.status === "timeout") {
      processLine = "Process terminated: execution timed out"
    } else if (runResult.exit_code !== null && runResult.exit_code !== undefined) {
      processLine = `Process finished with exit code ${runResult.exit_code}`
    }
    return [body, processLine].filter(Boolean).join("\n\n")
  }, [output, runResult, running])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    try {
      const [fileResponse, runtimeResponse] = await Promise.all([
        getCompilerFiles({ page_size: 100 }),
        getCompilerRuntimes(),
      ])
      setFiles(fileResponse.files.filter(file => languageByValue.has(file.language)))
      setRuntimes(runtimeResponse.runtimes)
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load compiler."))
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

  const selectFile = (fileId: string) => {
    if (!fileId) {
      startNewFile(language)
      return
    }
    const file = files.find(item => item.id === fileId)
    if (!file) return
    setActiveId(file.id)
    setTitle(file.title)
    setLanguage(file.language)
    setCode(file.code)
    setStdin(file.stdin)
    setOutput(file.output)
    setRunResult(null)
    setMobilePane("code")
  }

  const startNewFile = (nextLanguage: CompilerLanguage = "python") => {
    const option = languageByValue.get(nextLanguage) ?? LANGUAGE_OPTIONS[0]
    setActiveId(null)
    setTitle(`Untitled ${option.label}`)
    setLanguage(nextLanguage)
    setCode(option.template)
    setStdin("")
    setOutput("")
    setRunResult(null)
    setMobilePane("code")
  }

  const changeLanguage = (nextLanguage: CompilerLanguage) => {
    if (nextLanguage === language) return
    startNewFile(nextLanguage)
  }

  const upsertFile = (file: CompilerFile) => {
    setFiles(current => {
      const exists = current.some(item => item.id === file.id)
      return exists ? current.map(item => item.id === file.id ? file : item) : [file, ...current]
    })
  }

  const saveFile = async () => {
    if (!code.trim()) {
      toast.error("Write some code before saving.")
      return null
    }
    setSaving(true)
    try {
      const cleanTitle = title.trim() || selectedLanguage.filename
      const response = activeId
        ? await updateCompilerFile(activeId, { title: cleanTitle, language, code, stdin, output })
        : await createCompilerFile({ title: cleanTitle, language, code, stdin })
      setActiveId(response.file.id)
      setTitle(response.file.title)
      upsertFile(response.file)
      toast.success(activeId ? "File saved" : "File created")
      return response.file
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save file."))
      return null
    } finally {
      setSaving(false)
    }
  }

  const runCode = async () => {
    if (!code.trim()) {
      toast.error("Write some code before running.")
      return
    }

    if (previewLanguage) {
      setRunResult({
        status: "success",
        stdout: "",
        stderr: "",
        output: "Preview refreshed.",
        exit_code: 0,
        duration_ms: 0,
        timed_out: false,
        truncated: false,
        language,
        message: null,
        warnings: [],
        cached: false,
      })
      setOutput("Preview refreshed.")
      setMobilePane("output")
      return
    }

    if (runtimeUnavailable) {
      const message = runtime?.reason ?? `${selectedLanguage.label} is not installed on this backend yet.`
      setRunResult({
        status: "unsupported",
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
      })
      setOutput(message)
      setMobilePane("output")
      toast.error(message)
      return
    }

    setRunning(true)
    setRunResult(null)
    setOutput("")
    setMobilePane("output")
    try {
      const response = await runCompilerCode({ language, code, stdin, use_cache: false })
      const result = normalizeRunResult(response.result)
      const nextOutput = getRunOutput(result)
      setRunResult(result)
      setOutput(nextOutput)

      if (activeId) {
        const current = files.find(file => file.id === activeId)
        if (current) {
          upsertFile({
            ...current,
            code,
            stdin,
            output: nextOutput,
            last_run_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }

      if (result.status === "success") {
        toast.success("Code ran successfully")
      } else if (result.status === "unsupported" || result.status === "disabled") {
        toast(result.message ?? "This runtime is unavailable.")
      } else {
        toast.error(result.message ?? "Code finished with errors.")
      }
    } catch (error) {
      const message = getErrorMessage(error, "Failed to run code.")
      setRunResult({
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
      })
      setOutput(message)
      toast.error(message)
    } finally {
      setRunning(false)
    }
  }

  const insertTab = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const nextCode = `${code.slice(0, start)}  ${code.slice(end)}`
    setCode(nextCode)
    requestAnimationFrame(() => {
      textarea.selectionStart = start + 2
      textarea.selectionEnd = start + 2
    })
  }

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault()
      insertTab(event)
      return
    }
    handleShortcut(event)
  }

  const handleShortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "F11") {
      event.preventDefault()
      setIsFullscreen(current => !current)
      return
    }
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.key.toLowerCase() === "s") {
      event.preventDefault()
      void saveFile()
    }
    if (event.key === "Enter") {
      event.preventDefault()
      void runCode()
    }
  }

  const editorPane = (
    <section className="flex min-h-0 flex-col border-white/10 bg-[#171b29] md:border-r">
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-white/10 bg-gradient-to-r from-[#272c3a] to-[#1d2230] px-3 py-2">
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          aria-label="File name"
          className="min-w-40 flex-1 bg-transparent px-2 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
          placeholder={selectedLanguage.filename}
        />
        <span className="hidden text-xs text-slate-500 sm:inline">{selectedLanguage.filename}</span>
        <span className="hidden rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-400 lg:inline">
          {codeStats.lines} lines
        </span>
        <button
          type="button"
          onClick={() => setShowInput(current => !current)}
          className={[
            "inline-flex items-center gap-1.5 rounded-lg border p-2 transition",
            showInput
              ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-200"
              : "border-white/10 text-slate-400 hover:bg-white/5 hover:text-white",
          ].join(" ")}
          title="Program input"
          aria-label="Toggle program input"
        >
          <Settings2 size={17} />
          <span className="hidden text-xs font-semibold md:inline">Input</span>
        </button>
        <button
          type="button"
          onClick={() => setIsFullscreen(current => !current)}
          className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button
          type="button"
          onClick={() => void runCode()}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? <Loader2 className="animate-spin" size={17} /> : <Play size={17} />}
          Run
        </button>
      </div>

      {showInput && (
        <div className="border-b border-white/10 bg-[#111520] p-3">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Program input
          </label>
          <textarea
            value={stdin}
            onChange={event => setStdin(event.target.value)}
            placeholder="Only needed when your program reads input..."
            className="h-20 w-full resize-none rounded-lg border border-white/10 bg-[#0c1019] p-3 font-mono text-sm text-slate-100 caret-cyan-300 outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
            maxLength={12000}
            spellCheck={false}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden bg-[#1b1f2d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <pre
          ref={lineNumbersRef}
          aria-hidden="true"
          className="select-none overflow-hidden border-r border-white/10 bg-[#151925] px-4 py-4 text-right font-mono text-[15px] leading-6 text-slate-600"
        >
          {lineNumbers}
        </pre>
        <textarea
          value={code}
          onChange={event => setCode(event.target.value)}
          onKeyDown={handleEditorKeyDown}
          onScroll={event => {
            if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop
          }}
          aria-label="Code editor"
          className="min-h-full flex-1 resize-none overflow-auto bg-[#1b1f2d] p-4 font-mono text-[15px] leading-6 text-slate-50 caret-cyan-300 outline-none selection:bg-indigo-500/40 placeholder:text-slate-600"
          placeholder={`Write your ${selectedLanguage.label} code here...`}
          spellCheck={false}
        />
      </div>
    </section>
  )

  const outputPane = (
    <section className="flex min-h-0 flex-col bg-[#151925]">
      <div className="flex min-h-12 items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#252a35] to-[#1a1f2c] px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-white">{previewLanguage ? "Preview" : "Output"}</h2>
          <span className={`text-xs font-semibold uppercase ${statusClasses(running ? undefined : runResult?.status)}`}>
            {running ? "running" : runResult?.status ?? "idle"}
          </span>
          {runResult && (
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-400 sm:inline">
              {runResult.duration_ms}ms
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setOutput("")
            setRunResult(null)
          }}
          disabled={!output && !runResult}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[#111622] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {previewLanguage ? (
          <iframe
            title="FlowDesk preview"
            srcDoc={previewDocument}
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
            className="h-full min-h-[420px] w-full bg-white"
          />
        ) : (
          <pre className="min-h-full whitespace-pre-wrap break-words p-5 font-mono text-sm leading-6 text-slate-100">
            {terminalText}
          </pre>
        )}
      </div>
    </section>
  )

  return (
    <div
      className={[
        "flex flex-col overflow-hidden bg-[#11141d] text-slate-100",
        isFullscreen ? "fixed inset-0 z-50 h-[100svh]" : "h-[100svh]",
      ].join(" ")}
      onKeyDown={handleShortcut}
    >
      {!isFullscreen && (
        <header className="flex min-h-[72px] items-center justify-between gap-3 border-b border-white/10 bg-[#0d1118] px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={19} />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <TerminalSquare size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-white">FlowDesk Compiler</h1>
              <p className="truncate text-xs text-slate-500">{selectedLanguage.label} online compiler</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 md:flex">
              <FolderOpen size={16} className="text-slate-500" />
              <select
                value={activeId ?? ""}
                onChange={event => selectFile(event.target.value)}
                disabled={loading}
                className="max-w-44 bg-transparent text-sm text-slate-300 outline-none"
                aria-label="Saved compiler files"
              >
                <option value="">New file</option>
                {files.map(file => (
                  <option key={file.id} value={file.id}>{file.title}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => startNewFile(language)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <FilePlus2 size={17} />
              <span className="hidden sm:inline">New</span>
            </button>
            <button
              type="button"
              onClick={() => void saveFile()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 overflow-x-auto border-b border-white/10 bg-[#20242d] md:w-[72px] md:flex-col md:border-b-0 md:border-r">
          {LANGUAGE_OPTIONS.map(option => {
            const selected = option.value === language
            const optionRuntime = runtimes.find(item => item.language === option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => changeLanguage(option.value)}
                title={`${option.label}${optionRuntime?.executable || isPreviewLanguage(option.value) ? "" : " - runtime unavailable"}`}
                className={[
                  "relative flex min-h-14 min-w-16 items-center justify-center border-indigo-500 text-xs font-bold transition md:min-h-16 md:min-w-0",
                  selected
                    ? "border-b-2 bg-indigo-600 text-white md:border-b-0 md:border-l-4"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                {option.shortLabel}
                {optionRuntime && !optionRuntime.executable && !isPreviewLanguage(option.value) && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex border-b border-white/10 bg-[#20242d] md:hidden">
            <button
              type="button"
              onClick={() => setMobilePane("code")}
              className={[
                "flex-1 py-2.5 text-sm font-semibold",
                mobilePane === "code" ? "bg-indigo-600 text-white" : "text-slate-400",
              ].join(" ")}
            >
              Code
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("output")}
              className={[
                "flex-1 py-2.5 text-sm font-semibold",
                mobilePane === "output" ? "bg-indigo-600 text-white" : "text-slate-400",
              ].join(" ")}
            >
              {previewLanguage ? "Preview" : "Output"}
            </button>
          </div>

          <main className="min-h-0 flex-1 md:flex md:flex-row">
            <div
              className={[
                "h-full md:w-1/2 md:min-w-0 md:shrink-0",
                mobilePane === "code" ? "block" : "hidden md:block",
              ].join(" ")}
            >
              {editorPane}
            </div>
            <div
              className={[
                "h-full md:w-1/2 md:min-w-0 md:shrink-0 md:border-l md:border-white/10",
                mobilePane === "output" ? "block" : "hidden md:block",
              ].join(" ")}
            >
              {outputPane}
            </div>
          </main>

          <footer className="flex min-h-7 items-center justify-between border-t border-white/10 bg-[#0d1118] px-3 text-[11px] text-slate-500">
            <span>{canRun ? "Ready" : runtime?.reason ?? "Runtime unavailable"}</span>
            <span className="hidden sm:inline">Ctrl+Enter Run | Ctrl+S Save | F11 Fullscreen</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
