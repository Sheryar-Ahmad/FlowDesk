/**
 * authStore.ts - Authentication State Management
 * ------------------------------------------------
 * Zustand store that manages user authentication state.
 * 
 * Why Zustand over localStorage?
 * - localStorage can be read by XSS attacks
 * - Zustand keeps state in memory only
 * - Much more secure
 * - Automatically clears on page refresh (forces re-auth)
 * 
 * Token storage strategy:
 * - Access token: memory only (Zustand state)
 * - User data: memory only (Zustand state)
 * - On refresh: check /auth/me endpoint to restore session
 */

import { create } from "zustand"
import { registerUser, loginUser, logoutUser } from "../services/api/auth.api"
import type { RegisterData, LoginData } from "../services/api/auth.api"

interface User {
  id: string
  email: string
  display_name: string
  plan: string
  email_verified: boolean
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  register: (data: RegisterData) => Promise<void>
  login: (data: LoginData) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  register: async (data: RegisterData) => {
    set({ isLoading: true, error: null })
    try {
      const response = await registerUser(data)
      set({
        user: response.user,
        accessToken: response.access_token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Registration failed. Please try again."
      set({ error: message, isLoading: false })
    }
  },

  login: async (data: LoginData) => {
    set({ isLoading: true, error: null })
    try {
      const response = await loginUser(data)
      set({
        user: response.user,
        accessToken: response.access_token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Login failed. Please try again."
      set({ error: message, isLoading: false })
    }
  },

  logout: async () => {
    const { accessToken } = get()
    set({ isLoading: true })
    try {
      if (accessToken) {
        await logoutUser(accessToken, "")
      }
    } catch {
      // Even if logout API fails, clear local state
    } finally {
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      })
    }
  },

  clearError: () => set({ error: null }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}))
