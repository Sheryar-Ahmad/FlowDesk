import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Code2, Eye, EyeOff, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

export default function Login() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError("")
    
    if (!email || !password) {
      setError("Please enter both email and password")
      return
    }
    
    setIsLoading(true)
    
    try {
      const response = await fetch("http://localhost:8000/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password: password,
        }),
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        localStorage.setItem("access_token", data.access_token)
        localStorage.setItem("refresh_token", data.refresh_token)
        localStorage.setItem("user", JSON.stringify(data.user))
        toast.success("Welcome back, " + data.user.display_name + "!")
        navigate("/dashboard")
      } else {
        setError(data.detail || "Invalid email or password")
        toast.error(data.detail || "Invalid email or password")
      }
    } catch (err) {
      setError("Network error. Please make sure the backend server is running.")
      toast.error("Network error. Backend server may not be running.")
    } finally {
      setIsLoading(false)
    }
  }

  const fillDemoCredentials = () => {
    setEmail("testuser@example.com")
    setPassword("Test123!")
  }

  return (
    <div className="min-h-screen bg-[#11111b] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <Code2 className="text-[#6366f1]" size={32} />
            <span className="text-2xl font-bold text-white">FlowDesk</span>
          </Link>
          <p className="text-gray-400 mt-2">Welcome back. Login to your workspace.</p>
        </div>

        <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            
            {error && (
              <div className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-[#2a2a3e] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-[#6366f1]"
                placeholder="you@example.com"
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-[#2a2a3e] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-[#6366f1] pr-12"
                  placeholder="Enter your password"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-600 bg-[#2a2a3e] text-[#6366f1]" />
                <span className="text-sm text-gray-400">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-[#6366f1] hover:text-[#818cf8]">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Logging in...
                </>
              ) : (
                "Login to FlowDesk"
              )}
            </button>

            <button
              type="button"
              onClick={fillDemoCredentials}
              className="w-full text-sm text-gray-500 hover:text-gray-400 transition-colors py-2"
            >
              Use demo credentials
            </button>
          </form>

          <p className="text-center text-gray-400 mt-6 text-sm">
            Don't have an account?{" "}
            <Link to="/register" className="text-[#6366f1] hover:text-[#818cf8] font-medium">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
