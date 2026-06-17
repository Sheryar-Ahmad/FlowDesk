

import axios from "axios"
import api from "./client"
import type { SessionUser } from "./authSession"


export interface RegisterData {
  display_name: string
  email: string
  password: string
}

export interface LoginData {
  email: string
  password: string
}

export interface AuthResponse {
  success: boolean
  access_token: string
  refresh_token: string
  token_type: string
  user: SessionUser
  message?: string
}



export const registerUser = async (
  data: RegisterData,
  signal?: AbortSignal,
): Promise<AuthResponse> => {
  const response = await api.post("/auth/register", data, { signal })
  return response.data
}



export const loginUser = async (data: LoginData): Promise<AuthResponse> => {
  const response = await api.post("/auth/login", data)
  return response.data
}



export const getCurrentUser = async () => {
  const response = await api.get("/auth/me")
  return response.data
}



export const logoutUser = async (refreshToken: string) => {
  const response = await api.post("/auth/logout", { refresh_token: refreshToken })
  return response.data
}

export const getAuthErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback
  }

  const detail = error.response?.data?.detail
  if (typeof detail === "string" && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map(item => typeof item?.msg === "string" ? item.msg : "")
      .filter(Boolean)
    if (messages.length) return messages.join(". ")
  }
  if (error.code === "ECONNABORTED") return "The request timed out. Please try again."
  if (!error.response) return "Cannot reach the FlowDesk server. Please try again shortly."
  return fallback
}
