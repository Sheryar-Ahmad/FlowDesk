import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Code2, Eye, EyeOff, Loader2 } from "lucide-react"
import { useAuthStore } from "../../store/authStore"
import toast from "react-hot-toast"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login({ email, password })
      toast.success("Welcome back!")
      navigate("/dashboard")
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-dark-300 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <Code2 className="text-primary-500" size={32} />
            <span className="text-2xl font-bold text-white">FlowDesk</span>
          </Link>
          <p className="text-gray-400 mt-2">Welcome back. Login to your workspace.</p>
        </div>
        <div className="card">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="you@example.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="input-field pr-12" placeholder="Your password" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {isLoading ? <><Loader2 size={18} className="animate-spin" />Logging in...</> : "Login to FlowDesk"}
            </button>
          </form>
          <p className="text-center text-gray-400 mt-6 text-sm">
            No account? <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium">Create one free</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
