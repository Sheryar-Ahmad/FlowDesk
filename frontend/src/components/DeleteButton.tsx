import type { ButtonHTMLAttributes, CSSProperties, MouseEvent } from "react"
import { Trash2 } from "lucide-react"

interface DeleteButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label?: string
  iconSize?: number
  fullWidth?: boolean
}

const baseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 28,
  padding: 5,
  borderRadius: 6,
  background: "rgba(244,63,94,0.1)",
  border: "1px solid rgba(244,63,94,0.22)",
  color: "#F43F5E",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  flexShrink: 0,
  transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
}

export function DeleteButton({
  label,
  iconSize = 12,
  fullWidth = false,
  style,
  disabled,
  title,
  "aria-label": ariaLabel,
  onMouseEnter,
  onMouseLeave,
  ...buttonProps
}: DeleteButtonProps) {
  const handleMouseEnter = (event: MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      event.currentTarget.style.background = "rgba(244,63,94,0.18)"
      event.currentTarget.style.borderColor = "rgba(244,63,94,0.4)"
    }
    onMouseEnter?.(event)
  }

  const handleMouseLeave = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.background = "rgba(244,63,94,0.1)"
    event.currentTarget.style.borderColor = "rgba(244,63,94,0.22)"
    onMouseLeave?.(event)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={title || label || "Delete"}
      aria-label={ariaLabel || title || label || "Delete"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        ...baseStyle,
        width: fullWidth ? "100%" : undefined,
        padding: label ? "6px 10px" : 5,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
      {...buttonProps}
    >
      <Trash2 size={iconSize} />
      {label && <span>{label}</span>}
    </button>
  )
}
