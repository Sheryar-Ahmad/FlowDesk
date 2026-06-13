import { Link } from "react-router-dom"
import { Code2, FileText, Kanban, Bot, Timer, GitCompare } from "lucide-react"

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#11111b]">
      {/* Navigation */}
      <nav className="border-b border-gray-800 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Code2 className="text-[#6366f1]" size={28} />
          <span className="text-xl font-bold text-white">FlowDesk</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link to="/login" className="text-gray-400 hover:text-white transition-colors">Login</Link>
          <Link to="/register" className="bg-[#6366f1] hover:bg-[#4f46e5] text-white px-3 sm:px-4 py-2 rounded-lg transition-all text-sm sm:text-base whitespace-nowrap">
            <span className="sm:hidden">Get Started</span>
            <span className="hidden sm:inline">Get Started Free</span>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <div className="inline-block bg-[#312e81] text-indigo-300 text-xs sm:text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          One app to replace 10 tools
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-6 leading-[1.08] tracking-tight">
          The Unified
          <span className="text-[#6366f1]"> Developer</span>
          <br />Workspace
        </h1>
        <p className="text-base sm:text-xl text-gray-400 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
          Stop switching between apps. FlowDesk combines everything a developer
          needs into one beautiful, fast, and intelligent workspace.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 max-w-sm sm:max-w-none mx-auto">
          <Link to="/register" className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-base sm:text-lg px-8 py-3 rounded-xl transition-all">Start for Free</Link>
          <Link to="/login" className="bg-[#1e1e2e] hover:bg-[#2a2a3e] text-white text-base sm:text-lg px-8 py-3 rounded-xl transition-all border border-gray-700">Login</Link>
        </div>
      </div>

      {/* Features Grid - 6 Cards */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-8 sm:mb-12">
          Everything you need. Nothing you don't.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Card 1 - Snippet Manager */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6 hover:border-[#6366f1] transition-all duration-200">
            <Code2 className="text-[#6366f1] mb-4" size={32} />
            <h3 className="text-lg font-semibold text-white mb-2">Snippet Manager</h3>
            <p className="text-gray-400">Save and search code in 50+ languages instantly</p>
          </div>
          {/* Card 2 - Developer Notes */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6 hover:border-[#6366f1] transition-all duration-200">
            <FileText className="text-[#6366f1] mb-4" size={32} />
            <h3 className="text-lg font-semibold text-white mb-2">Developer Notes</h3>
            <p className="text-gray-400">Rich text notes with syntax highlighted code blocks</p>
          </div>
          {/* Card 3 - Task Board */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6 hover:border-[#6366f1] transition-all duration-200">
            <Kanban className="text-[#6366f1] mb-4" size={32} />
            <h3 className="text-lg font-semibold text-white mb-2">Task Board</h3>
            <p className="text-gray-400">Kanban project management built for developers</p>
          </div>
          {/* Card 4 - AI Assistant */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6 hover:border-[#6366f1] transition-all duration-200">
            <Bot className="text-[#6366f1] mb-4" size={32} />
            <h3 className="text-lg font-semibold text-white mb-2">AI Assistant</h3>
            <p className="text-gray-400">Powered by Groq, Gemini, Mistral and Ollama - all free</p>
          </div>
          {/* Card 5 - Focus Timer */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6 hover:border-[#6366f1] transition-all duration-200">
            <Timer className="text-[#6366f1] mb-4" size={32} />
            <h3 className="text-lg font-semibold text-white mb-2">Focus Timer</h3>
            <p className="text-gray-400">Pomodoro timer to keep you in the zone</p>
          </div>
          {/* Card 6 - Code Diff */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-xl p-6 hover:border-[#6366f1] transition-all duration-200">
            <GitCompare className="text-[#6366f1] mb-4" size={32} />
            <h3 className="text-lg font-semibold text-white mb-2">Code Diff</h3>
            <p className="text-gray-400">Compare two code blocks side by side instantly</p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-24 text-center">
        <div className="bg-[#1e1e2e] border border-[#6366f1] rounded-2xl p-6 sm:p-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to build your independence?</h2>
          <p className="text-gray-400 mb-8">Free forever. No credit card required. Upgrade when you are ready.</p>
          <Link to="/register" className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-lg px-8 py-3 rounded-lg transition-all inline-block">Get Started Free</Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-4 sm:px-6 py-8 text-center text-sm sm:text-base text-gray-500">
        <p>FlowDesk - Built with purpose by developers, for developers.</p>
      </footer>
    </div>
  )
}
