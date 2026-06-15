import { create } from "zustand"
import {
  getAuthErrorMessage,
  getCurrentUser,
  registerUser,
  loginUser,
  logoutUser,
} from "../services/api/auth.api"
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


  register: (data: RegisterData) => Promise<void>
  login: (data: LoginData) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
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
      const message = getAuthErrorMessage(err, "Registration failed. Please try again.")
      set({ error: message, isLoading: false })
      throw new Error(message, { cause: err })
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
      const message = getAuthErrorMessage(err, "Login failed. Please try again.")
      set({ error: message, isLoading: false })
      throw new Error(message, { cause: err })
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

  refreshUser: async () => {
    const { accessToken } = get()
    if (!accessToken) return

    const response = await getCurrentUser(accessToken)
    set({
      user: response.user,
      isAuthenticated: true,
    })
  },

  clearError: () => set({ error: null }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}))
