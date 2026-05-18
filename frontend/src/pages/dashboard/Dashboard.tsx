import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { Code2, LogOut } from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import toast from "react-hot-toast"

export default function Dashboard() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login")
    }
  }, [isAuthenticated, navigate])

  const handleLogout = async () => {
    await logout()
    toast.success("Logged out successfully")
    navigate("/")
  }

  return (
    <div className="min-h-screen bg-dark-300">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="text-primary-500" size={28} />
          <span className="text-xl font-bold text-white">FlowDesk</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400">Welcome, {user?.display_name}</span>
          <span className="bg-primary-900 text-primary-400 text-xs px-2 py-1 rounded-full">{user?.plan}</span>
          <button onClick={handleLogout} className="btn-secondary flex items-center gap-2">
            <LogOut size={16} />Logout
          </button>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Your Workspace</h1>
        <p className="text-gray-400 mb-8">Welcome back, {user?.display_name}. Your tools are ready.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {["Snippets","Notes","Tasks","AI Assistant","API Tester","Focus Timer"].map((feature) => (
            <div key={feature} className="card hover:border-primary-600 transition-colors cursor-pointer">
              <h3 className="text-white font-semibold mb-2">{feature}</h3>
              <p className="text-gray-400 text-sm">Coming in next spiral</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
