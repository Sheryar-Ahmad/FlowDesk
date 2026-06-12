import { Routes, Route, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"
const Landing = lazy(() => import("./pages/landing/Landing"))
const Login = lazy(() => import("./pages/auth/Login"))
const Register = lazy(() => import("./pages/auth/Register"))
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"))
const SnippetList = lazy(() => import("./pages/snippets/SnippetList"))
const NoteEditor = lazy(() => import("./pages/notes/NoteEditor"))
const TaskBoard = lazy(() => import("./pages/tasks/TaskBoard"))
const AIAssistant = lazy(() => import("./pages/ai/AIAssistant"))
const FocusTimer = lazy(() => import("./pages/timer/FocusTimer"))
const Loading = () => (
  <div className="min-h-screen bg-gray-950 flex items-center justify-center">
    <Loader2 className="animate-spin text-indigo-500" size={32} />
  </div>
)
function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/snippets" element={<SnippetList />} />
          <Route path="/notes" element={<NoteEditor />} />
          <Route path="/tasks" element={<TaskBoard />} />
          <Route path="/ai" element={<AIAssistant />} />
          <Route path="/timer" element={<FocusTimer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}
export default App
