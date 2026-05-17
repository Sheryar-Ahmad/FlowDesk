import { Routes, Route, Navigate } from "react-router-dom"

// Pages - we will build these one by one
import Landing from "./pages/landing/Landing"
import Login from "./pages/auth/Login"
import Register from "./pages/auth/Register"
import Dashboard from "./pages/dashboard/Dashboard"

function App() {
  return (
    <div className="min-h-screen bg-dark-300">
      <Routes>
        {/* Public routes - anyone can see these */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes - only logged in users */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
