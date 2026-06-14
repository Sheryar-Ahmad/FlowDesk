/**
 * auth.api.ts - Authentication API Service
 * ------------------------------------------
 * All API calls related to authentication.
 * Connects frontend to backend auth endpoints.
 * 
 * Uses axios for HTTP requests with:
 * - Automatic JSON parsing
 * - Error handling
 * - Request/response interceptors
 */

import axios from "axios"
import { API_BASE_URL } from "./config"

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000, // 10 seconds timeout
})

// Types
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
  token_type: string
  user: {
    id: string
    email: string
    display_name: string
    plan: string
    email_verified: boolean
  }
  message?: string
}


/**
 * Register a new user account.
 * Sends name, email, password to backend.
 * Returns JWT token and user data.
 */
export const registerUser = async (
  data: RegisterData,
  signal?: AbortSignal,
): Promise<AuthResponse> => {
  const response = await api.post("/auth/register", data, { signal })
  return response.data
}


/**
 * Login with email and password.
 * Returns JWT token and user data.
 */
export const loginUser = async (data: LoginData): Promise<AuthResponse> => {
  const response = await api.post("/auth/login", data)
  return response.data
}


/**
 * Get current logged in user data.
 * Requires valid JWT token in header.
 */
export const getCurrentUser = async (token: string) => {
  const response = await api.get("/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  })
  return response.data
}


/**
 * Logout user.
 * Revokes refresh token on backend.
 */
export const logoutUser = async (token: string, refreshToken: string) => {
  const response = await api.post(
    "/auth/logout",
    { refresh_token: refreshToken },
    { headers: { Authorization: `Bearer ${token}` } }
  )
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
