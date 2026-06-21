

import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios"

import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
  type AuthSession,
} from "./authSession"
import { API_BASE_URL } from "./config"

interface RetryableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean
}

interface RefreshResponse {
  access_token: string
  refresh_token: string
  user: AuthSession["user"]
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
})

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
})

let refreshRequest: Promise<AuthSession> | null = null

async function refreshSession(): Promise<AuthSession> {
  const current = readAuthSession()
  if (!current?.refreshToken) throw new Error("No refresh token is available.")

  const { data } = await refreshClient.post<RefreshResponse>("/auth/refresh", {
    refresh_token: current.refreshToken,
  })
  const session: AuthSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
  }
  writeAuthSession(session)
  return session
}

apiClient.interceptors.request.use((config) => {
  const token = readAuthSession()?.accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const request = error.config as RetryableRequest | undefined
    const url = request?.url ?? ""
    const canRefresh = (
      error.response?.status === 401
      && request
      && !request._retry
      && !url.includes("/auth/login")
      && !url.includes("/auth/register")
      && !url.includes("/auth/refresh")
      && !url.includes("/auth/google/exchange")
    )

    if (!canRefresh) return Promise.reject(error)

    request._retry = true
    try {
      refreshRequest ??= refreshSession().finally(() => {
        refreshRequest = null
      })
      const session = await refreshRequest
      request.headers.Authorization = `Bearer ${session.accessToken}`
      return apiClient(request)
    } catch (refreshError) {
      clearAuthSession()
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login?reason=session-expired")
      }
      return Promise.reject(refreshError)
    }
  },
)

export default apiClient
