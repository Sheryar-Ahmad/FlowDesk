import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import type { OnMount } from "@monaco-editor/react"
import {
  ArrowLeft, GitCompare, Copy, Check, RotateCcw,
  ChevronUp, ChevronDown, Search, Download, Maximize2,
  Minimize2, FileCode, RefreshCw, Bot, SlidersHorizontal
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import { API_BASE_URL } from "../../services/api/config"
import axios from "axios"
import toast from "react-hot-toast"

const api = axios.create({ baseURL: API_BASE_URL, timeout: 60000 })
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const LANGUAGES = [
  "auto", "python", "javascript", "typescript", "java", "cpp", "c",
  "csharp", "go", "rust", "php", "ruby", "swift", "kotlin", "sql",
  "html", "css", "bash", "json", "yaml", "markdown", "xml"
]

const detectLanguage = (code: string): string => {
  const trimmed = code.trim()
  if (!trimmed) return "plaintext"

  if (/\bdef\s+\w+\s*\(/.test(code)) return "python"
  if (
    /\b(?:interface|type)\s+\w+/.test(code)
    || /\b(?:const|let|var)\s+\w+\s*:\s*[A-Za-z_$]/.test(code)
    || /\bfunction\s+\w+\s*\([^)]*:\s*[A-Za-z_$]/.test(code)
    || /\bfunction\s+\w+\s*\([^)]*\)\s*:\s*[A-Za-z_$]/.test(code)
    || /\([^)]*:\s*[A-Za-z_$][^)]*\)\s*=>/.test(code)
  ) return "typescript"
  if (code.includes("function") || code.includes("const ") || code.includes("let ") || code.includes("=>")) return "javascript"
  if (code.includes("public class") || code.includes("System.out")) return "java"
  if (code.includes("#include") || code.includes("cout <<")) return "cpp"
  if (code.includes("package main") || code.includes("fmt.Println")) return "go"
  if (code.includes("fn ") && code.includes("->")) return "rust"
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/im.test(code)) return "sql"
  if (/<(?:!DOCTYPE|html|div|span|head|body)\b/i.test(code)) return "html"
  if (/^\s*<\?xml|<\/?[A-Za-z][^>]*>/m.test(code)) return "xml"
  if (/^\s*(?:#!.*\b(?:bash|sh)|(?:export\s+)?[A-Z_][A-Z0-9_]*=)/m.test(code)) return "bash"
  if (/^\s*[\w-]+\s*:\s*(?:.+)?$/m.test(code) && !/[;{}]/.test(code)) return "yaml"
  try {
    JSON.parse(trimmed)
    return "json"
  } catch {
    // Continue with syntax heuristics.
  }
  if (/[.#]?[A-Za-z][\w-]*\s*\{[^}]*:[^}]*\}/s.test(code)) return "css"
  return "plaintext"
}

type ViewMode = "split" | "unified"

interface DiffLine {
  line: number
  leftLine: number
  rightLine: number
  left: string
  right: string
  status: "same" | "added" | "removed" | "changed"
}

const getLines = (code: string) => code === "" ? [] : code.replace(/\r\n?/g, "\n").split("\n")

const normalizeLine = (line: string, ignoreCase: boolean, ignoreWhitespace: boolean) => {
  let normalized = line
  if (ignoreCase) normalized = normalized.toLowerCase()
  if (ignoreWhitespace) normalized = normalized.replace(/\s+/g, " ").trim()
  return normalized
}

const formatWhitespace = (line: string, showWhitespace: boolean) => {
  if (!showWhitespace) return line
  return line.replace(/\t/g, "→   ").replace(/ /g, "·")
}

const buildIndexedDiff = (
  leftLines: string[],
  rightLines: string[],
  leftNormalized: string[],
  rightNormalized: string[],
): DiffLine[] => {
  const length = Math.max(leftLines.length, rightLines.length)

  return Array.from({ length }, (_, index) => {
    const hasLeft = index < leftLines.length
    const hasRight = index < rightLines.length
    const status: DiffLine["status"] = !hasLeft
      ? "added"
      : !hasRight
        ? "removed"
        : leftNormalized[index] === rightNormalized[index]
          ? "same"
          : "changed"

    return {
      line: index + 1,
      leftLine: hasLeft ? index + 1 : 0,
      rightLine: hasRight ? index + 1 : 0,
      left: leftLines[index] ?? "",
      right: rightLines[index] ?? "",
      status,
    }
  })
}

const buildDiff = (
  leftCode: string,
  rightCode: string,
  ignoreCase: boolean,
  ignoreWhitespace: boolean,
): DiffLine[] => {
  const leftLines = getLines(leftCode)
  const rightLines = getLines(rightCode)
  const leftNormalized = leftLines.map(line => normalizeLine(line, ignoreCase, ignoreWhitespace))
  const rightNormalized = rightLines.map(line => normalizeLine(line, ignoreCase, ignoreWhitespace))

  // Keep very large comparisons responsive instead of allocating a huge LCS table.
  if (leftLines.length * rightLines.length > 1_000_000) {
    return buildIndexedDiff(leftLines, rightLines, leftNormalized, rightNormalized)
  }

  const lcs = Array.from(
    { length: leftLines.length + 1 },
    () => new Uint32Array(rightLines.length + 1),
  )

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lcs[leftIndex][rightIndex] = leftNormalized[leftIndex] === rightNormalized[rightIndex]
        ? lcs[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(lcs[leftIndex + 1][rightIndex], lcs[leftIndex][rightIndex + 1])
    }
  }

  const result: DiffLine[] = []
  let leftIndex = 0
  let rightIndex = 0
  let displayLine = 1

  const addLine = (
    left: string,
    right: string,
    status: DiffLine["status"],
    leftLine: number,
    rightLine: number,
  ) => {
    result.push({ line: displayLine, leftLine, rightLine, left, right, status })
    displayLine += 1
  }

  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    if (
      leftIndex < leftLines.length
      && rightIndex < rightLines.length
      && leftNormalized[leftIndex] === rightNormalized[rightIndex]
    ) {
      addLine(
        leftLines[leftIndex],
        rightLines[rightIndex],
        "same",
        leftIndex + 1,
        rightIndex + 1,
      )
      leftIndex += 1
      rightIndex += 1
      continue
    }

    const blockLeftStart = leftIndex
    const blockRightStart = rightIndex

    while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
      if (
        leftIndex < leftLines.length
        && rightIndex < rightLines.length
        && leftNormalized[leftIndex] === rightNormalized[rightIndex]
      ) {
        break
      }

      if (
        rightIndex >= rightLines.length
        || (
          leftIndex < leftLines.length
          && lcs[leftIndex + 1][rightIndex] >= lcs[leftIndex][rightIndex + 1]
        )
      ) {
        leftIndex += 1
      } else {
        rightIndex += 1
      }
    }

    const leftCount = leftIndex - blockLeftStart
    const rightCount = rightIndex - blockRightStart
    const pairedCount = Math.min(leftCount, rightCount)

    for (let offset = 0; offset < pairedCount; offset += 1) {
      addLine(
        leftLines[blockLeftStart + offset],
        rightLines[blockRightStart + offset],
        "changed",
        blockLeftStart + offset + 1,
        blockRightStart + offset + 1,
      )
    }
    for (let offset = pairedCount; offset < leftCount; offset += 1) {
      addLine(leftLines[blockLeftStart + offset], "", "removed", blockLeftStart + offset + 1, 0)
    }
    for (let offset = pairedCount; offset < rightCount; offset += 1) {
      addLine("", rightLines[blockRightStart + offset], "added", 0, blockRightStart + offset + 1)
    }
  }

  return result
}

const escapeHtml = (value: string) => value.replace(
  /[&<>"']/g,
  character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character,
)

const getApiErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ detail?: string }>(error)) {
    if (error.response?.status === 401) return "Your session expired. Please sign in again."
    if (error.response?.status === 429) return "AI request limit reached. Please wait and try again."
    if (!error.response) return "Cannot reach the FlowDesk backend."
    return error.response?.data?.detail || error.message || "AI analysis failed"
  }
  return error instanceof Error ? error.message : "AI analysis failed"
}

type MonacoEditorInstance = Parameters<OnMount>[0]

export default function CodeDiff() {
  const { isAuthenticated, accessToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const leftEditorRef = useRef<MonacoEditorInstance | null>(null)
  const rightEditorRef = useRef<MonacoEditorInstance | null>(null)

  const [leftCode, setLeftCode] = useState("")
  const [rightCode, setRightCode] = useState("")
  const [leftLang, setLeftLang] = useState("auto")
  const [rightLang, setRightLang] = useState("auto")
  const [viewMode, setViewMode] = useState<ViewMode>("split")
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [showWhitespace, setShowWhitespace] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentChangeIdx, setCurrentChangeIdx] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const [aiExplaining, setAiExplaining] = useState(false)
  const [aiExplanation, setAiExplanation] = useState("")
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [mobilePane, setMobilePane] = useState<"left" | "right">("left")
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false)
  const deferredLeftCode = useDeferredValue(leftCode)
  const deferredRightCode = useDeferredValue(rightCode)

  useEffect(() => {
    if (!isAuthenticated || !accessToken) navigate("/login", { replace: true })
  }, [accessToken, isAuthenticated, navigate])

  const diff = useMemo(
    () => deferredLeftCode || deferredRightCode
      ? buildDiff(deferredLeftCode, deferredRightCode, ignoreCase, ignoreWhitespace)
      : [],
    [deferredLeftCode, deferredRightCode, ignoreCase, ignoreWhitespace],
  )
  const changes = useMemo(() => diff.filter(line => line.status !== "same"), [diff])
  const added = useMemo(() => changes.filter(line => line.status === "added").length, [changes])
  const removed = useMemo(() => changes.filter(line => line.status === "removed").length, [changes])
  const changed = useMemo(() => changes.filter(line => line.status === "changed").length, [changes])
  const totalChanges = changes.length

  const filteredDiff = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return diff
    return diff.filter(line =>
      line.left.toLowerCase().includes(query)
      || line.right.toLowerCase().includes(query),
    )
  }, [diff, searchQuery])

  const detectedLeftLang = leftLang === "auto" ? detectLanguage(leftCode) : leftLang
  const detectedRightLang = rightLang === "auto" ? detectLanguage(rightCode) : rightLang
  const activeChangeIndex = Math.min(currentChangeIdx, Math.max(totalChanges - 1, 0))
  const activeChange = changes[activeChangeIndex]

  if (!isAuthenticated || !accessToken) return null

  const writeClipboard = async (text: string, successMessage: string) => {
    if (!text) {
      toast.error("There are no changes to copy.")
      return false
    }

    try {
      await navigator.clipboard.writeText(text)
      toast.success(successMessage)
      return true
    } catch {
      toast.error("Clipboard access failed. Please allow clipboard permission.")
      return false
    }
  }

  const copyDiff = async () => {
    const text = changes.map(line => {
      if (line.status === "added") return `Line ${line.rightLine}: + ${line.right}`
      if (line.status === "removed") return `Line ${line.leftLine}: - ${line.left}`
      return `Lines ${line.leftLine}/${line.rightLine}: ${line.left} => ${line.right}`
    }).join("\n")

    if (await writeClipboard(text, "Diff copied!")) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copyPatch = async () => {
    const patch = [
      "--- original",
      "+++ modified",
      ...diff.flatMap(line => {
        if (line.status === "same") return [`  ${line.left}`]
        if (line.status === "removed") return [`- ${line.left}`]
        if (line.status === "added") return [`+ ${line.right}`]
        return [`- ${line.left}`, `+ ${line.right}`]
      }),
    ].join("\n")

    await writeClipboard(patch, "Patch copied!")
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const exportHTML = () => {
    try {
      const rows = diff.map(line => {
        const color = line.status === "added" ? "#1a3a1a" : line.status === "removed" ? "#3a1a1a" : line.status === "changed" ? "#3a3a1a" : "transparent"
        const leftLine = line.leftLine || ""
        const rightLine = line.rightLine || ""
        return `<tr style="background:${color}"><td style="color:#666;padding:4px 8px;border-right:1px solid #333">${leftLine}</td><td style="color:#ccc;padding:4px 8px;border-right:1px solid #333;font-family:monospace;white-space:pre-wrap">${escapeHtml(line.left)}</td><td style="color:#666;padding:4px 8px;border-right:1px solid #333">${rightLine}</td><td style="color:#ccc;padding:4px 8px;font-family:monospace;white-space:pre-wrap">${escapeHtml(line.right)}</td></tr>`
      }).join("")
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlowDesk Code Diff</title></head><body style="background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif"><h2 style="color:#6366f1">FlowDesk Code Diff Report</h2><p>Changes: ${totalChanges} | Added: ${added} | Removed: ${removed} | Modified: ${changed}</p><table style="width:100%;border-collapse:collapse;border:1px solid #333"><thead><tr><th>Original</th><th>Code</th><th>Modified</th><th>Code</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
      downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "diff-report.html")
      toast.success("HTML report exported!")
    } catch {
      toast.error("Could not export the HTML report.")
    }
  }

  const swapCode = () => {
    setLeftCode(rightCode)
    setRightCode(leftCode)
    setLeftLang(rightLang)
    setRightLang(leftLang)
    setCurrentChangeIdx(0)
    toast.success("Code swapped!")
  }

  const explainWithAI = async () => {
    if (!leftCode || !rightCode) { toast.error("Add code to both panels first"); return }
    setAiExplaining(true)
    setShowAiPanel(true)
    try {
      const prompt = `Analyze this code diff and explain:
1. What changed and why it matters
2. Potential bugs introduced
3. Performance impact
4. Security implications
5. Better alternatives if any

ORIGINAL (${detectedLeftLang}):
${leftCode.slice(0, 6000)}

MODIFIED (${detectedRightLang}):
${rightCode.slice(0, 6000)}`

      const { data } = await api.post("/ai/chat", {
        messages: [{ role: "user", content: prompt }]
      })
      if (typeof data.response !== "string" || !data.response.trim()) {
        throw new Error("The AI service returned an empty response.")
      }
      setAiExplanation(data.response)
    } catch (err: unknown) {
      const message = getApiErrorMessage(err)
      toast.error(message)
      setAiExplanation("AI analysis failed. Please try again.")
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await logout()
        navigate("/login", { replace: true })
      }
    } finally {
      setAiExplaining(false)
    }
  }

  const revealChange = (index: number) => {
    const change = changes[index]
    if (!change) return

    if (change.leftLine) {
      leftEditorRef.current?.revealLineInCenter(change.leftLine)
      leftEditorRef.current?.setPosition({ lineNumber: change.leftLine, column: 1 })
    }
    if (change.rightLine) {
      rightEditorRef.current?.revealLineInCenter(change.rightLine)
      rightEditorRef.current?.setPosition({ lineNumber: change.rightLine, column: 1 })
    }

    if (viewMode === "unified") {
      window.requestAnimationFrame(() => {
        document.querySelector(`[data-diff-line="${change.line}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" })
      })
    }
  }

  const moveToChange = (direction: 1 | -1) => {
    if (changes.length === 0) return
    const next = (
      Math.min(currentChangeIdx, changes.length - 1)
      + direction
      + changes.length
    ) % changes.length
    setCurrentChangeIdx(next)
    revealChange(next)
  }

  const goToNextChange = () => moveToChange(1)
  const goToPrevChange = () => moveToChange(-1)

  const resetDiff = () => {
    setLeftCode("")
    setRightCode("")
    setLeftLang("auto")
    setRightLang("auto")
    setSearchQuery("")
    setCurrentChangeIdx(0)
    setAiExplanation("")
    setShowAiPanel(false)
    setCopied(false)
  }

  const loadSample = () => {
    setLeftCode(`function calculateSum(arr) {
  let sum = 0;
  for (let i = 0; i <= arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}

function greet(name) {
  console.log("Hello " + name);
}`)
    setRightCode(`function calculateSum(arr) {
  // Fixed: use reduce to avoid boundary errors
  return arr.reduce((sum, num) => sum + num, 0);
}

function greet(name) {
  // Improved: using template literal
  console.log(\`Hello, \${name}!\`);
}`)
    setLeftLang("auto")
    setRightLang("auto")
    setSearchQuery("")
    setCurrentChangeIdx(0)
    setAiExplanation("")
    setShowAiPanel(false)
    toast.success("Sample loaded!")
  }

  return (
    <div className={`relative bg-gray-950 flex flex-col overflow-hidden ${fullscreen ? "fixed inset-0 z-50" : "min-h-screen h-[100dvh]"}`}>

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <GitCompare className="flex-shrink-0 text-indigo-500" size={20} />
            <h1 className="truncate text-base font-bold text-white sm:text-lg">Code Diff</h1>
            {totalChanges > 0 && (
              <div className="hidden items-center gap-1.5 lg:flex">
                <span className="rounded-full bg-yellow-900 px-2 py-0.5 text-xs text-yellow-400">{changed}~</span>
                <span className="rounded-full bg-green-900 px-2 py-0.5 text-xs text-green-400">+{added}</span>
                <span className="rounded-full bg-red-900 px-2 py-0.5 text-xs text-red-400">-{removed}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 lg:hidden">
            <button
              onClick={loadSample}
              className="flex h-9 items-center rounded-lg border border-gray-700 bg-gray-800 px-3 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Sample
            </button>
            <button
              onClick={() => setFullscreen(current => !current)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>

          <div className="hidden min-w-0 flex-nowrap items-center justify-end gap-1.5 lg:flex">
            <div className="flex rounded-lg bg-gray-800 p-0.5">
              {(["split", "unified"] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${
                    viewMode === mode ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {totalChanges > 0 && (
              <div className="flex items-center gap-1">
                <button onClick={goToPrevChange} className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"><ChevronUp size={14} /></button>
                <span className="text-xs text-gray-500">{activeChangeIndex + 1}/{totalChanges}</span>
                <button onClick={goToNextChange} className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"><ChevronDown size={14} /></button>
              </div>
            )}

            <div className="relative hidden lg:block">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" size={12} />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  if (event.target.value) setViewMode("unified")
                }}
                placeholder="Search diff..."
                className="w-32 rounded-lg border border-gray-700 bg-gray-800 py-1 pl-7 pr-3 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button onClick={loadSample} className="flex-shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white">
              Sample
            </button>
            <button onClick={swapCode} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-indigo-400" title="Swap panels">
              <RefreshCw size={15} />
            </button>
            <button
              onClick={explainWithAI}
              disabled={aiExplaining}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-800 bg-indigo-950 px-3 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-900 hover:text-white"
            >
              <Bot size={13} /><span>{aiExplaining ? "Analyzing..." : "AI Explain"}</span>
            </button>
            {totalChanges > 0 && (
              <>
                <button onClick={copyDiff} className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white">
                  {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                </button>
                <button onClick={copyPatch} className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white" title="Copy as patch">
                  Patch
                </button>
                <button onClick={exportHTML} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-green-400" title="Export HTML report">
                  <Download size={15} />
                </button>
              </>
            )}
            <button
              onClick={() => setFullscreen(current => !current)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={resetDiff} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-400" title="Reset diff">
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-gray-800/80 px-3 py-2 lg:hidden">
          <div className="flex min-w-0 flex-1 rounded-lg bg-gray-800 p-1">
            {(["split", "unified"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  viewMode === mode ? "bg-indigo-600 text-white shadow-sm" : "text-gray-400"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={swapCode}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-400 transition-colors hover:text-indigo-300"
            aria-label="Swap original and modified code"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={explainWithAI}
            disabled={aiExplaining}
            className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-indigo-800 bg-indigo-950 px-3 text-xs font-medium text-indigo-300 transition-colors disabled:opacity-60"
          >
            <Bot size={15} />
            <span>Explain</span>
          </button>
        </div>
      </div>

      {/* Options bar */}
      <div className="hidden border-b border-gray-800 bg-gray-900 px-4 py-2 lg:flex lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide">
          <span className="text-gray-600 text-xs font-medium flex-shrink-0">Options:</span>
          {[
            { label: "Ignore Case", value: ignoreCase, set: setIgnoreCase },
            { label: "Ignore Whitespace", value: ignoreWhitespace, set: setIgnoreWhitespace },
            { label: "Line Numbers", value: showLineNumbers, set: setShowLineNumbers },
            { label: "Whitespace", value: showWhitespace, set: setShowWhitespace },
            { label: "Show Stats", value: showStats, set: setShowStats },
          ].map(opt => (
            <button key={opt.label} onClick={() => opt.set(!opt.value)}
              className={`text-xs px-3 py-1 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${opt.value ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-shrink-0 items-center gap-3">
          <select value={leftLang} onChange={(e) => setLeftLang(e.target.value)}
            aria-label="Original language"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:outline-none">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="text-gray-600 text-xs">vs</span>
          <select value={rightLang} onChange={(e) => setRightLang(e.target.value)}
            aria-label="Modified language"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:outline-none">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="border-b border-gray-800 bg-gray-900 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSettingsOpen(current => !current)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          aria-expanded={mobileSettingsOpen}
          aria-controls="mobile-diff-settings"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal size={15} className="flex-shrink-0 text-indigo-400" />
            <span className="text-xs font-medium text-gray-300">Comparison settings</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-gray-500">
            <span className="max-w-40 truncate">{leftLang} vs {rightLang}</span>
            <ChevronDown
              size={15}
              className={`flex-shrink-0 transition-transform ${mobileSettingsOpen ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {mobileSettingsOpen && (
          <div id="mobile-diff-settings" className="max-h-[55dvh] space-y-3 overflow-y-auto border-t border-gray-800 px-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Ignore case", value: ignoreCase, set: setIgnoreCase },
                { label: "Ignore spaces", value: ignoreWhitespace, set: setIgnoreWhitespace },
                { label: "Line numbers", value: showLineNumbers, set: setShowLineNumbers },
                { label: "Show whitespace", value: showWhitespace, set: setShowWhitespace },
                { label: "Show statistics", value: showStats, set: setShowStats },
              ].map(option => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => option.set(!option.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    option.value
                      ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-200"
                      : "border-gray-700 bg-gray-800 text-gray-400"
                  } ${option.label === "Show statistics" ? "col-span-2" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    {option.label}
                    <span className={`h-2 w-2 rounded-full ${option.value ? "bg-indigo-400" : "bg-gray-600"}`} />
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-red-300">Original language</span>
                <select
                  value={leftLang}
                  onChange={(event) => setLeftLang(event.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 text-xs text-gray-200 focus:border-indigo-500 focus:outline-none"
                >
                  {LANGUAGES.map(language => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-green-300">Modified language</span>
                <select
                  value={rightLang}
                  onChange={(event) => setRightLang(event.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 text-xs text-gray-200 focus:border-indigo-500 focus:outline-none"
                >
                  {LANGUAGES.map(language => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={resetDiff}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-300"
            >
              <RotateCcw size={14} />
              Reset comparison
            </button>
          </div>
        )}
      </div>

      {/* Stats bar */}
      {totalChanges > 0 && (
        <>
          <div className="space-y-2 border-b border-gray-800 bg-gray-900 px-3 py-2.5 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-200">{totalChanges} changes</p>
                <p className="truncate text-[10px] text-gray-500">
                  {detectedLeftLang} vs {detectedRightLang}
                </p>
              </div>
              <div className="flex items-center rounded-lg border border-gray-700 bg-gray-800">
                <button
                  type="button"
                  onClick={goToPrevChange}
                  className="flex h-8 w-8 items-center justify-center text-gray-400"
                  aria-label="Previous change"
                >
                  <ChevronUp size={14} />
                </button>
                <span className="min-w-10 text-center text-[11px] text-gray-400">
                  {activeChangeIndex + 1}/{totalChanges}
                </span>
                <button
                  type="button"
                  onClick={goToNextChange}
                  className="flex h-8 w-8 items-center justify-center text-gray-400"
                  aria-label="Next change"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>

            {showStats && (
              <div className="grid grid-cols-3 gap-1.5">
                <span className="rounded-md bg-green-950/70 px-2 py-1 text-center text-[10px] text-green-300">+{added} added</span>
                <span className="rounded-md bg-red-950/70 px-2 py-1 text-center text-[10px] text-red-300">-{removed} removed</span>
                <span className="rounded-md bg-yellow-950/70 px-2 py-1 text-center text-[10px] text-yellow-300">~{changed} changed</span>
              </div>
            )}

            {viewMode === "unified" && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={13} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search changed code"
                  className="h-9 w-full rounded-lg border border-gray-700 bg-gray-800 pl-8 pr-3 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={copyDiff}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 text-[11px] text-gray-300"
              >
                {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                Copy
              </button>
              <button
                type="button"
                onClick={copyPatch}
                className="flex h-9 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-[11px] text-gray-300"
              >
                Patch
              </button>
              <button
                type="button"
                onClick={exportHTML}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 text-[11px] text-gray-300"
              >
                <Download size={13} />
                Export
              </button>
            </div>
          </div>

          {showStats && (
            <div className="hidden items-center gap-4 overflow-x-auto border-b border-gray-800 bg-gray-900 px-4 py-2 lg:flex lg:gap-6 scrollbar-hide">
              <div className="flex items-center gap-2">
                <div className="flex h-2 w-24 overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full bg-green-500" style={{ width: `${(added / totalChanges) * 100}%` }} />
                  <div className="h-full bg-red-500" style={{ width: `${(removed / totalChanges) * 100}%` }} />
                  <div className="h-full bg-yellow-500" style={{ width: `${(changed / totalChanges) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500">{totalChanges} total changes</span>
              </div>
              <span className="text-xs text-green-400">+{added} added</span>
              <span className="text-xs text-red-400">-{removed} removed</span>
              <span className="text-xs text-yellow-400">~{changed} modified</span>
              <span className="text-xs text-gray-500">{diff.filter(d => d.status === "same").length} unchanged</span>
              <span className="ml-auto whitespace-nowrap text-xs text-gray-600">
                Detected: {detectedLeftLang} vs {detectedRightLang}
              </span>
            </div>
          )}
        </>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {viewMode === "split" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
            <div className="flex gap-1 border-b border-gray-800 bg-gray-950 p-2 md:hidden">
              <button
                type="button"
                onClick={() => setMobilePane("left")}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                  mobilePane === "left" ? "border-red-700/70 bg-red-950/70 text-red-200" : "border-transparent text-gray-500"
                }`}
              >
                <span className="block text-xs font-semibold">Original</span>
                <span className="mt-0.5 block text-[10px] opacity-70">{getLines(leftCode).length} lines</span>
              </button>
              <button
                type="button"
                onClick={() => setMobilePane("right")}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                  mobilePane === "right" ? "border-green-700/70 bg-green-950/70 text-green-200" : "border-transparent text-gray-500"
                }`}
              >
                <span className="block text-xs font-semibold">Modified</span>
                <span className="mt-0.5 block text-[10px] opacity-70">{getLines(rightCode).length} lines</span>
              </button>
            </div>

            {/* Left Panel */}
            <div className={`${mobilePane === "left" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col md:flex md:w-1/2 md:border-r border-gray-800`}>
              <div className="hidden md:flex px-4 py-2 bg-gray-900 border-b border-gray-800 items-center justify-between">
                <span className="text-red-400 text-xs font-medium flex items-center gap-2">
                  <FileCode size={12} />Original
                </span>
                <span className="text-gray-600 text-xs">{getLines(leftCode).length} lines</span>
              </div>
              <div className="relative min-h-0 min-w-0 flex-1">
                {!leftCode && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
                    <div className="text-center">
                      <FileCode className="mx-auto mb-2 text-gray-800" size={36} />
                      <p className="text-sm text-gray-600">Paste the original code here</p>
                    </div>
                  </div>
                )}
                <Editor
                  height="100%"
                  language={detectedLeftLang}
                  value={leftCode}
                  onChange={(v) => setLeftCode(v || "")}
                  onMount={(editor) => {
                    leftEditorRef.current = editor
                  }}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: showLineNumbers ? "on" : "off",
                    lineNumbersMinChars: 3,
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 8,
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    renderWhitespace: showWhitespace ? "all" : "none",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    padding: { top: 8 },
                    fontFamily: "JetBrains Mono, Consolas, monospace",
                  }}
                />
              </div>
            </div>

            {/* Right Panel */}
            <div className={`${mobilePane === "right" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col md:flex md:w-1/2`}>
              <div className="hidden md:flex px-4 py-2 bg-gray-900 border-b border-gray-800 items-center justify-between">
                <span className="text-green-400 text-xs font-medium flex items-center gap-2">
                  <FileCode size={12} />Modified
                </span>
                <span className="text-gray-600 text-xs">{getLines(rightCode).length} lines</span>
              </div>
              <div className="relative min-h-0 min-w-0 flex-1">
                {!rightCode && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
                    <div className="text-center">
                      <FileCode className="mx-auto mb-2 text-gray-800" size={36} />
                      <p className="text-sm text-gray-600">Paste the modified code here</p>
                    </div>
                  </div>
                )}
                <Editor
                  height="100%"
                  language={detectedRightLang}
                  value={rightCode}
                  onChange={(v) => setRightCode(v || "")}
                  onMount={(editor) => {
                    rightEditorRef.current = editor
                  }}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: showLineNumbers ? "on" : "off",
                    lineNumbersMinChars: 3,
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 8,
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    renderWhitespace: showWhitespace ? "all" : "none",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    padding: { top: 8 },
                    fontFamily: "JetBrains Mono, Consolas, monospace",
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Unified View */
          <div className="min-w-0 flex-1 overflow-auto font-mono text-xs">
            {filteredDiff.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <GitCompare className="text-gray-800 mx-auto mb-4" size={64} />
                  <p className="text-gray-500">
                    {searchQuery ? `No lines match "${searchQuery}"` : "No differences found"}
                  </p>
                </div>
              </div>
            ) : (
              filteredDiff.map((line, i) => (
                <div key={i} data-diff-line={line.line} className={`flex border-b border-gray-900 ${
                  line.status === "added" ? "bg-green-950" :
                  line.status === "removed" ? "bg-red-950" :
                  line.status === "changed" ? "bg-yellow-950" : ""
                } ${activeChange?.line === line.line ? "ring-1 ring-inset ring-indigo-500" : ""}`}>
                  {showLineNumbers && (
                    <div className="w-10 px-2 py-1 text-gray-600 border-r border-gray-800 text-right flex-shrink-0">
                      {line.line}
                    </div>
                  )}
                  <div className="w-4 px-1 py-1 border-r border-gray-800 flex-shrink-0 flex items-center justify-center">
                    {line.status === "added" && <span className="text-green-400">+</span>}
                    {line.status === "removed" && <span className="text-red-400">-</span>}
                    {line.status === "changed" && <span className="text-yellow-400">~</span>}
                  </div>
                  <div className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-1">
                    {line.status === "changed" ? (
                      <div>
                        <div className="text-red-300 line-through opacity-70">
                          {formatWhitespace(line.left, showWhitespace)}
                        </div>
                        <div className="text-green-300">
                          {formatWhitespace(line.right, showWhitespace)}
                        </div>
                      </div>
                    ) : (
                      <span className={
                        line.status === "added" ? "text-green-300" :
                        line.status === "removed" ? "text-red-300" : "text-gray-500"
                      }>
                        {formatWhitespace(
                          line.status === "removed" ? line.left : line.right || line.left,
                          showWhitespace,
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* AI Explanation Panel */}
        {showAiPanel && (
          <div className="fixed inset-x-3 bottom-3 top-3 z-30 flex w-auto flex-shrink-0 flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-2xl md:static md:inset-auto md:w-80 md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:border-gray-800 md:shadow-none">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-indigo-400" />
                <span className="text-white text-sm font-medium">AI Analysis</span>
              </div>
              <button onClick={() => setShowAiPanel(false)} className="text-gray-500 hover:text-white text-xs">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {aiExplaining ? (
                <div className="flex items-center gap-2 text-indigo-400 text-sm">
                  <div className="animate-spin w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full" />
                  Analyzing changes...
                </div>
              ) : aiExplanation ? (
                <div className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">{aiExplanation}</div>
              ) : (
                <p className="text-gray-600 text-xs">Click "AI Explain" to analyze the diff</p>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
