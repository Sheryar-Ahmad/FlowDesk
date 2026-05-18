import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Code2, Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react"
import toast from "react-hot-toast"

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
  
  const [passwordLength, setPasswordLength] = useState(false)
  const [passwordUppercase, setPasswordUppercase] = useState(false)
  const [passwordLowercase, setPasswordLowercase] = useState(false)
  const [passwordNumber, setPasswordNumber] = useState(false)
  const [passwordSpecial, setPasswordSpecial] = useState(false)

  useEffect(() => {
    setPasswordLength(password.length >= 8)
    setPasswordUppercase(/[A-Z]/.test(password))
    setPasswordLowercase(/[a-z]/.test(password))
    setPasswordNumber(/\d/.test(password))
    setPasswordSpecial(/[!@#$%^&*(),.?":{}|<>]/.test(password))
  }, [password])

  const getStrengthColor = () => {
    const checks = [passwordLength, passwordUppercase, passwordLowercase, passwordNumber, passwordSpecial].filter(Boolean).length
    if (checks === 5) return "#22c55e"
    if (checks >= 3) return "#eab308"
    if (checks > 0) return "#f97316"
    return "#ef4444"
  }

  const getStrengthText = () => {
    const checks = [passwordLength, passwordUppercase, passwordLowercase, passwordNumber, passwordSpecial].filter(Boolean).length
    if (checks === 5) return "Strong password"
    if (checks >= 3) return "Medium password"
    if (checks > 0) return "Weak password"
    return "Too weak"
  }

  const getStrengthPercent = () => {
    const checks = [passwordLength, passwordUppercase, passwordLowercase, passwordNumber, passwordSpecial].filter(Boolean).length
    return (checks / 5) * 100
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
    if (!passwordUppercase) {
      setError("Password must contain an uppercase letter")
      return false
    }
    if (!passwordLowercase) {
      setError("Password must contain a lowercase letter")
      return false
    }
    if (!passwordNumber) {
      setError("Password must contain a number")
      return false
    }
    if (!passwordSpecial) {
      setError("Password must contain a special character")
      return false
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return false
    }
    return true
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError("")
    
    if (!validateForm()) return
    
    setIsLoading(true)
    
    try {
      const response = await fetch("http://localhost:8000/api/v1/auth/register", {
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
    } catch (err) {
      setError("Network error. Please make sure the backend server is running.")
      toast.error("Network error. Backend server may not be running.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#11111b] flex items-center justify-center">
        <div className="bg-[#1e1e2e] p-8 rounded-xl text-center">
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
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <Code2 className="text-[#6366f1]" size={32} />
            <span className="text-2xl font-bold text-white">FlowDesk</span>
          </Link>
          <p className="text-gray-400 mt-2">Create your free account</p>
        </div>

        <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6">
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
                  <div className="grid grid-cols-2 gap-1 text-xs mt-2">
                    <span className={passwordLength ? "text-green-400" : "text-gray-500"}>✓ 8+ characters</span>
                    <span className={passwordUppercase ? "text-green-400" : "text-gray-500"}>✓ Uppercase letter</span>
                    <span className={passwordLowercase ? "text-green-400" : "text-gray-500"}>✓ Lowercase letter</span>
                    <span className={passwordNumber ? "text-green-400" : "text-gray-500"}>✓ Number</span>
                    <span className={passwordSpecial ? "text-green-400" : "text-gray-500"}>✓ Special character</span>
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
