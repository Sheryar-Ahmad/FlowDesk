import { useState } from "react"
import { Link } from "react-router-dom"
import { Cookie, ShieldCheck, X } from "lucide-react"

const STORAGE_KEY = "flowdesk_cookie_consent_v2"

type ConsentView = "summary" | "preferences"

function saveCookieConsent() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        acceptedAt: new Date().toISOString(),
        categories: {
          essential: true,
          analytics: false,
          marketing: false,
        },
        version: 2,
      }),
    )
  } catch {
    // Storage can be blocked in private or hardened browsers; the app should still remain usable.
  }
}

function hasCookieConsent() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

function ConsentButton({
  children,
  onClick,
  variant = "secondary",
}: Readonly<{
  children: string
  onClick: () => void
  variant?: "primary" | "secondary"
}>) {
  const isPrimary = variant === "primary"
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: isPrimary ? 0 : "1px solid rgba(148,163,184,0.18)",
        borderRadius: 10,
        background: isPrimary ? "#6366F1" : "rgba(255,255,255,0.045)",
        color: isPrimary ? "#fff" : "#CBD5E1",
        padding: "9px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  )
}

function CategoryRow({
  title,
  description,
  status,
}: Readonly<{
  title: string
  description: string
  status: string
}>) {
  return (
    <div style={{
      border: "1px solid rgba(148,163,184,0.14)",
      borderRadius: 12,
      padding: 12,
      background: "rgba(255,255,255,0.025)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
        <strong style={{ color: "#F8FAFC", fontSize: 13 }}>{title}</strong>
        <span style={{
          color: status === "Always on" ? "#34D399" : "#94A3B8",
          fontSize: 11,
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}>
          {status}
        </span>
      </div>
      <p style={{ margin: 0, color: "#94A3B8", fontSize: 12, lineHeight: 1.55 }}>
        {description}
      </p>
    </div>
  )
}

export function CookieNotice() {
  const [visible, setVisible] = useState(() => !hasCookieConsent())
  const [view, setView] = useState<ConsentView>("summary")

  const saveAndClose = () => {
    saveCookieConsent()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <aside
      role="dialog"
      aria-label="Cookie preferences"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1200,
        width: "min(calc(100vw - 32px), 460px)",
        background: "rgba(15,19,32,0.97)",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 18,
        boxShadow: "0 22px 70px rgba(0,0,0,0.48)",
        backdropFilter: "blur(16px)",
        color: "#E2E8F0",
        padding: 16,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: "rgba(99,102,241,0.16)",
            border: "1px solid rgba(99,102,241,0.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            {view === "summary" ? <Cookie size={19} color="#A5B4FC" /> : <ShieldCheck size={19} color="#34D399" />}
          </div>
          <div>
            <p style={{ margin: "0 0 2px", color: "#818CF8", fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Privacy preferences
            </p>
            <h2 style={{ margin: 0, color: "#F8FAFC", fontSize: 15, fontWeight: 850 }}>
              {view === "summary" ? "Essential cookies only" : "Cookie categories"}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={saveAndClose}
          aria-label="Close cookie preferences and keep essential cookies"
          title="Close and keep essential cookies"
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.16)",
            background: "rgba(255,255,255,0.04)",
            color: "#94A3B8",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      {view === "summary" ? (
        <>
          <p style={{ margin: "0 0 12px", color: "#94A3B8", fontSize: 13, lineHeight: 1.6 }}>
            FlowDesk uses essential cookies and browser storage for sign-in, Google OAuth security,
            preferences, and workspace features. We are not using analytics or advertising cookies.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ConsentButton variant="primary" onClick={saveAndClose}>Accept essential</ConsentButton>
            <ConsentButton onClick={() => setView("preferences")}>Manage preferences</ConsentButton>
            <Link
              to="/legal/cookies"
              style={{
                color: "#A5B4FC",
                fontSize: 13,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Cookie Notice
            </Link>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "grid", gap: 8, margin: "0 0 12px" }}>
            <CategoryRow
              title="Essential"
              status="Always on"
              description="Required for authentication, security, Google OAuth state checks, saved preferences, and core workspace features."
            />
            <CategoryRow
              title="Analytics"
              status="Not used"
              description="FlowDesk is not using analytics cookies right now. If this changes, the consent version will be updated."
            />
            <CategoryRow
              title="Marketing"
              status="Not used"
              description="FlowDesk is not using advertising, tracking, or remarketing cookies."
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ConsentButton variant="primary" onClick={saveAndClose}>Save preferences</ConsentButton>
            <ConsentButton onClick={() => setView("summary")}>Back</ConsentButton>
            <Link
              to="/legal/cookies"
              style={{
                color: "#A5B4FC",
                fontSize: 13,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Full policy
            </Link>
          </div>
        </>
      )}
    </aside>
  )
}
