import { Link } from "react-router-dom"

export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#11111b", color: "white" }}>
      <nav style={{ padding: "1rem", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ color: "#6366f1" }}>FlowDesk</h1>
        <div>
          <Link to="/login" style={{ color: "white", marginRight: "1rem", textDecoration: "none" }}>Login</Link>
          <Link to="/register" style={{ backgroundColor: "#6366f1", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white", textDecoration: "none" }}>Register</Link>
        </div>
      </nav>
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <h1 style={{ fontSize: "3rem" }}>FlowDesk</h1>
        <p style={{ fontSize: "1.2rem", color: "#aaa" }}>The Unified Developer Workspace</p>
        <Link to="/register" style={{ display: "inline-block", marginTop: "2rem", backgroundColor: "#6366f1", padding: "0.75rem 1.5rem", borderRadius: "0.5rem", color: "white", textDecoration: "none" }}>Get Started Free</Link>
      </div>
    </div>
  )
}
