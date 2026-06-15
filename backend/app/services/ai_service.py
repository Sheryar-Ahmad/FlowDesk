from groq import Groq
from app.config import get_settings
import structlog
import json
import re

logger = structlog.get_logger(__name__)
settings = get_settings()


def extract_ai_text(content) -> str:
    """Normalize provider-specific content shapes into non-empty text."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, dict):
        return extract_ai_text(content.get("text") or content.get("content"))
    if isinstance(content, (list, tuple)):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                value = item.get("text") or item.get("content")
            else:
                value = getattr(item, "text", None) or getattr(item, "content", None)
            if value:
                parts.append(str(value))
        return "\n".join(parts).strip()
    return ""


def require_ai_text(content, provider: str) -> str:
    """Reject empty provider responses so the router can try a fallback."""
    text = extract_ai_text(content)
    if not text:
        raise ValueError(f"{provider} returned an empty response.")
    return text


def build_system_prompt(user_context: dict = {}) -> str:
    name = user_context.get("name", "Developer")
    stack = user_context.get("stack", "")
    style = user_context.get("style", "")
    past_topics = user_context.get("past_topics", "")

    return f"""You are FlowDesk AI - the most advanced developer AI assistant ever built.

You are the combined knowledge of:
- A Principal Engineer with 20 years experience
- A Security Expert (OWASP, penetration testing)
- A Performance Optimization Specialist
- A System Design Architect (Netflix, Google scale)
- A Clean Code Evangelist (Uncle Bob standards)

You are talking to: {name}
{f"Their tech stack: {stack}" if stack else ""}
{f"Their coding style: {style}" if style else ""}
{f"Previous topics discussed: {past_topics}" if past_topics else ""}

YOUR THINKING PROCESS (always follow this):
1. UNDERSTAND: What is the user REALLY asking? (surface vs deep intent)
2. ANALYZE: What are ALL the implications, edge cases, risks?
3. PLAN: What is the BEST approach? Consider 3 alternatives.
4. EXECUTE: Provide the solution with full explanation.
5. VERIFY: Double-check your code mentally. Will it work? Any bugs?
6. ENHANCE: What can make this even better? Security? Performance?

RESPONSE RULES:
- Always provide WORKING, PRODUCTION-READY code
- Explain WHY, not just WHAT
- Point out security vulnerabilities proactively
- Suggest performance optimizations even when not asked
- Use the user's tech stack when generating code
- Reference previous conversations when relevant
- Think step by step for complex problems
- Never give incomplete code - always complete implementations
- Format code with proper syntax highlighting
- Add error handling to every code example

PERSONALITY:
- Direct and confident - no fluff
- Brutally honest about bad code
- Encouraging when code is good
- Treat developer as a smart peer
- Use examples from real-world systems (Netflix, Stripe, Google)

You have PHOTOGRAPHIC MEMORY - you remember everything discussed in this conversation and all previous sessions with this user."""


def detect_intent(message: str) -> str:
    """Automatically detects what the user needs."""
    msg_lower = message.lower()

    if any(w in msg_lower for w in ["explain", "what is", "what does", "how does", "tell me about"]):
        return "explain"
    elif any(w in msg_lower for w in ["fix", "bug", "error", "issue", "not working", "broken", "crash"]):
        return "fix"
    elif any(w in msg_lower for w in ["review", "check", "audit", "look at", "feedback"]):
        return "review"
    elif any(w in msg_lower for w in ["optimize", "faster", "performance", "slow", "improve"]):
        return "optimize"
    elif any(w in msg_lower for w in ["generate", "create", "write", "build", "make", "implement"]):
        return "generate"
    elif any(w in msg_lower for w in ["secure", "security", "vulnerability", "safe", "hack"]):
        return "security"
    elif any(w in msg_lower for w in ["test", "unit test", "testing", "jest", "pytest"]):
        return "test"
    elif any(w in msg_lower for w in ["document", "docs", "comment", "docstring"]):
        return "document"
    return "general"


def build_context_from_history(sessions: list) -> dict:
    """Builds user context from all past sessions."""
    languages = {}
    topics = []

    for session in sessions[-10:]:
        messages = session.get("messages", [])
        for msg in messages:
            content = msg.get("content", "").lower()

            for lang in ["python", "javascript", "typescript", "rust", "go", "java", "sql"]:
                if lang in content:
                    languages[lang] = languages.get(lang, 0) + 1

            if len(content) > 20 and msg.get("role") == "user":
                topics.append(content[:50])

    top_langs = sorted(languages, key=languages.get, reverse=True)[:3]

    return {
        "stack": ", ".join(top_langs) if top_langs else "",
        "past_topics": "; ".join(topics[-5:]) if topics else "",
    }


async def chat_with_ai(
    messages: list,
    user_plan: str,
    ai_messages_used: int,
    user_context: dict = {},
    session_messages: list = [],
) -> dict:
    """Ultimate AI chat with memory and context awareness."""

    if user_plan == "free" and ai_messages_used >= 20:
        raise ValueError("Free tier limit: 20 AI messages per day. Upgrade to Pro for unlimited.")

    if not settings.GROQ_API_KEY:
        raise ValueError("AI service not configured.")

    try:
        client = Groq(api_key=settings.GROQ_API_KEY)


        last_user_message = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        intent = detect_intent(last_user_message)


        system_prompt = build_system_prompt(user_context)


        intent_instructions = {
            "fix": "\n\nIMPORTANT: User has a bug. Be systematic: 1) Identify ALL bugs 2) Explain each bug 3) Provide COMPLETE fixed code 4) Explain the fix.",
            "security": "\n\nIMPORTANT: Security review requested. Check for: SQL injection, XSS, CSRF, authentication flaws, data exposure, insecure dependencies, race conditions.",
            "optimize": "\n\nIMPORTANT: Optimization requested. Analyze: time complexity, space complexity, database queries, caching opportunities, algorithm efficiency.",
            "generate": "\n\nIMPORTANT: Code generation requested. Generate COMPLETE, PRODUCTION-READY code with: error handling, logging, input validation, and tests.",
            "review": "\n\nIMPORTANT: Code review requested. Be thorough like a senior engineer: logic, style, performance, security, maintainability, scalability.",
        }

        if intent in intent_instructions:
            system_prompt += intent_instructions[intent]


        full_messages = [{"role": "system", "content": system_prompt}]


        if session_messages:
            full_messages.extend(session_messages[-20:])
        else:
            full_messages.extend(messages)


        message_length = len(last_user_message)
        if message_length > 500 or intent in ["security", "review", "optimize"]:
            model = "llama-3.3-70b-versatile"
        else:
            model = "llama-3.3-70b-versatile"

        response = client.chat.completions.create(
            model=model,
            messages=full_messages,
            max_tokens=4096,
            temperature=0.3,
            top_p=0.9,
            presence_penalty=0.1,
            frequency_penalty=0.1,
        )

        if not response.choices:
            raise ValueError("Groq returned no response choices.")
        ai_response = require_ai_text(response.choices[0].message.content, "Groq")
        tokens_used = getattr(response.usage, "total_tokens", 0) or 0

        logger.info("AI response", tokens=tokens_used, model=model, intent=intent)

        return {
            "response": ai_response,
            "tokens_used": tokens_used,
            "model": model,
            "intent": intent,
        }

    except Exception as e:
        logger.error("AI error", error=str(e))
        raise ValueError(f"AI error: {str(e)}")


async def generate_session_title(messages: list) -> str:
    """Build a fast, predictable title from the first user message."""
    first_msg = next(
        (
            str(message.get("content", ""))
            for message in messages
            if message.get("role") == "user"
        ),
        "",
    )
    cleaned = re.sub(r"```[\s\S]*?```", " code ", first_msg)
    cleaned = re.sub(r"[#*_>`~]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,:;!?-")
    if not cleaned:
        return "New Conversation"

    words = cleaned.split()
    title = " ".join(words[:8])
    if len(title) > 80:
        title = title[:77].rstrip() + "..."
    elif len(words) > 8:
        title += "..."
    return title


async def analyze_code(code: str, language: str, task: str = "explain") -> str:
    """Analyzes code for specific tasks."""
    prompts = {
        "explain": f"Explain this {language} code in detail. Cover: purpose, logic flow, key concepts, potential issues:\n\n```{language}\n{code}\n```",
        "fix": f"Find and fix ALL bugs in this {language} code. List each bug found, explain why it is a bug, then show complete fixed code:\n\n```{language}\n{code}\n```",
        "review": f"Senior code review for this {language} code. Check: correctness, security, performance, style, maintainability:\n\n```{language}\n{code}\n```",
        "optimize": f"Optimize this {language} code. Analyze time/space complexity, then provide optimized version with explanation:\n\n```{language}\n{code}\n```",
        "document": f"Add comprehensive professional documentation to this {language} code:\n\n```{language}\n{code}\n```",
        "test": f"Write comprehensive unit tests for this {language} code. Cover happy path, edge cases, error cases:\n\n```{language}\n{code}\n```",
    }

    prompt = prompts.get(task, prompts["explain"])
    result = await chat_with_ai([{"role": "user", "content": prompt}], "pro", 0)
    return result["response"]


async def chat_with_gemini(messages: list, user_context: dict = {}) -> dict:
    """Gemini fallback using new google-genai package."""
    from google import genai

    if not settings.GEMINI_API_KEY:
        raise ValueError("Gemini API key not configured.")

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    system = build_system_prompt(user_context)

    full_prompt = system + "\n\n"
    for msg in messages:
        role = "User" if msg["role"] == "user" else "Assistant"
        full_prompt += f"{role}: {msg['content']}\n\n"
    full_prompt += "Assistant:"

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=full_prompt,
    )

    ai_response = require_ai_text(getattr(response, "text", None), "Gemini")
    last_msg = messages[-1]["content"] if messages else ""
    return {
        "response": ai_response,
        "tokens_used": len(ai_response.split()) * 2,
        "model": "gemini-2.0-flash",
        "intent": detect_intent(last_msg),
    }


async def chat_with_mistral(messages: list, user_context: dict = {}) -> dict:
    """Mistral fallback - free tier available."""
    try:
        from mistralai import Client
    except ImportError:
        try:
            from mistralai import Mistral as Client
        except ImportError as exc:
            raise ImportError("mistralai package must expose Client or Mistral") from exc

    if not settings.MISTRAL_API_KEY:
        raise ValueError("Mistral API key not configured.")

    client = Client(api_key=settings.MISTRAL_API_KEY)
    system = build_system_prompt(user_context)

    full_messages = [{"role": "system", "content": system}]
    for msg in messages:
        full_messages.append({"role": msg["role"], "content": msg["content"]})

    response = client.chat.complete(
        model="mistral-large-latest",
        messages=full_messages,
        max_tokens=4096,
        temperature=0.3,
    )

    if not response.choices:
        raise ValueError("Mistral returned no response choices.")
    ai_response = require_ai_text(response.choices[0].message.content, "Mistral")
    last_msg = messages[-1]["content"] if messages else ""
    return {
        "response": ai_response,
        "tokens_used": getattr(response.usage, "total_tokens", 0) or 0,
        "model": "mistral-large",
        "intent": detect_intent(last_msg),
    }


async def smart_ai_router(
    messages: list,
    user_plan: str,
    ai_messages_used: int,
    user_context: dict = {},
    session_messages: list = [],
) -> dict:
    """Routes requests through configured providers in fallback order."""
    errors = []


    try:
        result = await chat_with_ai(
            messages=messages,
            user_plan=user_plan,
            ai_messages_used=ai_messages_used,
            user_context=user_context,
            session_messages=session_messages,
        )
        result["response"] = require_ai_text(result.get("response"), "Groq")
        result["model_used"] = "groq/llama-3.3-70b"
        return result
    except Exception as e:
        errors.append(f"Groq: {str(e)[:100]}")
        logger.warning("Groq failed, trying Gemini", error=str(e)[:100])


    try:
        result = await chat_with_gemini(messages, user_context)
        result["response"] = require_ai_text(result.get("response"), "Gemini")
        result["model_used"] = "google/gemini-2.0-flash"
        return result
    except Exception as e:
        errors.append(f"Gemini: {str(e)[:100]}")
        logger.warning("Gemini failed, trying Mistral", error=str(e)[:100])


    try:
        result = await chat_with_mistral(messages, user_context)
        result["response"] = require_ai_text(result.get("response"), "Mistral")
        result["model_used"] = "mistral/mistral-large"
        return result
    except Exception as e:
        errors.append(f"Mistral: {str(e)[:100]}")
        logger.error("All AI models failed", errors=errors)

    raise ValueError("All AI models temporarily unavailable. Please try again in a few minutes.")
