
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  Code2, Eye, EyeOff, Loader2,
  CheckCircle, XCircle, Check, X,
} from "lucide-react"
import axios from "axios"
import toast from "react-hot-toast"
import { useAuthStore } from "../../store/authStore"
import { googleAuthUrl } from "../../services/api/auth.api"
import { GoogleAuthButton } from "../../components/GoogleAuthButton"

const S = {
  bg:      "#080B14",
  surface: "#0D1117",
  border:  "rgba(255,255,255,0.07)",
  borderF: "rgba(99,102,241,0.5)",
  text:    "#E2E8F0",
  muted:   "#475569",
  faint:   "#1E293B",
  indigo:  "#6366F1",
  emerald: "#10B981",
  amber:   "#F59E0B",
  rose:    "#F43F5E",
  input:   "rgba(255,255,255,0.04)",
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_STRENGTH_SEGMENTS = Array.from({ length: 5 }, (_, segment) => segment)

function Field({
  id, name, label, type, value, onChange, placeholder, disabled, end, hint,
  autoComplete, inputMode, maxLength,
}: Readonly<{
  id: string; name: string; label: string; type: string; value: string
  onChange: (v: string) => void; placeholder: string
  disabled?: boolean; end?: ReactNode; hint?: ReactNode
  autoComplete?: string
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"]
  maxLength?: number
}>) {
  const hintId = hint ? `${id}-hint` : undefined

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
          aria-describedby={hintId}
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
      {hint && <div id={hintId} aria-live="polite">{hint}</div>}
    </div>
  )
}

const PW_RULES = [
  { label: "8-128 characters", test: (p: string) => p.length >= 8 && p.length <= 128 },
  { label: "Uppercase",        test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase",        test: (p: string) => /[a-z]/.test(p) },
  { label: "Number",           test: (p: string) => /\d/.test(p) },
  { label: "Special char",     test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
]

function strengthColor(n: number) {
  if (n === 5) return S.emerald
  if (n >= 3)  return S.amber
  if (n > 0)   return "#F97316"
  return S.rose
}
function strengthLabel(n: number) {
  if (n === 5) return "Strong"
  if (n >= 3)  return "Medium"
  if (n > 0)   return "Weak"
  return "Too weak"
}

export default function Register() {
  const navigate = useNavigate()
  const { isAuthenticated, register } = useAuthStore()
  const requestRef = useRef<AbortController | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const [name,            setName]            = useState("")
  const [email,           setEmail]           = useState("")
  const [password,        setPassword]        = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPw,          setShowPw]          = useState(false)
  const [showCPw,         setShowCPw]         = useState(false)
  const [pwTouched,       setPwTouched]       = useState(false)

  const passwordChecks = PW_RULES.map(rule => ({ ...rule, passed: rule.test(password) }))
  const validCnt = passwordChecks.filter(rule => rule.passed).length
  const pwMatch  = password === confirmPassword && confirmPassword.length > 0

  const validate = () => {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const validationError = [
      trimmedName.length < 2 && "Name must be at least 2 characters",
      trimmedName.length > 100 && "Name must not exceed 100 characters",
      !EMAIL_PATTERN.test(trimmedEmail) && "Enter a valid email address",
      trimmedEmail.length > 255 && "Email must not exceed 255 characters",
      validCnt < 5 && "Password does not meet all requirements",
      password !== confirmPassword && "Passwords do not match",
    ].find((message): message is string => Boolean(message))
    if (validationError) {
      setError(validationError)
      return false
    }
    return true
  }

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (!success) return
    const timer = globalThis.setTimeout(() => navigate("/dashboard", { replace: true }), 800)
    return () => globalThis.clearTimeout(timer)
  }, [navigate, success])

  useEffect(() => () => requestRef.current?.abort(), [])

  const handleRegister = async (e: Readonly<{ preventDefault: () => void }>) => {
    e.preventDefault()
    if (isLoading) return
    setError("")
    if (!validate()) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setIsLoading(true)

    try {
      await register({
        email: email.toLowerCase().trim(),
        password,
        display_name: name.trim(),
      }, controller.signal)

      if (!controller.signal.aborted) {
        setSuccess(true)
        toast.success("Account created! Redirecting...")
      }
    } catch (requestError: unknown) {
      if (axios.isCancel(requestError) || controller.signal.aborted) return
      const message = requestError instanceof Error
        ? requestError.message
        : "Registration failed. Please try again."
      setError(message)
      toast.error(message)
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }

  const handleGoogleRegister = () => {
    if (isLoading) return
    setError("")
    window.location.assign(googleAuthUrl("/dashboard"))
  }

  const updateField = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    if (error) setError("")
  }


  if (success) return (
    <div style={{
      minHeight: "100dvh", background: S.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div role="status" aria-live="polite" style={{
        background: S.surface, border: `1px solid rgba(16,185,129,0.25)`,
        borderRadius: 16, padding: "40px 32px", textAlign: "center",
        maxWidth: 380, width: "100%",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(16,185,129,0.12)", border: `1px solid rgba(16,185,129,0.3)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
        }}>
          <CheckCircle size={28} color={S.emerald} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#F8FAFC", margin: "0 0 8px" }}>Account created!</h2>
        <p style={{ fontSize: 13, color: S.muted, margin: 0 }}>Opening your workspace...</p>
      </div>
    </div>
  )


  return (
    <div style={{
      minHeight: "100dvh", background: S.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>


        <div style={{ textAlign: "center", marginBottom: 28 }}>
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
          <p style={{ fontSize: 13, color: S.muted, marginTop: 8 }}>Create your free developer workspace.</p>
        </div>


        <div className="auth-card" style={{
          background: S.surface, border: `1px solid ${S.border}`,
          borderRadius: 16, padding: "28px 28px 24px",
        }}>


          {error && (
            <div role="alert" aria-live="assertive" style={{
              background: "rgba(244,63,94,0.08)", border: `1px solid rgba(244,63,94,0.25)`,
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 13, color: S.rose, display: "flex", alignItems: "center", gap: 8,
            }}>
              <XCircle size={13} /> {error}
            </div>
          )}

          <GoogleAuthButton disabled={isLoading} onClick={handleGoogleRegister} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ height: 1, flex: 1, background: S.border }} />
            <span style={{ fontSize: 11, color: S.muted }}>or create with email</span>
            <div style={{ height: 1, flex: 1, background: S.border }} />
          </div>

          <form onSubmit={handleRegister} aria-busy={isLoading} style={{ display: "flex", flexDirection: "column", gap: 14 }}>


            <div className="auth-identity-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field id="register-name" name="name" label="Full name" type="text" value={name}
                onChange={updateField(setName)} placeholder="Sheryar Ahmad" disabled={isLoading}
                autoComplete="name" maxLength={100} />
              <Field id="register-email" name="email" label="Email" type="email" value={email}
                onChange={updateField(setEmail)} placeholder="you@example.com" disabled={isLoading}
                autoComplete="email" inputMode="email" maxLength={255} />
            </div>


            <Field id="register-password" name="password" label="Password" type={showPw ? "text" : "password"} value={password}
              disabled={isLoading} placeholder="Min. 8 characters"
              autoComplete="new-password" maxLength={128}
              onChange={v => { updateField(setPassword)(v); if (!pwTouched) setPwTouched(true) }}
              end={
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  disabled={isLoading}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  title={showPw ? "Hide password" : "Show password"}
                  style={{
                  background: "none", border: "none", color: S.muted, cursor: "pointer",
                  display: "flex", padding: 0,
                }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              hint={pwTouched && password.length > 0 ? (
                <div style={{ marginTop: 10 }}>

                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    {PASSWORD_STRENGTH_SEGMENTS.map(segment => (
                      <div key={segment} style={{
                        flex: 1, height: 3, borderRadius: 99,
                        background: segment < validCnt ? strengthColor(validCnt) : "rgba(255,255,255,0.08)",
                        transition: "background 0.3s",
                      }} />
                    ))}
                    <span style={{ fontSize: 10, color: strengthColor(validCnt), marginLeft: 4, whiteSpace: "nowrap", fontWeight: 600 }}>
                      {strengthLabel(validCnt)}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
                    {passwordChecks.map(rule => (
                      <div key={rule.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{
                          width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                          background: rule.passed ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${rule.passed ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.2s",
                        }}>
                          {rule.passed
                            ? <Check size={8} color={S.emerald} />
                            : <X size={7} color={S.faint} />
                          }
                        </div>
                        <span style={{ fontSize: 11, color: rule.passed ? S.emerald : S.muted }}>
                          {rule.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : undefined}
            />


            <Field id="register-confirm-password" name="confirmPassword" label="Confirm password" type={showCPw ? "text" : "password"} value={confirmPassword}
              disabled={isLoading} placeholder="Repeat your password"
              onChange={updateField(setConfirmPassword)}
              autoComplete="new-password" maxLength={128}
              end={
                <button
                  type="button"
                  onClick={() => setShowCPw(v => !v)}
                  disabled={isLoading}
                  aria-label={showCPw ? "Hide confirmation password" : "Show confirmation password"}
                  title={showCPw ? "Hide confirmation password" : "Show confirmation password"}
                  style={{
                  background: "none", border: "none", color: S.muted, cursor: "pointer",
                  display: "flex", padding: 0,
                }}>
                  {showCPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              hint={confirmPassword.length > 0 ? (
                <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}>
                  {pwMatch
                    ? <><Check size={11} color={S.emerald} /><span style={{ fontSize: 11, color: S.emerald }}>Passwords match</span></>
                    : <><X size={11} color={S.rose} /><span style={{ fontSize: 11, color: S.rose }}>Passwords do not match</span></>
                  }
                </div>
              ) : undefined}
            />


            <button type="submit" disabled={isLoading} style={{
              width: "100%",
              background: isLoading ? "rgba(99,102,241,0.5)" : S.indigo,
              border: "none", borderRadius: 10, padding: "11px",
              color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              marginTop: 4, fontFamily: "inherit", transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!isLoading) (e.currentTarget.style.background = "#4F46E5") }}
            onMouseLeave={e => { if (!isLoading) (e.currentTarget.style.background = S.indigo) }}
            >
              {isLoading
                ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Creating account…</>
                : "Create free account"
              }
            </button>
          </form>

          <div style={{
            borderTop: `1px solid ${S.border}`, marginTop: 20, paddingTop: 18,
            textAlign: "center", fontSize: 13, color: S.muted,
          }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: S.indigo, textDecoration: "none", fontWeight: 600 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#818CF8")}
              onMouseLeave={e => (e.currentTarget.style.color = S.indigo)}
            >Sign in</Link>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: S.faint, marginTop: 20 }}>
          By creating an account you agree to our{" "}
          <Link to="/?legal=terms" style={{ color: "#475569", textDecoration: "none" }}>Terms</Link> and{" "}
          <Link to="/?legal=privacy" style={{ color: "#475569", textDecoration: "none" }}>Privacy Policy</Link>
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 520px) {
          .auth-identity-grid { grid-template-columns: 1fr !important; }
          .auth-card { padding: 22px 18px 20px !important; }
        }
      `}</style>
    </div>
  )
}
