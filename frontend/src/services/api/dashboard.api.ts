import axios from "axios"

import { useAuthStore } from "../../store/authStore"
import { API_BASE_URL } from "./config"


const api = axios.create({ baseURL: API_BASE_URL, timeout: 10000 })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

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
