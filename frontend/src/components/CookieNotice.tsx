import { useState } from "react"
import { Link } from "react-router-dom"
import { Cookie, X } from "lucide-react"

const STORAGE_KEY = "flowdesk_cookie_notice_v1"

function saveCookieNoticeChoice() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        acceptedAt: new Date().toISOString(),
        categories: ["essential"],
        version: 1,
      }),
    )
  } catch {
    // If storage is unavailable, closing the banner should still work for this session.
  }
}

function hasCookieNoticeChoice() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

export function CookieNotice() {
  const [visible, setVisible] = useState(() => !hasCookieNoticeChoice())

  const close = () => {
    saveCookieNoticeChoice()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <aside
      role="dialog"
      aria-label="Cookie notice"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1200,
        width: "min(calc(100vw - 32px), 430px)",
        background: "rgba(15,19,32,0.96)",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 18,
        boxShadow: "0 22px 70px rgba(0,0,0,0.48)",
        backdropFilter: "blur(16px)",
        color: "#E2E8F0",
        padding: 16,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
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
          <Cookie size={19} color="#A5B4FC" />
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 5,
          }}>
            <h2 style={{ margin: 0, color: "#F8FAFC", fontSize: 15, fontWeight: 800 }}>
              Essential cookies
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close cookie notice"
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
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

          <p style={{ margin: "0 0 12px", color: "#94A3B8", fontSize: 13, lineHeight: 1.6 }}>
            FlowDesk uses essential cookies and browser storage for sign-in, Google OAuth security,
            preferences, and workspace features. We are not using advertising cookies.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={close}
              style={{
                border: 0,
                borderRadius: 10,
                background: "#6366F1",
                color: "#fff",
                padding: "9px 14px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Got it
            </button>
            <Link
              to="/legal/cookies"
              style={{
                color: "#A5B4FC",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Read Cookie Notice
            </Link>
          </div>
        </div>
      </div>
    </aside>
  )
}
