import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { Code2, LogOut, FileCode, FileText, Kanban, Bot, Timer, GitCompare } from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import toast from "react-hot-toast"

const features = [
  { icon: FileCode, title: "Snippets", desc: "Save and search code in 50+ languages", path: "/snippets", ready: true, color: "text-blue-400" },
  { icon: FileText, title: "Notes", desc: "Rich text notes with code blocks and tasks", path: "/notes", ready: true, color: "text-green-400" },
  { icon: Kanban, title: "Tasks", desc: "Kanban project management for developers", path: "/tasks", ready: true, color: "text-yellow-400" },
  { icon: Bot, title: "AI Assistant", desc: "Llama 3.3 70B — explain, fix, generate code", path: "/ai", ready: true, color: "text-purple-400" },
  { icon: Timer, title: "Focus Timer", desc: "Pomodoro productivity timer", path: "/timer", ready: false, color: "text-orange-400" },
  { icon: GitCompare, title: "Code Diff", desc: "Compare code side by side instantly", path: "/diff", ready: false, color: "text-cyan-400" },
]

export default function Dashboard() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => { if (!isAuthenticated) navigate("/login") }, [isAuthenticated, navigate])

  const handleLogout = async () => {
    await logout()
    toast.success("Logged out successfully")
    navigate("/")
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between bg-gray-900">
        <div className="flex items-center gap-2">
          <Code2 className="text-indigo-500" size={28} />
          <span className="text-xl font-bold text-white">FlowDesk</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">Welcome, {user?.display_name}</span>
          <span className={`text-xs px-2 py-1 rounded-full ${user?.plan === "pro" ? "bg-purple-900 text-purple-400" : "bg-indigo-900 text-indigo-400"}`}>
            {user?.plan}
          </span>
          <button onClick={handleLogout} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
            <LogOut size={16} />Logout
          </button>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Your Workspace</h1>
        <p className="text-gray-400 mb-8">Welcome back, {user?.display_name}. Everything in one place.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div key={feature.title} onClick={() => feature.ready && navigate(feature.path)}
              className={`bg-gray-900 border rounded-xl p-6 transition-all duration-200 ${
                feature.ready
                  ? "border-gray-700 hover:border-indigo-500 cursor-pointer hover:bg-gray-800 hover:shadow-lg hover:shadow-indigo-500/10"
                  : "border-gray-800 opacity-50 cursor-not-allowed"
              }`}
            >
              <feature.icon className={`mb-4 ${feature.ready ? feature.color : "text-gray-600"}`} size={32} />
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-white font-semibold">{feature.title}</h3>
                {feature.ready
                  ? <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full">Ready</span>
                  : <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Soon</span>
                }
              </div>
              <p className="text-gray-400 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}