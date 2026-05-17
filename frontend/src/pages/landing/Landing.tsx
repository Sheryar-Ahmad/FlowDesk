import { Link } from "react-router-dom"
import { Code2, FileText, Kanban, Bot, Timer, GitCompare } from "lucide-react"

const features = [
  { icon: Code2,    title: "Snippet Manager",  desc: "Save and search code in 50+ languages instantly" },
  { icon: FileText, title: "Developer Notes",  desc: "Rich text notes with syntax highlighted code blocks" },
  { icon: Kanban,   title: "Task Board",       desc: "Kanban project management built for developers" },
  { icon: Bot,      title: "AI Assistant",     desc: "Powered by Groq, Gemini, Mistral and Ollama - all free" },
  { icon: Timer,    title: "Focus Timer",      desc: "Pomodoro timer to keep you in the zone" },
  { icon: GitCompare, title: "Code Diff",      desc: "Compare two code blocks side by side instantly" },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-dark-300">

      {/* Navigation */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="text-primary-500" size={28} />
          <span className="text-xl font-bold text-white">FlowDesk</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-gray-400 hover:text-white transition-colors">
            Login
          </Link>
          <Link to="/register" className="btn-primary">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="inline-block bg-primary-900 text-primary-400 text-sm font-medium px-4 py-1 rounded-full mb-6">
          One app to replace 10 tools
        </div>
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          The Unified
          <span className="text-primary-500"> Developer</span>
          <br />Workspace
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
          Stop switching between apps. FlowDesk combines everything a developer
          needs into one beautiful, fast, and intelligent workspace.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/register" className="btn-primary text-lg px-8 py-3">
            Start for Free
          </Link>
          <Link to="/login" className="btn-secondary text-lg px-8 py-3">
            Login
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Everything you need. Nothing you do not.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div key={feature.title} className="card hover:border-primary-600 transition-colors duration-200">
              <feature.icon className="text-primary-500 mb-4" size={32} />
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="card border-primary-600">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to build your independence?
          </h2>
          <p className="text-gray-400 mb-8">
            Free forever. No credit card required. Upgrade when you are ready.
          </p>
          <Link to="/register" className="btn-primary text-lg px-8 py-3">
            Get Started Free
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8 text-center text-gray-500">
        <p>FlowDesk - Built with purpose by developers, for developers.</p>
      </footer>

    </div>
  )
}
