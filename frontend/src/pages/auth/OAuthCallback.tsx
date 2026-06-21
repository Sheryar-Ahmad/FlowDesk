import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Code2, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import { useAuthStore } from "../../store/authStore"

const S = {
  bg: "#080B14",
  surface: "#0D1117",
  border: "rgba(255,255,255,0.07)",
  text: "#E2E8F0",
  muted: "#64748B",
  indigo: "#6366F1",
  rose: "#F43F5E",
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard"
  return value
}

export default function OAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const completeGoogleLogin = useAuthStore(state => state.completeGoogleLogin)
  const hasRun = useRef(false)
  const callbackCode = searchParams.get("code")
  const initialError = searchParams.get("oauth_error")
    || (!callbackCode ? "Google sign-in did not return a valid code." : "")
  const [message, setMessage] = useState(initialError || "Finishing Google sign-in...")
  const [failed, setFailed] = useState(Boolean(initialError))

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const nextPath = safeNextPath(searchParams.get("next"))

    if (initialError) {
      toast.error(initialError)
      return
    }

    completeGoogleLogin(callbackCode ?? "")
      .then(() => {
        toast.success("Signed in with Google")
        navigate(nextPath, { replace: true })
      })
      .catch((error: unknown) => {
        const fallback = "Google sign-in failed. Please try again."
        const nextMessage = error instanceof Error ? error.message : fallback
        setFailed(true)
        setMessage(nextMessage)
        toast.error(nextMessage)
      })
  }, [callbackCode, completeGoogleLogin, initialError, navigate, searchParams])

  return (
    <div style={{
      minHeight: "100dvh",
      background: S.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 380,
        background: S.surface,
        border: `1px solid ${failed ? "rgba(244,63,94,0.25)" : S.border}`,
        borderRadius: 16,
        padding: "32px 28px",
        textAlign: "center",
      }}>
        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 24 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Code2 size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#F8FAFC", letterSpacing: -0.5 }}>FlowDesk</span>
        </Link>

        {!failed && (
          <Loader2 size={28} color={S.indigo} style={{ animation: "spin 1s linear infinite", marginBottom: 14 }} />
        )}
        <h1 style={{ margin: "0 0 8px", color: failed ? S.rose : S.text, fontSize: 20 }}>
          {failed ? "Sign-in needs attention" : "Almost there"}
        </h1>
        <p style={{ margin: 0, color: S.muted, fontSize: 14, lineHeight: 1.6 }}>{message}</p>

        {failed && (
          <Link
            to="/login"
            style={{
              display: "inline-flex",
              marginTop: 22,
              padding: "10px 16px",
              borderRadius: 10,
              background: S.indigo,
              color: "#fff",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Back to sign in
          </Link>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
