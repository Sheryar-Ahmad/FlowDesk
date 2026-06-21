import { Routes, Route, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { Seo } from "./components/Seo"
const Landing = lazy(() => import("./pages/landing/Landing"))
const LegalCenter = lazy(() => import("./pages/legal/LegalCenter"))
const Login = lazy(() => import("./pages/auth/Login"))
const Register = lazy(() => import("./pages/auth/Register"))
const OAuthCallback = lazy(() => import("./pages/auth/OAuthCallback"))
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"))
const SnippetList = lazy(() => import("./pages/snippets/SnippetList"))
const NoteEditor = lazy(() => import("./pages/notes/NoteEditor"))
const TaskBoard = lazy(() => import("./pages/tasks/TaskBoard"))
const AIAssistant = lazy(() => import("./pages/ai/AIAssistant"))
const FocusTimer = lazy(() => import("./pages/timer/FocusTimer"))
const CodeDiff = lazy(() => import("./pages/diff/CodeDiff"))
const Loading = () => (
  <div className="min-h-screen bg-gray-950 flex items-center justify-center">
    <Loader2 className="animate-spin text-indigo-500" size={32} />
  </div>
)
function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Seo />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/legal" element={<LegalCenter />} />
          <Route path="/legal/:document" element={<LegalCenter />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/snippets" element={<ProtectedRoute><SnippetList /></ProtectedRoute>} />
          <Route path="/notes" element={<ProtectedRoute><NoteEditor /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute><TaskBoard /></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
          <Route path="/timer" element={<ProtectedRoute><FocusTimer /></ProtectedRoute>} />
          <Route path="/diff" element={<ProtectedRoute><CodeDiff /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}
export default App
