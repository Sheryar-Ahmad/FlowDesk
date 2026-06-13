import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Code2, Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react"
import toast from "react-hot-toast"
import { API_BASE_URL } from "../../services/api/config"

export default function Register() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [success, setSuccess] = useState(false)

  const passwordChecks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*(),.?":{}|<>]/.test(password),
  ]
  const validCount = passwordChecks.filter(Boolean).length

  const getStrengthColor = () => {
    if (validCount === 5) return "#22c55e"
    if (validCount >= 3) return "#eab308"
    if (validCount > 0) return "#f97316"
    return "#ef4444"
  }

  const getStrengthText = () => {
    if (validCount === 5) return "Strong password"
    if (validCount >= 3) return "Medium password"
    if (validCount > 0) return "Weak password"
    return "Too weak"
  }

  const getStrengthPercent = () => {
    return (validCount / 5) * 100
  }

  const validateForm = () => {
    if (name.length < 2) {
      setError("Name must be at least 2 characters")
      return false
    }
    if (!email.includes("@") || !email.includes(".")) {
      setError("Please enter a valid email address")
      return false
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return false
    }
    if (!passwordChecks[1]) {
      setError("Password must contain an uppercase letter")
      return false
    }
    if (!passwordChecks[2]) {
      setError("Password must contain a lowercase letter")
      return false
    }
    if (!passwordChecks[3]) {
      setError("Password must contain a number")
      return false
    }
    if (!passwordChecks[4]) {
      setError("Password must contain a special character")
      return false
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return false
    }
    return true
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    
    if (!validateForm()) return
    
    setIsLoading(true)
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password: password,
          display_name: name.trim(),
        }),
      })
       
      const data = await response.json()
       
      if (response.ok && data.success) {
        setSuccess(true)
        toast.success("Account created successfully! Redirecting to login...")
        setTimeout(() => navigate("/login"), 2000)
      } else {
        setError(data.detail || data.message || "Registration failed")
        toast.error(data.detail || data.message || "Registration failed")
      }
    } catch {
      setError("Network error. Please make sure the backend server is running.")
      toast.error("Network error. Backend server may not be running.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#11111b] flex items-center justify-center px-4 py-8">
        <div className="bg-[#1e1e2e] border border-gray-800 p-6 sm:p-8 rounded-xl text-center w-full max-w-md">
          <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Account Created!</h2>
          <p className="text-gray-400">Redirecting to login page...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#11111b] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <Code2 className="text-[#6366f1]" size={32} />
            <span className="text-2xl font-bold text-white">FlowDesk</span>
          </Link>
          <p className="text-gray-400 mt-2">Create your free account</p>
        </div>

        <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-5 sm:p-6">
          <form onSubmit={handleRegister} className="space-y-4">
             
            {error && (
              <div className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <XCircle size={16} />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 bg-[#2a2a3e] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-[#6366f1]"
                placeholder="Sheryar Ahmad"
                disabled={isLoading}
                required
              />
            </div>

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
                  placeholder="Minimum 8 characters"
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
              
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-300"
                      style={{ 
                        width: getStrengthPercent() + "%",
                        backgroundColor: getStrengthColor()
                      }}
                    />
                  </div>
                  <p className="text-xs" style={{ color: getStrengthColor() }}>{getStrengthText()}</p>
                  <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-1 text-xs mt-2">
                    <span className={passwordChecks[0] ? "text-green-400" : "text-gray-500"}>✓ 8+ characters</span>
                    <span className={passwordChecks[1] ? "text-green-400" : "text-gray-500"}>✓ Uppercase letter</span>
                    <span className={passwordChecks[2] ? "text-green-400" : "text-gray-500"}>✓ Lowercase letter</span>
                    <span className={passwordChecks[3] ? "text-green-400" : "text-gray-500"}>✓ Number</span>
                    <span className={passwordChecks[4] ? "text-green-400" : "text-gray-500"}>✓ Special character</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-[#2a2a3e] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-[#6366f1] pr-12"
                  placeholder="Confirm your password"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Free Account"
              )}
            </button>
          </form>

          <p className="text-center text-gray-400 mt-6 text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-[#6366f1] hover:text-[#818cf8] font-medium">
              Login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
