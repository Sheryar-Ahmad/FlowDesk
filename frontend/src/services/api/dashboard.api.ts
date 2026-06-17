import api from "./client"

export interface DashboardStats {
  focus_minutes_today: number
  tasks_completed_today: number
  snippets_saved_today: number
  ai_sessions_today: number
  snippets_total: number
  notes_total: number
  open_tasks: number
}

interface DashboardStatsResponse {
  success: boolean
  day: string
  stats: DashboardStats
}

export const getDashboardStats = async (day: string) => (
  await api.get<DashboardStatsResponse>("/dashboard/stats", { params: { day } })
).data
