import api from "./client"

export type CompilerLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "java"
  | "cpp"
  | "c"
  | "go"
  | "rust"
  | "csharp"
  | "php"
  | "ruby"
  | "sql"
  | "bash"
  | "kotlin"
  | "swift"
  | "dart"
  | "scala"
  | "r"
  | "perl"
  | "lua"
  | "haskell"
  | "elixir"
  | "erlang"
  | "clojure"
  | "fsharp"
  | "powershell"
  | "groovy"
  | "julia"
  | "matlab"
  | "objectivec"
  | "vb"
  | "html"
  | "css"
  | "markdown"
  | "yaml"
  | "json"
  | "xml"

export interface CompilerFile {
  id: string
  user_id: string
  title: string
  language: CompilerLanguage
  code: string
  stdin: string
  output: string
  is_pinned: boolean
  run_count: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface CompilerRuntime {
  language: CompilerLanguage
  label: string
  executable: boolean
  reason?: string | null
  queue?: {
    global_slots_free: number
    global_slots_total: number
    active_user_locks: number
  } | null
}

export interface CompilerRunResult {
  status: "success" | "error" | "timeout" | "rejected" | "unsupported" | "disabled"
  stdout: string
  stderr: string
  output: string
  exit_code: number | null
  duration_ms: number
  timed_out: boolean
  truncated: boolean
  language: CompilerLanguage
  message?: string | null
  memory_kb?: number | null
  cpu_time_ms?: number | null
  exit_signal?: number | null
  warnings?: string[]
  cached?: boolean
}

export interface CompilerFilePayload {
  title: string
  language: CompilerLanguage
  code: string
  stdin?: string
}

export type CompilerRunPayload = {
  language: CompilerLanguage
  code: string
  stdin?: string
  args?: string[]
  use_cache?: boolean
}

export type CompilerSavedRunPayload = Partial<CompilerFilePayload> & {
  args?: string[]
  use_cache?: boolean
}

export interface CompilerFileQuery {
  page?: number
  page_size?: number
  language?: CompilerLanguage
  search?: string
}

export interface CompilerRunEvent {
  id: string
  compiler_file_id: string | null
  language: CompilerLanguage | string
  status: CompilerRunResult["status"] | string
  duration_ms: number
  output_size: number
  created_at: string
  cached?: boolean
}

export interface CompilerRunStats {
  total_runs: number
  successful_runs: number
  failed_runs: number
  timed_out_runs: number
  avg_duration_ms: number
  max_duration_ms: number
}

export interface CompilerTestCase {
  stdin: string
  expected: string
}

export interface CompilerTestCaseItemResult {
  index: number
  passed: boolean
  expected: string
  actual: string
  stderr: string
  duration_ms: number
}

export interface CompilerTestCaseResult {
  total: number
  passed: number
  failed: number
  pass_rate: number
  results: CompilerTestCaseItemResult[]
  complexity: {
    line_count: number
    estimated_cyclomatic_complexity: number
    function_count: number
  }
}

export interface CompilerListResponse {
  success: boolean
  files: CompilerFile[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export const getCompilerRuntimes = async () => (
  await api.get<{ success: boolean; runtimes: CompilerRuntime[] }>("/compiler/runtimes")
).data

export const getCompilerFiles = async (params?: CompilerFileQuery) => (
  await api.get<CompilerListResponse>("/compiler/", { params })
).data

export const createCompilerFile = async (data: CompilerFilePayload) => (
  await api.post<{ success: boolean; file: CompilerFile }>("/compiler/", data)
).data

export const updateCompilerFile = async (id: string, data: Partial<CompilerFilePayload> & { output?: string; is_pinned?: boolean }) => (
  await api.put<{ success: boolean; file: CompilerFile }>(`/compiler/${id}`, data)
).data

export const deleteCompilerFile = async (id: string) => (
  await api.delete<{ success: boolean; message: string }>(`/compiler/${id}`)
).data

export const duplicateCompilerFile = async (id: string) => (
  await api.post<{ success: boolean; file: CompilerFile }>(`/compiler/files/${id}/duplicate`)
).data

export const runCompilerCode = async (data: CompilerRunPayload) => (
  await api.post<{ success: boolean; result: CompilerRunResult }>("/compiler/run", data)
).data

export const runCompilerFile = async (id: string, data?: CompilerSavedRunPayload) => (
  await api.post<{ success: boolean; result: CompilerRunResult }>(`/compiler/${id}/run`, data ?? {})
).data

export const getRunHistory = async (params?: { limit?: number }) => (
  await api.get<{ success: boolean; events: CompilerRunEvent[] }>("/compiler/runs/history", { params })
).data

export const getRunStats = async () => (
  await api.get<{ success: boolean; stats: CompilerRunStats }>("/compiler/runs/stats")
).data.stats

export const runTestCases = async (data: {
  language: CompilerLanguage
  code: string
  test_cases: CompilerTestCase[]
}) => (
  await api.post<{ success: boolean; result: CompilerTestCaseResult }>("/compiler/test-cases", data)
).data.result
