import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "react-hot-toast"
import App from "./App.tsx"
import "./styles/globals.css"
import "./styles/editor.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 3, staleTime: 1000 * 60 * 5 } },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="top-right" toastOptions={{ style: { background: "#1e1e2e", color: "#fff", border: "1px solid #374151" } }} />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
)
