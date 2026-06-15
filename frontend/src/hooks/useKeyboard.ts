

import { useEffect } from "react"

interface ShortcutMap {
  [key: string]: () => void
}

interface KeyboardOptions {
  allowWhileTyping?: string[]
}

export const useKeyboard = (shortcuts: ShortcutMap, options: KeyboardOptions = {}) => {
  useEffect(() => {
    const allowedWhileTyping = new Set(options.allowWhileTyping || [])
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === "INPUT" ||
                       target.tagName === "TEXTAREA" ||
                       target.isContentEditable ||
                       target.closest('[contenteditable="true"]') !== null

      const key = [
        e.ctrlKey && "ctrl",
        e.shiftKey && "shift",
        e.key.toLowerCase(),
      ].filter(Boolean).join("+")

      // Global search and Escape remain available while an input is focused.
      if (key === "ctrl+k") {
        e.preventDefault()
        shortcuts["ctrl+k"]?.()
        return
      }

      if (e.key === "Escape") {
        shortcuts["escape"]?.()
        return
      }

      if (isTyping && !allowedWhileTyping.has(key)) return

      if (shortcuts[key]) {
        e.preventDefault()
        shortcuts[key]()
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [options.allowWhileTyping, shortcuts])
}
