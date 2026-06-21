type GoogleAuthButtonProps = Readonly<{
  disabled?: boolean
  onClick: () => void
}>

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.26-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.59-2.59C13.46.88 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

export function GoogleAuthButton({ disabled, onClick }: GoogleAuthButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        border: "1px solid rgba(148,163,184,0.22)",
        borderRadius: 12,
        padding: "11px 14px",
        background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
        color: "#E2E8F0",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "inherit",
        marginBottom: 14,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        opacity: disabled ? 0.65 : 1,
        transition: "border-color 0.15s, background 0.15s, transform 0.12s",
      }}
      onMouseEnter={event => {
        if (disabled) return
        event.currentTarget.style.borderColor = "rgba(148,163,184,0.42)"
        event.currentTarget.style.background = "linear-gradient(180deg, rgba(255,255,255,0.105), rgba(255,255,255,0.05))"
      }}
      onMouseLeave={event => {
        if (disabled) return
        event.currentTarget.style.borderColor = "rgba(148,163,184,0.22)"
        event.currentTarget.style.background = "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))"
      }}
      onMouseDown={event => {
        if (!disabled) event.currentTarget.style.transform = "translateY(1px)"
      }}
      onMouseUp={event => {
        event.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <span style={{
        width: 28,
        height: 28,
        borderRadius: 9,
        background: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
      }}>
        <GoogleMark />
      </span>
      Continue with Google
    </button>
  )
}
