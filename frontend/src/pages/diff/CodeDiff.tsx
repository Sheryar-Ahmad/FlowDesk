import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import type { OnMount } from "@monaco-editor/react"
import {
  ArrowLeft, GitCompare, Copy, Check, RotateCcw,
  ChevronUp, ChevronDown, Search, Download, Maximize2,
  Minimize2, FileCode, RefreshCw, Bot
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
    <div className={`relative bg-gray-950 flex flex-col ${fullscreen ? "fixed inset-0 z-50" : "min-h-screen h-[100dvh]"}`}>

      {/* Header */}
      <div className="border-b border-gray-800 px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between bg-gray-900 sticky top-0 z-20 gap-2">
        <div className="flex w-full sm:w-auto items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800">
            <ArrowLeft size={18} />
          </button>
          <GitCompare className="text-indigo-500" size={20} />
          <h1 className="text-white font-bold">Code Diff</h1>
          {totalChanges > 0 && (
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-xs bg-yellow-900 text-yellow-400 px-2 py-0.5 rounded-full">{changed}~</span>
              <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full">+{added}</span>
              <span className="text-xs bg-red-900 text-red-400 px-2 py-0.5 rounded-full">-{removed}</span>
            </div>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto pb-1 sm:w-auto sm:justify-end sm:overflow-visible sm:pb-0">
          {/* View mode */}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {(["split", "unified"] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`text-xs px-3 py-1 rounded-md transition-colors capitalize ${viewMode === m ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
                {m}
              </button>
            ))}
          </div>

          {/* Navigation */}
          {totalChanges > 0 && (
            <div className="flex items-center gap-1">
              <button onClick={goToPrevChange} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"><ChevronUp size={14} /></button>
              <span className="text-gray-500 text-xs">{activeChangeIndex + 1}/{totalChanges}</span>
              <button onClick={goToNextChange} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"><ChevronDown size={14} /></button>
            </div>
          )}

          {/* Search */}
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
              className="bg-gray-800 border border-gray-700 text-white rounded-lg pl-7 pr-3 py-1 text-xs focus:outline-none focus:border-indigo-500 w-32" />
          </div>

          {/* Action buttons */}
          <button onClick={loadSample} className="flex-shrink-0 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded-lg transition-colors border border-gray-700">
            Sample
          </button>
          <button onClick={swapCode} className="p-1.5 text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors" title="Swap panels">
            <RefreshCw size={15} />
          </button>
          <button onClick={explainWithAI} disabled={aiExplaining}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-white bg-indigo-950 hover:bg-indigo-900 px-3 py-1.5 rounded-lg transition-colors border border-indigo-800">
            <Bot size={13} /><span className="hidden sm:inline">{aiExplaining ? "Analyzing..." : "AI Explain"}</span>
          </button>
          {totalChanges > 0 && (
            <>
              <button onClick={copyDiff} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded-lg transition-colors border border-gray-700">
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
              <button onClick={copyPatch} className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded-lg transition-colors border border-gray-700" title="Copy as patch">
                Patch
              </button>
              <button onClick={exportHTML} className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-colors" title="Export HTML report">
                <Download size={15} />
              </button>
            </>
          )}
          <button
            onClick={() => setFullscreen(current => !current)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button onClick={resetDiff} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors" title="Reset diff">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* Options bar */}
      <div className="border-b border-gray-800 bg-gray-900 px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
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
        <div className="flex w-full sm:w-auto sm:ml-auto items-center gap-2 sm:gap-3 flex-shrink-0">
          <span className="text-gray-600 text-xs sm:hidden">Language:</span>
          <select value={leftLang} onChange={(e) => setLeftLang(e.target.value)}
            aria-label="Original language"
            className="min-w-0 flex-1 sm:flex-none bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="text-gray-600 text-xs">vs</span>
          <select value={rightLang} onChange={(e) => setRightLang(e.target.value)}
            aria-label="Modified language"
            className="min-w-0 flex-1 sm:flex-none bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Stats bar */}
      {showStats && totalChanges > 0 && (
        <div className="border-b border-gray-800 bg-gray-900 px-3 sm:px-4 py-2 flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-green-500" style={{ width: `${(added / totalChanges) * 100}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${(removed / totalChanges) * 100}%` }} />
              <div className="h-full bg-yellow-500" style={{ width: `${(changed / totalChanges) * 100}%` }} />
            </div>
            <span className="text-gray-500 text-xs">{totalChanges} total changes</span>
          </div>
          <span className="text-green-400 text-xs">+{added} added</span>
          <span className="text-red-400 text-xs">-{removed} removed</span>
          <span className="text-yellow-400 text-xs">~{changed} modified</span>
          <span className="text-gray-500 text-xs">{diff.filter(d => d.status === "same").length} unchanged</span>
          <span className="text-gray-600 text-xs ml-auto whitespace-nowrap">
            Detected: {detectedLeftLang} vs {detectedRightLang}
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {viewMode === "split" ? (
          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            <div className="flex md:hidden border-b border-gray-800 bg-gray-900 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setMobilePane("left")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  mobilePane === "left" ? "bg-red-950 text-red-300 border border-red-800" : "text-gray-500 border border-transparent"
                }`}
              >
                Original · {getLines(leftCode).length} lines
              </button>
              <button
                type="button"
                onClick={() => setMobilePane("right")}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  mobilePane === "right" ? "bg-green-950 text-green-300 border border-green-800" : "text-gray-500 border border-transparent"
                }`}
              >
                Modified · {getLines(rightCode).length} lines
              </button>
            </div>

            {/* Left Panel */}
            <div className={`${mobilePane === "left" ? "flex" : "hidden"} md:flex flex-col w-full h-full md:h-auto md:w-1/2 md:border-r border-gray-800`}>
              <div className="hidden md:flex px-4 py-2 bg-gray-900 border-b border-gray-800 items-center justify-between">
                <span className="text-red-400 text-xs font-medium flex items-center gap-2">
                  <FileCode size={12} />Original
                </span>
                <span className="text-gray-600 text-xs">{getLines(leftCode).length} lines</span>
              </div>
              <div className="flex-1 relative">
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
            <div className={`${mobilePane === "right" ? "flex" : "hidden"} md:flex flex-col w-full h-full md:h-auto md:w-1/2`}>
              <div className="hidden md:flex px-4 py-2 bg-gray-900 border-b border-gray-800 items-center justify-between">
                <span className="text-green-400 text-xs font-medium flex items-center gap-2">
                  <FileCode size={12} />Modified
                </span>
                <span className="text-gray-600 text-xs">{getLines(rightCode).length} lines</span>
              </div>
              <div className="flex-1 relative">
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
          <div className="flex-1 overflow-auto font-mono text-xs">
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
                  <div className="flex-1 px-3 py-1 min-w-0">
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
          <div className="fixed inset-x-3 top-20 bottom-3 z-30 w-auto md:static md:inset-auto md:w-80 border border-gray-700 md:border-y-0 md:border-r-0 md:border-l border-gray-800 bg-gray-900 flex flex-col flex-shrink-0 rounded-xl md:rounded-none shadow-2xl md:shadow-none">
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
