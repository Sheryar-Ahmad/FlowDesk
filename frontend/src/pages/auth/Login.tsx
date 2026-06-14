// ─── Login.tsx ───────────────────────────────────────────────────────────────
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Code2, Eye, EyeOff, Loader2, ArrowRight, Terminal } from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import toast from "react-hot-toast"

const S = {
  bg:      "#080B14",
  surface: "#0D1117",
  border:  "rgba(255,255,255,0.07)",
  borderF: "rgba(99,102,241,0.5)",
  text:    "#E2E8F0",
  muted:   "#475569",
  faint:   "#1E293B",
  indigo:  "#6366F1",
  rose:    "#F43F5E",
  input:   "rgba(255,255,255,0.04)",
}

function Field({
  id, name, label, type, value, onChange, placeholder, disabled, end,
  autoComplete, inputMode, maxLength,
}: {
  id: string; name: string; label: string; type: string; value: string
  onChange: (v: string) => void; placeholder: string
  disabled?: boolean; end?: React.ReactNode
  autoComplete?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  maxLength?: number
}) {
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", fontSize: 12, fontWeight: 500, color: S.muted, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id} name={name}
          type={type} value={value} placeholder={placeholder}
          disabled={disabled} required maxLength={maxLength}
          autoComplete={autoComplete} inputMode={inputMode}
          autoCapitalize={type === "email" ? "none" : undefined}
          spellCheck={type === "email" ? false : undefined}
          onChange={e => onChange(e.target.value)}
          style={{
            width: "100%", background: S.input,
            border: `1px solid ${S.border}`, borderRadius: 10,
            padding: end ? "10px 44px 10px 14px" : "10px 14px",
            color: S.text, fontSize: 14, outline: "none",
            boxSizing: "border-box", transition: "border-color 0.15s",
            fontFamily: "inherit",
          }}
          onFocus={e => (e.target.style.borderColor = S.borderF)}
          onBlur={e => (e.target.style.borderColor = S.border)}
        />
        {end && (
          <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>
            {end}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const { login, isLoading, error, clearError, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true })
  }, [isAuthenticated, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    clearError()
    try {
      await login({ email: email.trim().toLowerCase(), password })
      toast.success("Welcome back!")
      navigate("/dashboard", { replace: true })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed")
    }
  }

  return (
    <div style={{
      minHeight: "100dvh", background: S.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Code2 size={18} color="#fff" />
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#F8FAFC", letterSpacing: -0.5 }}>FlowDesk</span>
          </Link>
          <p style={{ fontSize: 13, color: S.muted, marginTop: 8 }}>Welcome back. Sign in to your workspace.</p>
        </div>

        {/* Card */}
        <div style={{
          background: S.surface, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: "28px 28px 24px",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.02)",
        }}>

          {/* Error */}
          {error && (
            <div role="alert" aria-live="assertive" style={{
              background: "rgba(244,63,94,0.08)", border: `1px solid rgba(244,63,94,0.25)`,
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 13, color: S.rose, display: "flex", alignItems: "center", gap: 8,
            }}>
              <Terminal size={13} /> {error}
            </div>
          )}

          <form onSubmit={handleLogin} aria-busy={isLoading} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field id="login-email" name="email" label="Email address" type="email" value={email}
              onChange={value => { setEmail(value); if (error) clearError() }}
              placeholder="you@example.com" disabled={isLoading}
              autoComplete="email" inputMode="email" maxLength={255} />

            <Field id="login-password" name="password" label="Password" type={showPw ? "text" : "password"} value={password}
              onChange={value => { setPassword(value); if (error) clearError() }}
              placeholder="Your password" disabled={isLoading}
              autoComplete="current-password" maxLength={128}
              end={
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  disabled={isLoading}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  title={showPw ? "Hide password" : "Show password"}
                  style={{
                  background: "none", border: "none", color: S.muted, cursor: "pointer",
                  display: "flex", padding: 0, transition: "color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = S.text)}
                onMouseLeave={e => (e.currentTarget.style.color = S.muted)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <button type="submit" disabled={isLoading} style={{
              width: "100%", background: isLoading ? "rgba(99,102,241,0.6)" : S.indigo,
              border: "none", borderRadius: 10, padding: "11px",
              color: "#fff", fontSize: 14, fontWeight: 600, cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "background 0.15s, transform 0.1s", marginTop: 4,
              fontFamily: "inherit",
            }}
            onMouseEnter={e => { if (!isLoading) (e.currentTarget.style.background = "#4F46E5") }}
            onMouseLeave={e => { if (!isLoading) (e.currentTarget.style.background = S.indigo) }}
            >
              {isLoading
                ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Signing in…</>
                : <>Sign in <ArrowRight size={14} /></>
              }
            </button>
          </form>

          <div style={{
            borderTop: `1px solid ${S.border}`, marginTop: 20, paddingTop: 18,
            textAlign: "center", fontSize: 13, color: S.muted,
          }}>
            No account yet?{" "}
            <Link to="/register" style={{ color: S.indigo, textDecoration: "none", fontWeight: 600 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#818CF8")}
              onMouseLeave={e => (e.currentTarget.style.color = S.indigo)}
            >Create one free →</Link>
          </div>
        </div>

        {/* Bottom note */}
        <p style={{ textAlign: "center", fontSize: 11, color: S.faint, marginTop: 20 }}>
          By signing in you agree to our{" "}
          <Link to="/?legal=terms" style={{ color: "#475569", textDecoration: "none" }}>Terms</Link> and{" "}
          <Link to="/?legal=privacy" style={{ color: "#475569", textDecoration: "none" }}>Privacy Policy</Link>
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
