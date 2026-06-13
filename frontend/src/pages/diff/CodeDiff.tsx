import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import {
  ArrowLeft, GitCompare, Copy, Check, RotateCcw,
  ChevronUp, ChevronDown, Search, Download, Maximize2,
  FileCode, RefreshCw, Bot
} from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import axios from "axios"
import toast from "react-hot-toast"

const api = axios.create({ baseURL: "http://localhost:8000/api/v1", timeout: 60000 })
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
  if (code.includes("def ") && code.includes(":")) return "python"
  if (code.includes("function") || code.includes("const ") || code.includes("=>")) return "javascript"
  if (code.includes("interface ") || code.includes(": string") || code.includes(": number")) return "typescript"
  if (code.includes("public class") || code.includes("System.out")) return "java"
  if (code.includes("#include") || code.includes("cout <<")) return "cpp"
  if (code.includes("package main") || code.includes("fmt.Println")) return "go"
  if (code.includes("fn ") && code.includes("->")) return "rust"
  if (code.includes("SELECT") || code.includes("INSERT INTO")) return "sql"
  if (code.includes("<html") || code.includes("<!DOCTYPE")) return "html"
  if (code.includes("{") && code.includes("}") && code.includes(":")) return "json"
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

const getLines = (code: string) => code.split("\n")

const normalizeLine = (line: string, ignoreCase: boolean, ignoreWhitespace: boolean) => {
  let normalized = line
  if (ignoreCase) normalized = normalized.toLowerCase()
  if (ignoreWhitespace) normalized = normalized.replace(/\s+/g, " ").trim()
  return normalized
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
    return error.response?.data?.detail || error.message || "AI analysis failed"
  }
  return error instanceof Error ? error.message : "AI analysis failed"
}

export default function CodeDiff() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

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

  useEffect(() => {
    if (!isAuthenticated) navigate("/login", { replace: true })
  }, [isAuthenticated, navigate])

  const diff = useMemo(
    () => leftCode || rightCode
      ? buildDiff(leftCode, rightCode, ignoreCase, ignoreWhitespace)
      : [],
    [ignoreCase, ignoreWhitespace, leftCode, rightCode],
  )
  const changes = diff.filter(d => d.status !== "same")
  const added = changes.filter(d => d.status === "added").length
  const removed = changes.filter(d => d.status === "removed").length
  const changed = changes.filter(d => d.status === "changed").length
  const totalChanges = changes.length

  const filteredDiff = searchQuery
    ? diff.filter(d => d.left.toLowerCase().includes(searchQuery.toLowerCase()) || d.right.toLowerCase().includes(searchQuery.toLowerCase()))
    : diff

  const detectedLeftLang = leftLang === "auto" ? detectLanguage(leftCode) : leftLang
  const detectedRightLang = rightLang === "auto" ? detectLanguage(rightCode) : rightLang
  const activeChangeIndex = Math.min(currentChangeIdx, Math.max(totalChanges - 1, 0))
  const activeChange = changes[activeChangeIndex]

  if (!isAuthenticated) return null

  const copyDiff = async () => {
    const text = changes.map(d => `Line ${d.line}: ${d.left} => ${d.right}`).join("\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success("Diff copied!")
    setTimeout(() => setCopied(false), 2000)
  }

  const copyPatch = async () => {
    const patch = changes.map(d => {
      if (d.status === "removed") return `- ${d.left}`
      if (d.status === "added") return `+ ${d.right}`
      return `- ${d.left}\n+ ${d.right}`
    }).join("\n")
    await navigator.clipboard.writeText(patch)
    toast.success("Patch copied!")
  }

  const exportHTML = () => {
    const rows = diff.map(d => {
      const color = d.status === "added" ? "#1a3a1a" : d.status === "removed" ? "#3a1a1a" : d.status === "changed" ? "#3a3a1a" : "transparent"
      return `<tr style="background:${color}"><td style="color:#666;padding:4px 8px;border-right:1px solid #333">${d.line}</td><td style="color:#ccc;padding:4px 8px;border-right:1px solid #333;font-family:monospace">${escapeHtml(d.left)}</td><td style="color:#ccc;padding:4px 8px;font-family:monospace">${escapeHtml(d.right)}</td></tr>`
    }).join("")
    const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff"><h2 style="color:#6366f1">FlowDesk Code Diff Report</h2><p>Changes: ${totalChanges} | Added: ${added} | Removed: ${removed} | Modified: ${changed}</p><table style="width:100%;border-collapse:collapse;border:1px solid #333">${rows}</table></body></html>`
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "diff-report.html"; a.click()
    URL.revokeObjectURL(url)
    toast.success("HTML report exported!")
  }

  const swapCode = () => {
    setLeftCode(rightCode)
    setRightCode(leftCode)
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

ORIGINAL:
${leftCode.slice(0, 1000)}

MODIFIED:
${rightCode.slice(0, 1000)}`

      const { data } = await api.post("/ai/chat", {
        messages: [{ role: "user", content: prompt }]
      })
      setAiExplanation(data.response)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err))
      setAiExplanation("AI analysis failed. Please try again.")
    } finally {
      setAiExplaining(false)
    }
  }

  const goToNextChange = () => {
    if (changes.length === 0) return
    setCurrentChangeIdx(prev => (Math.min(prev, changes.length - 1) + 1) % changes.length)
  }

  const goToPrevChange = () => {
    if (changes.length === 0) return
    setCurrentChangeIdx(prev => (Math.min(prev, changes.length - 1) - 1 + changes.length) % changes.length)
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
    toast.success("Sample loaded!")
  }

  return (
    <div className={`relative bg-gray-950 flex flex-col ${fullscreen ? "fixed inset-0 z-50" : "min-h-screen h-[100dvh]"}`}>

      {/* Header */}
      <div className="border-b border-gray-800 px-3 sm:px-4 py-3 flex items-center justify-between bg-gray-900 sticky top-0 z-20 flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
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

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
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
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search diff..."
              className="bg-gray-800 border border-gray-700 text-white rounded-lg pl-7 pr-3 py-1 text-xs focus:outline-none focus:border-indigo-500 w-32" />
          </div>

          {/* Action buttons */}
          <button onClick={loadSample} className="hidden sm:block text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded-lg transition-colors border border-gray-700">
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
          <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <Maximize2 size={15} />
          </button>
          <button onClick={() => { setLeftCode(""); setRightCode(""); setAiExplanation("") }} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* Options bar */}
      <div className="border-b border-gray-800 bg-gray-900 px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-hide">
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
        <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <select value={leftLang} onChange={(e) => setLeftLang(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="text-gray-600 text-xs">vs</span>
          <select value={rightLang} onChange={(e) => setRightLang(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none">
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
            {/* Left Panel */}
            <div className="flex flex-col w-full h-1/2 md:h-auto md:w-1/2 border-b md:border-b-0 md:border-r border-gray-800">
              <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                <span className="text-red-400 text-xs font-medium flex items-center gap-2">
                  <FileCode size={12} />Original
                </span>
                <span className="text-gray-600 text-xs">{getLines(leftCode).length} lines</span>
              </div>
              <div className="flex-1 relative">
                <Editor
                  height="100%"
                  language={detectedLeftLang}
                  value={leftCode}
                  onChange={(v) => setLeftCode(v || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: showLineNumbers ? "on" : "off",
                    renderWhitespace: showWhitespace ? "all" : "none",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 8 },
                    fontFamily: "JetBrains Mono, Consolas, monospace",
                  }}
                />
              </div>
            </div>

            {/* Right Panel */}
            <div className="flex flex-col w-full h-1/2 md:h-auto md:w-1/2">
              <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                <span className="text-green-400 text-xs font-medium flex items-center gap-2">
                  <FileCode size={12} />Modified
                </span>
                <span className="text-gray-600 text-xs">{getLines(rightCode).length} lines</span>
              </div>
              <div className="flex-1 relative">
                <Editor
                  height="100%"
                  language={detectedRightLang}
                  value={rightCode}
                  onChange={(v) => setRightCode(v || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: showLineNumbers ? "on" : "off",
                    renderWhitespace: showWhitespace ? "all" : "none",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
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
                  <p className="text-gray-500">No differences found</p>
                </div>
              </div>
            ) : (
              filteredDiff.map((line, i) => (
                <div key={i} className={`flex border-b border-gray-900 ${
                  line.status === "added" ? "bg-green-950" :
                  line.status === "removed" ? "bg-red-950" :
                  line.status === "changed" ? "bg-yellow-950" : ""
                } ${activeChange?.line === line.line ? "ring-1 ring-inset ring-indigo-500" : ""}`}>
                  <div className="w-10 px-2 py-1 text-gray-600 border-r border-gray-800 text-right flex-shrink-0">{line.line}</div>
                  <div className="w-4 px-1 py-1 border-r border-gray-800 flex-shrink-0 flex items-center justify-center">
                    {line.status === "added" && <span className="text-green-400">+</span>}
                    {line.status === "removed" && <span className="text-red-400">-</span>}
                    {line.status === "changed" && <span className="text-yellow-400">~</span>}
                  </div>
                  <div className="flex-1 px-3 py-1 min-w-0">
                    {line.status === "changed" ? (
                      <div>
                        <div className="text-red-300 line-through opacity-70">{line.left}</div>
                        <div className="text-green-300">{line.right}</div>
                      </div>
                    ) : (
                      <span className={
                        line.status === "added" ? "text-green-300" :
                        line.status === "removed" ? "text-red-300" : "text-gray-500"
                      }>
                        {line.status === "removed" ? line.left : line.right || line.left}
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

      {/* Empty state */}
      {!leftCode && !rightCode && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4" style={{ top: "120px" }}>
          <div className="text-center max-w-lg">
            <GitCompare className="text-gray-800 mx-auto mb-4" size={64} />
            <h3 className="text-gray-500 text-lg sm:text-xl font-semibold mb-2">Ultimate Code Diff Tool</h3>
            <p className="text-gray-600 text-sm mb-4">Paste code in both panels or load a sample</p>
            <div className="hidden md:flex items-center justify-center gap-3 text-xs text-gray-700">
              <span className="bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">AI-powered analysis</span>
              <span className="bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">Export HTML report</span>
              <span className="bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">Monaco Editor</span>
              <span className="bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">Auto language detect</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
