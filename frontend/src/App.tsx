import { Routes, Route, Navigate } from "react-router-dom"
import Landing from "./pages/landing/Landing"
import Login from "./pages/auth/Login"
import Register from "./pages/auth/Register"
import Dashboard from "./pages/dashboard/Dashboard"
import SnippetList from "./pages/snippets/SnippetList"

function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/snippets" element={<SnippetList />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
