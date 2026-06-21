import { useEffect } from "react"
import { useLocation } from "react-router-dom"

const DEFAULT_DESCRIPTION = "FlowDesk combines code snippets, developer notes, tasks, AI assistance, focus sessions, code comparison, and a safe compiler workspace in one focused app."
const SITE_URL = (import.meta.env.VITE_SITE_URL?.trim() || "https://flowdesk.pages.dev").replace(/\/+$/, "")

const ROUTE_TITLES: Record<string, string> = {
  "/": "FlowDesk | Unified Developer Workspace",
  "/login": "Sign In | FlowDesk",
  "/register": "Create Account | FlowDesk",
  "/dashboard": "Dashboard | FlowDesk",
  "/snippets": "Code Snippets | FlowDesk",
  "/notes": "Developer Notes | FlowDesk",
  "/tasks": "Task Board | FlowDesk",
  "/ai": "AI Assistant | FlowDesk",
  "/timer": "Focus Timer | FlowDesk",
  "/diff": "Code Diff | FlowDesk",
  "/compiler": "Compiler | FlowDesk",
}

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement("meta")
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value))
}

export function Seo() {
  const { pathname } = useLocation()

  useEffect(() => {
    const isPublicLanding = pathname === "/"
    const title = ROUTE_TITLES[pathname] ?? "FlowDesk"
    const canonicalUrl = isPublicLanding ? `${SITE_URL}/` : `${SITE_URL}${pathname}`
    document.title = title

    setMeta('meta[name="description"]', { name: "description", content: DEFAULT_DESCRIPTION })
    setMeta('meta[name="robots"]', {
      name: "robots",
      content: isPublicLanding
        ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        : "noindex, nofollow, noarchive",
    })
    setMeta('meta[property="og:title"]', { property: "og:title", content: title })
    setMeta('meta[property="og:description"]', { property: "og:description", content: DEFAULT_DESCRIPTION })
    setMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl })
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title })
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: DEFAULT_DESCRIPTION })

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement("link")
      canonical.rel = "canonical"
      document.head.appendChild(canonical)
    }
    canonical.href = canonicalUrl

    const scriptId = "flowdesk-structured-data"
    document.getElementById(scriptId)?.remove()
    if (isPublicLanding) {
      const script = document.createElement("script")
      script.id = scriptId
      script.type = "application/ld+json"
      script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "FlowDesk",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: `${SITE_URL}/`,
        description: DEFAULT_DESCRIPTION,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          category: "Free tier",
        },
        featureList: [
          "Code snippet management",
          "Developer notes",
          "Kanban task planning",
          "AI coding assistant",
          "Focus timer",
          "Code comparison",
          "Safe compiler workspace",
        ],
      })
      document.head.appendChild(script)
    }
  }, [pathname])

  return null
}
