const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()

const localApiUrl = typeof window === "undefined"
  ? "http://localhost:8000/api/v1"
  : `${window.location.protocol}//${window.location.hostname}:8000/api/v1`

export const API_BASE_URL = (
  configuredApiUrl ||
  (import.meta.env.DEV ? localApiUrl : "/api/v1")
).replace(/\/+$/, "")
