import { Link, Navigate, useParams } from "react-router-dom"
import { ArrowLeft, Bot, Cookie, CreditCard, FileText, Scale, Shield, Sparkles } from "lucide-react"

type PolicyId = "privacy" | "terms" | "refunds" | "acceptable-use" | "ai" | "cookies" | "security"

type PolicySection = Readonly<{
  heading: string
  body: string[]
}>

type Policy = Readonly<{
  id: PolicyId
  title: string
  summary: string
  icon: typeof FileText
  accent: string
  effectiveDate: string
  sections: PolicySection[]
}>

const SUPPORT_EMAIL = "support@flowdesk.app"

const POLICIES: readonly Policy[] = [
  {
    id: "privacy",
    title: "Privacy Policy",
    summary: "How FlowDesk collects, uses, stores, and protects account and workspace information.",
    icon: Shield,
    accent: "#22D3EE",
    effectiveDate: "June 21, 2026",
    sections: [
      {
        heading: "Information we collect",
        body: [
          "We collect account information such as your email address, display name, authentication provider, subscription status, and basic security metadata such as IP address and login timestamps.",
          "We store the workspace content you create in FlowDesk, including snippets, notes, tasks, AI sessions, timer data, and related metadata.",
        ],
      },
      {
        heading: "Google sign-in data",
        body: [
          "If you use Continue with Google, FlowDesk requests only basic sign-in scopes: openid, email, and profile. We use this information to create or access your FlowDesk account.",
          "FlowDesk does not request Gmail, Drive, Calendar, Contacts, or other sensitive Google API access for login.",
        ],
      },
      {
        heading: "AI processing",
        body: [
          "When you use AI features, your prompt and the relevant conversation context may be sent to the configured AI provider to generate a response.",
          "You should not submit passwords, private keys, production credentials, confidential customer data, or regulated personal data to AI prompts.",
        ],
      },
      {
        heading: "Payments",
        body: [
          "Payments are processed by Lemon Squeezy. FlowDesk does not store full card numbers or payment credentials.",
          "We may store payment status, subscription identifiers, plan type, renewal status, and webhook records so the app can activate or remove paid features.",
        ],
      },
      {
        heading: "How we use information",
        body: [
          "We use data to authenticate users, provide the workspace, enforce limits, prevent abuse, process subscriptions, improve reliability, and respond to support requests.",
          "We do not sell personal information.",
        ],
      },
      {
        heading: "Data retention and deletion",
        body: [
          "Workspace data is kept while your account is active unless you delete it or request account deletion.",
          `To request deletion or privacy help, contact ${SUPPORT_EMAIL}. Some payment, fraud-prevention, and security records may need to be retained where required by law or platform rules.`,
        ],
      },
    ],
  },
  {
    id: "terms",
    title: "Terms of Service",
    summary: "The rules for using FlowDesk accounts, workspace features, subscriptions, and integrations.",
    icon: Scale,
    accent: "#6366F1",
    effectiveDate: "June 21, 2026",
    sections: [
      {
        heading: "Using FlowDesk",
        body: [
          "FlowDesk is a developer productivity workspace for snippets, notes, tasks, code comparison, timers, and AI-assisted workflows.",
          "You must provide accurate account information and keep your account credentials secure.",
        ],
      },
      {
        heading: "Your content",
        body: [
          "You retain ownership of the content you create in FlowDesk.",
          "You grant FlowDesk permission to store, process, display, and transmit your content only as needed to provide the features you use.",
        ],
      },
      {
        heading: "Subscriptions and limits",
        body: [
          "Free and paid plans may include limits for AI messages, storage, snippets, notes, tasks, or other features.",
          "Plan limits may be adjusted to protect service reliability, control costs, or prevent abuse. Paid plan details should be reviewed at checkout before purchase.",
        ],
      },
      {
        heading: "Account restrictions",
        body: [
          "FlowDesk may suspend or disable accounts involved in abuse, fraud, illegal activity, payment disputes, attempts to bypass limits, attacks against the service, or violations of these terms.",
          "We may revoke sessions, block access, or remove content where needed to protect users, infrastructure, or legal compliance.",
        ],
      },
      {
        heading: "Service availability",
        body: [
          "FlowDesk is provided on an as-available basis. Features may change, fail, or be temporarily unavailable.",
          "You are responsible for keeping independent backups of important work.",
        ],
      },
      {
        heading: "Contact",
        body: [
          `Questions about these terms can be sent to ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
  {
    id: "refunds",
    title: "Subscription and Refund Policy",
    summary: "Billing, renewals, cancellation, message limits, and refund expectations for paid plans.",
    icon: CreditCard,
    accent: "#F59E0B",
    effectiveDate: "June 21, 2026",
    sections: [
      {
        heading: "Billing provider",
        body: [
          "Paid subscriptions are processed by Lemon Squeezy, which may act as merchant of record and handle payment collection, taxes, invoices, refunds, and chargebacks.",
          "Your checkout page will show the active price, currency, billing interval, taxes, and renewal details before purchase.",
        ],
      },
      {
        heading: "Pro plan limits",
        body: [
          "The Pro plan may include a monthly AI message quota, DeepSeek-powered responses, and higher workspace limits. The exact active plan limits should be shown in the product page and in the app.",
          "Unused AI message quota does not roll over unless explicitly stated in the checkout or billing page.",
        ],
      },
      {
        heading: "Cancellation",
        body: [
          "You can cancel a subscription through the Lemon Squeezy customer portal when it is available for your account.",
          "Cancellation stops future renewals but does not automatically refund previous charges.",
        ],
      },
      {
        heading: "Refunds",
        body: [
          "Refund requests are reviewed case by case. Digital subscriptions and AI usage create immediate operating costs, so used billing periods are generally not refundable unless required by law or approved by Lemon Squeezy.",
          `For billing help, contact ${SUPPORT_EMAIL} with your account email and Lemon Squeezy order ID.`,
        ],
      },
      {
        heading: "Failed payments and plan changes",
        body: [
          "If a payment fails, paid features may be paused or downgraded until the subscription is recovered.",
          "Refunds, chargebacks, cancellation, or subscription expiration may remove Pro access automatically through payment webhooks.",
        ],
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use Policy",
    summary: "What users may not do on FlowDesk, including abuse, fraud, attacks, and illegal activity.",
    icon: Shield,
    accent: "#EF4444",
    effectiveDate: "June 21, 2026",
    sections: [
      {
        heading: "No unlawful or harmful use",
        body: [
          "Do not use FlowDesk to break the law, violate someone else's rights, distribute malware, commit fraud, harass people, or abuse any third-party service.",
          "Do not store or share stolen credentials, unauthorized access tokens, private keys, exploit kits, or instructions intended to enable real-world harm.",
        ],
      },
      {
        heading: "No attacks or bypassing limits",
        body: [
          "Do not brute force accounts, scrape private data, overload the API, bypass rate limits, abuse free trials, create duplicate accounts to evade limits, or interfere with service availability.",
          "Do not probe, scan, or test FlowDesk security except as allowed by the Security Policy.",
        ],
      },
      {
        heading: "AI abuse",
        body: [
          "Do not use AI features to generate malware, credential theft workflows, phishing content, exploit chains, or instructions for unauthorized access.",
          "FlowDesk may restrict prompts, refuse requests, log abuse signals, or suspend accounts to protect users and infrastructure.",
        ],
      },
      {
        heading: "Enforcement",
        body: [
          "Violations may result in throttling, content removal, account suspension, permanent account disablement, subscription cancellation, or reports to payment/security providers where appropriate.",
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "AI Usage Policy",
    summary: "How AI responses work, what users should not submit, and the limits of generated output.",
    icon: Bot,
    accent: "#A855F7",
    effectiveDate: "June 21, 2026",
    sections: [
      {
        heading: "AI responses are assistive",
        body: [
          "FlowDesk AI is designed to help with developer productivity, explanations, refactoring, documentation, and review suggestions.",
          "AI output may be incomplete, outdated, insecure, or wrong. You are responsible for reviewing, testing, and validating generated code before using it.",
        ],
      },
      {
        heading: "Provider processing",
        body: [
          "AI prompts may be sent to configured providers such as Groq, Gemini, Mistral, or DeepSeek depending on availability, plan, and routing logic.",
          "Do not submit secrets, passwords, private keys, personal customer data, regulated data, or confidential business material unless you are authorized to do so and accept the provider processing risk.",
        ],
      },
      {
        heading: "Usage limits",
        body: [
          "AI message limits exist to control abuse and keep the service sustainable. Free limits may reset daily; Pro limits may reset monthly depending on the active plan.",
          "FlowDesk may reject, shorten, rate-limit, or block AI requests that are too large, abusive, unsafe, or outside available quota.",
        ],
      },
      {
        heading: "No professional advice",
        body: [
          "AI responses are not legal, financial, medical, security certification, or compliance advice.",
          "Use qualified professionals for high-risk decisions.",
        ],
      },
    ],
  },
  {
    id: "cookies",
    title: "Cookie Notice",
    summary: "How FlowDesk uses local storage, session tokens, OAuth cookies, and similar browser technologies.",
    icon: Cookie,
    accent: "#10B981",
    effectiveDate: "June 21, 2026",
    sections: [
      {
        heading: "Essential storage",
        body: [
          "FlowDesk uses browser storage and essential cookies for authentication, security, OAuth state checks, saved preferences, and app functionality.",
          "These are needed for the app to work and are not used for third-party advertising.",
        ],
      },
      {
        heading: "OAuth and security cookies",
        body: [
          "During Continue with Google, FlowDesk uses a short-lived state cookie to protect the login flow from cross-site request forgery.",
          "Auth tokens may be stored by the app to keep you signed in, depending on the active frontend configuration.",
        ],
      },
      {
        heading: "Managing storage",
        body: [
          "You can clear browser storage or cookies from your browser settings, but doing so may sign you out or remove local-only preferences.",
        ],
      },
    ],
  },
  {
    id: "security",
    title: "Security Policy",
    summary: "How to report vulnerabilities and what kind of testing is allowed.",
    icon: Sparkles,
    accent: "#38BDF8",
    effectiveDate: "June 21, 2026",
    sections: [
      {
        heading: "Reporting vulnerabilities",
        body: [
          `If you believe you found a security issue, email ${SUPPORT_EMAIL} with a clear description, affected URLs, reproduction steps, and impact.`,
          "Please do not publicly disclose a vulnerability before we have had a reasonable chance to investigate and fix it.",
        ],
      },
      {
        heading: "Allowed testing",
        body: [
          "Good-faith testing is limited to your own account and data. Do not access, modify, delete, exfiltrate, or disrupt another user's data.",
          "Do not run denial-of-service tests, spam, automated high-volume scanning, credential stuffing, social engineering, or physical attacks.",
        ],
      },
      {
        heading: "Safe harbor intent",
        body: [
          "If you follow this policy and act in good faith, we will try to work with you to understand and resolve the report instead of treating it as abuse.",
          "This is not permission to violate laws or third-party service terms.",
        ],
      },
    ],
  },
]

function findPolicy(id: string | undefined) {
  return POLICIES.find(policy => policy.id === id)
}

function PolicyCard({ policy }: Readonly<{ policy: Policy }>) {
  const Icon = policy.icon
  return (
    <Link
      to={`/legal/${policy.id}`}
      style={{
        textDecoration: "none",
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(148,163,184,0.16)",
        borderRadius: 16,
        padding: 20,
        display: "block",
        minHeight: 170,
      }}
    >
      <div style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: `${policy.accent}18`,
        border: `1px solid ${policy.accent}35`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
      }}>
        <Icon size={20} color={policy.accent} />
      </div>
      <h2 style={{ color: "#F8FAFC", fontSize: 18, margin: "0 0 8px" }}>{policy.title}</h2>
      <p style={{ color: "#64748B", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{policy.summary}</p>
    </Link>
  )
}

function LegalIndex() {
  return (
    <>
      <header style={{ maxWidth: 900, margin: "0 auto 34px", textAlign: "center" }}>
        <p style={{
          color: "#818CF8",
          fontSize: 11,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          fontWeight: 800,
          margin: "0 0 12px",
        }}>
          FlowDesk Legal Center
        </p>
        <h1 style={{ color: "#F8FAFC", fontSize: "clamp(34px, 7vw, 58px)", lineHeight: 1.05, margin: "0 0 16px" }}>
          Clear policies for a safer workspace.
        </h1>
        <p style={{ color: "#94A3B8", fontSize: 16, lineHeight: 1.7, margin: "0 auto", maxWidth: 700 }}>
          These pages explain how FlowDesk handles accounts, payments, AI, user content, acceptable use, and security reports.
        </p>
      </header>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 14,
      }}>
        {POLICIES.map(policy => <PolicyCard key={policy.id} policy={policy} />)}
      </div>
    </>
  )
}

function PolicyDetail({ policy }: Readonly<{ policy: Policy }>) {
  const Icon = policy.icon
  return (
    <article style={{ maxWidth: 880, margin: "0 auto" }}>
      <Link to="/legal" style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "#94A3B8",
        textDecoration: "none",
        fontSize: 13,
        marginBottom: 26,
      }}>
        <ArrowLeft size={15} /> Back to Legal Center
      </Link>

      <header style={{
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(148,163,184,0.16)",
        borderRadius: 22,
        padding: "clamp(24px, 5vw, 42px)",
        marginBottom: 18,
      }}>
        <div style={{
          width: 54,
          height: 54,
          borderRadius: 16,
          background: `${policy.accent}18`,
          border: `1px solid ${policy.accent}35`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
        }}>
          <Icon size={25} color={policy.accent} />
        </div>
        <h1 style={{ color: "#F8FAFC", fontSize: "clamp(30px, 6vw, 48px)", lineHeight: 1.08, margin: "0 0 12px" }}>
          {policy.title}
        </h1>
        <p style={{ color: "#94A3B8", fontSize: 15, lineHeight: 1.7, margin: "0 0 16px", maxWidth: 720 }}>
          {policy.summary}
        </p>
        <p style={{ color: "#475569", fontSize: 12, margin: 0 }}>
          Effective date: {policy.effectiveDate}
        </p>
      </header>

      <div style={{
        background: "rgba(2,6,23,0.44)",
        border: "1px solid rgba(148,163,184,0.12)",
        borderRadius: 18,
        padding: "clamp(20px, 4vw, 34px)",
      }}>
        {policy.sections.map(section => (
          <section key={section.heading} style={{ marginBottom: 26 }}>
            <h2 style={{ color: "#E2E8F0", fontSize: 18, margin: "0 0 10px" }}>
              {section.heading}
            </h2>
            {section.body.map(paragraph => (
              <p key={paragraph} style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.8, margin: "0 0 10px" }}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <p style={{
          color: "#475569",
          fontSize: 12,
          lineHeight: 1.7,
          borderTop: "1px solid rgba(148,163,184,0.12)",
          paddingTop: 18,
          margin: 0,
        }}>
          These policy drafts are provided for product transparency and should be reviewed before public launch.
        </p>
      </div>
    </article>
  )
}

export default function LegalCenter() {
  const { document } = useParams()
  const policy = document ? findPolicy(document) : undefined

  if (document && !policy) {
    return <Navigate to="/legal" replace />
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, rgba(99,102,241,0.16), transparent 34%), #080B14",
      color: "#E2E8F0",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      padding: "clamp(18px, 4vw, 42px)",
    }}>
      <nav style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        maxWidth: 1120,
        margin: "0 auto clamp(36px, 7vw, 72px)",
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <FileText size={17} color="#fff" />
          </div>
          <span style={{ color: "#F8FAFC", fontWeight: 800, fontSize: 17 }}>FlowDesk</span>
        </Link>
        <Link to="/dashboard" style={{
          color: "#CBD5E1",
          textDecoration: "none",
          fontSize: 13,
          border: "1px solid rgba(148,163,184,0.18)",
          borderRadius: 10,
          padding: "9px 13px",
          background: "rgba(255,255,255,0.035)",
        }}>
          Open app
        </Link>
      </nav>

      <section style={{ maxWidth: 1120, margin: "0 auto" }}>
        {policy ? <PolicyDetail policy={policy} /> : <LegalIndex />}
      </section>
    </main>
  )
}
