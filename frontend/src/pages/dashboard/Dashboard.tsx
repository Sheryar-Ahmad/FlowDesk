import { Code2 } from "lucide-react"

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-dark-300 flex items-center justify-center">
      <div className="text-center">
        <Code2 className="text-primary-500 mx-auto mb-4" size={48} />
        <h1 className="text-3xl font-bold text-white mb-2">FlowDesk Dashboard</h1>
        <p className="text-gray-400">Full dashboard coming in Spiral 4.</p>
      </div>
    </div>
  )
}
