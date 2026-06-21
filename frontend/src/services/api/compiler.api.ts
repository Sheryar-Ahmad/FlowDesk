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
}

export interface CompilerFilePayload {
  title: string
  language: CompilerLanguage
  code: string
  stdin?: string
}

export interface CompilerFileQuery {
  page?: number
  page_size?: number
  language?: CompilerLanguage
  search?: string
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

export const runCompilerCode = async (data: {
  language: CompilerLanguage
  code: string
  stdin?: string
}) => (
  await api.post<{ success: boolean; result: CompilerRunResult }>("/compiler/run", data)
).data

export const runCompilerFile = async (id: string) => (
  await api.post<{ success: boolean; result: CompilerRunResult }>(`/compiler/${id}/run`)
).data
