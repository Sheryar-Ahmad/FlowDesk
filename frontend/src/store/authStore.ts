import { create } from "zustand"
import {
  getAuthErrorMessage,
  getCurrentUser,
  registerUser,
  loginUser,
  logoutUser,
} from "../services/api/auth.api"
import type { RegisterData, LoginData } from "../services/api/auth.api"
import {
  clearAuthSession,
  readAuthSession,
  updateSessionUser,
  writeAuthSession,
  type SessionUser,
} from "../services/api/authSession"

type User = SessionUser

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null


  register: (data: RegisterData, signal?: AbortSignal) => Promise<void>
  login: (data: LoginData) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  clearError: () => void
  setLoading: (loading: boolean) => void
}

const storedSession = readAuthSession()

export const useAuthStore = create<AuthState>((set) => ({
  user: storedSession?.user ?? null,
  accessToken: storedSession?.accessToken ?? null,
  isAuthenticated: Boolean(storedSession),
  isLoading: false,
  error: null,

  register: async (data: RegisterData, signal?: AbortSignal) => {
    set({ isLoading: true, error: null })
    try {
      const response = await registerUser(data, signal)
      writeAuthSession({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        user: response.user,
      })
      set({
        user: response.user,
        accessToken: response.access_token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (err: unknown) {
      if (signal?.aborted) {
        set({ isLoading: false })
        throw err
      }
      const message = getAuthErrorMessage(err, "Registration failed. Please try again.")
      set({ error: message, isLoading: false })
      throw new Error(message, { cause: err })
    }
  },

  login: async (data: LoginData) => {
    set({ isLoading: true, error: null })
    try {
      const response = await loginUser(data)
      writeAuthSession({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        user: response.user,
      })
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
    const session = readAuthSession()
    set({ isLoading: true })
    try {
      if (session?.refreshToken) await logoutUser(session.refreshToken)
    } catch {
      // The browser session must still be cleared if token revocation fails.
    } finally {
      clearAuthSession()
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
    if (!readAuthSession()) return

    const response = await getCurrentUser()
    updateSessionUser(response.user)
    const session = readAuthSession()
    set({
      user: response.user,
      accessToken: session?.accessToken ?? null,
      isAuthenticated: true,
    })
  },

  clearError: () => set({ error: null }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}))
