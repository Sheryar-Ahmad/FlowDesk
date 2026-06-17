export interface SessionUser {
  id: string
  email: string
  display_name: string
  plan: string
  email_verified: boolean
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  user: SessionUser
}

const SESSION_KEY = "flowdesk.auth.session"

export function readAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Partial<AuthSession>
    if (
      typeof session.accessToken !== "string"
      || typeof session.refreshToken !== "string"
      || !session.user
      || typeof session.user.id !== "string"
    ) {
      clearAuthSession()
      return null
    }
    return session as AuthSession
  } catch {
    clearAuthSession()
    return null
  }
}

export function writeAuthSession(session: AuthSession): void {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function updateSessionUser(user: SessionUser): void {
  const session = readAuthSession()
  if (session) writeAuthSession({ ...session, user })
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(SESSION_KEY)
}
