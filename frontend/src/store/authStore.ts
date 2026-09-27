import { create } from "zustand"
import {
  getAuthErrorMessage,
  getCurrentUser,
  exchangeGoogleCode,
  registerUser,
  loginUser,
  logoutUser,
} from "../services/api/auth.api"
import type { RegisterData, LoginData } from "../services/api/auth.api"
import { isSessionRejected } from "../services/api/sessionErrors"
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
  isInitialized: boolean
  isLoading: boolean
  error: string | null


  register: (data: RegisterData, signal?: AbortSignal) => Promise<void>
  login: (data: LoginData) => Promise<void>
  completeGoogleLogin: (code: string) => Promise<void>
  initializeSession: () => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  clearError: () => void
  setLoading: (loading: boolean) => void
}

const storedSession = readAuthSession()
const hasStoredSession = Boolean(storedSession)

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isInitialized: !hasStoredSession,
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
        isInitialized: true,
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
        isInitialized: true,
        isLoading: false,
        error: null,
      })
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err, "Login failed. Please try again.")
      set({ error: message, isLoading: false })
      throw new Error(message, { cause: err })
    }
  },

  completeGoogleLogin: async (code: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await exchangeGoogleCode(code)
      writeAuthSession({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        user: response.user,
      })
      set({
        user: response.user,
        accessToken: response.access_token,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        error: null,
      })
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err, "Google sign-in failed. Please try again.")
      set({ error: message, isLoading: false })
      throw new Error(message, { cause: err })
    }
  },

  initializeSession: async () => {
    const session = readAuthSession()
    if (!session) {
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
      })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const response = await getCurrentUser()
      if (readAuthSession()?.user.id !== session.user.id) return
      updateSessionUser(response.user)
      const currentSession = readAuthSession()
      set({
        user: response.user,
        accessToken: currentSession?.accessToken ?? session.accessToken,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        error: null,
      })
    } catch (error) {
      const currentSession = readAuthSession()
      if (currentSession && currentSession.user.id !== session.user.id) return
      if (currentSession && !isSessionRejected(error)) {
        set({
          user: currentSession.user,
          accessToken: currentSession.accessToken,
          isAuthenticated: true,
          isInitialized: true,
          isLoading: false,
          error: getAuthErrorMessage(error, "Unable to refresh your session. Please try again."),
        })
        return
      }
      clearAuthSession()
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
        error: null,
      })
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
        isInitialized: true,
        isLoading: false,
        error: null,
      })
    }
  },

  refreshUser: async () => {
    const previousSession = readAuthSession()
    if (!previousSession) {
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isInitialized: true,
      })
      return
    }

    try {
      const response = await getCurrentUser()
      if (readAuthSession()?.user.id !== previousSession.user.id) return
      updateSessionUser(response.user)
      const session = readAuthSession()
      set({
        user: response.user,
        accessToken: session?.accessToken ?? null,
        isAuthenticated: true,
        isInitialized: true,
      })
    } catch (err) {
      const session = readAuthSession()
      if (!session || (session.user.id === previousSession.user.id && isSessionRejected(err))) {
        clearAuthSession()
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isInitialized: true,
        })
      }
      throw err
    }
  },

  clearError: () => set({ error: null }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}))
