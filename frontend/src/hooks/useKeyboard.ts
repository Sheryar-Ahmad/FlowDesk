/**
 * useKeyboard.ts - Keyboard Shortcuts
 * 
 * Shortcuts:
 * Ctrl+K     - Focus search
 * Ctrl+M     - New snippet (M = Make)
 * Escape     - Close modal
 */

import { useEffect } from "react"

interface ShortcutMap {
  [key: string]: () => void
}

export const useKeyboard = (shortcuts: ShortcutMap) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === "INPUT" || 
                       target.tagName === "TEXTAREA" ||
                       target.getAttribute("contenteditable") === "true"

      const key = [
        e.ctrlKey && "ctrl",
        e.shiftKey && "shift",
        e.key.toLowerCase(),
      ].filter(Boolean).join("+")

      // Ctrl+K always works - focus search
      if (key === "ctrl+k") {
        e.preventDefault()
        shortcuts["ctrl+k"]?.()
        return
      }

      // Escape always works
      if (e.key === "Escape") {
        shortcuts["escape"]?.()
        return
      }

      // Other shortcuts only when not typing
      if (isTyping) return

      if (shortcuts[key]) {
        e.preventDefault()
        shortcuts[key]()
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [shortcuts])
}
