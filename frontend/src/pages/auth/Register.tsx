import { Link } from "react-router-dom"
import { Code2 } from "lucide-react"

export default function Register() {
  return (
    <div className="min-h-screen bg-dark-300 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <Code2 className="text-primary-500" size={32} />
            <span className="text-2xl font-bold text-white">FlowDesk</span>
          </Link>
          <p className="text-gray-400 mt-2">Create your free account.</p>
        </div>
        <div className="card text-center">
          <p className="text-white">Register page coming soon in Spiral 4.</p>
          <Link to="/login" className="text-primary-400 mt-4 block">Back to Login</Link>
        </div>
      </div>
    </div>
  )
}
