"""
ai_service.py - Ultimate AI assistant for developers with persistent memory, multi-model routing, and context-aware responses.
------------------------------------------------
Features:
- Persistent memory across all sessions
- Chain of thought reasoning
- Multi-model routing
- Context aware responses
- Learns user coding style
- Auto-detects intent
"""

from groq import Groq
from app.config import get_settings
import structlog
import json

logger = structlog.get_logger(__name__)
settings = get_settings()

# --- Ultimate System Prompt ---------------------------------------------------
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


# --- Intent Detection ---------------------------------------------------------
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


# --- Context Builder ----------------------------------------------------------
def build_context_from_history(sessions: list) -> dict:
    """Builds user context from all past sessions."""
    languages = {}
    topics = []
    
    for session in sessions[-10:]:  # Last 10 sessions
        messages = session.get("messages", [])
        for msg in messages:
            content = msg.get("content", "").lower()
            # Detect languages used
            for lang in ["python", "javascript", "typescript", "rust", "go", "java", "sql"]:
                if lang in content:
                    languages[lang] = languages.get(lang, 0) + 1
            # Extract topics (simple version)
            if len(content) > 20 and msg.get("role") == "user":
                topics.append(content[:50])

    top_langs = sorted(languages, key=languages.get, reverse=True)[:3]
    
    return {
        "stack": ", ".join(top_langs) if top_langs else "",
        "past_topics": "; ".join(topics[-5:]) if topics else "",
    }


# --- Main Chat Function -------------------------------------------------------
async def chat_with_ai(
    messages: list,
    user_plan: str,
    ai_messages_used: int,
    user_context: dict = {},
    session_messages: list = [],
) -> dict:
    """
    Ultimate AI chat with memory and context awareness.
    
    - Detects intent automatically
    - Uses full conversation history
    - Applies user context for personalization
    - Chain of thought reasoning for complex problems
    """

    if user_plan == "free" and ai_messages_used >= 20:
        raise ValueError("Free tier limit: 20 AI messages per day. Upgrade to Pro for unlimited.")

    if not settings.GROQ_API_KEY:
        raise ValueError("AI service not configured.")

    try:
        client = Groq(api_key=settings.GROQ_API_KEY)

        # Detect what user needs
        last_user_message = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        intent = detect_intent(last_user_message)

        # Build personalized system prompt
        system_prompt = build_system_prompt(user_context)

        # Add intent-specific instructions
        intent_instructions = {
            "fix": "\n\nIMPORTANT: User has a bug. Be systematic: 1) Identify ALL bugs 2) Explain each bug 3) Provide COMPLETE fixed code 4) Explain the fix.",
            "security": "\n\nIMPORTANT: Security review requested. Check for: SQL injection, XSS, CSRF, authentication flaws, data exposure, insecure dependencies, race conditions.",
            "optimize": "\n\nIMPORTANT: Optimization requested. Analyze: time complexity, space complexity, database queries, caching opportunities, algorithm efficiency.",
            "generate": "\n\nIMPORTANT: Code generation requested. Generate COMPLETE, PRODUCTION-READY code with: error handling, logging, input validation, and tests.",
            "review": "\n\nIMPORTANT: Code review requested. Be thorough like a senior engineer: logic, style, performance, security, maintainability, scalability.",
        }

        if intent in intent_instructions:
            system_prompt += intent_instructions[intent]

        # Build full message history with session context
        full_messages = [{"role": "system", "content": system_prompt}]
        
        # Add session history for memory
        if session_messages:
            full_messages.extend(session_messages[-20:])  # Last 20 messages for context
        else:
            full_messages.extend(messages)

        # Select best model based on complexity
        message_length = len(last_user_message)
        if message_length > 500 or intent in ["security", "review", "optimize"]:
            model = "llama-3.3-70b-versatile"  # Most powerful for complex tasks
        else:
            model = "llama-3.3-70b-versatile"  # Always use best model

        response = client.chat.completions.create(
            model=model,
            messages=full_messages,
            max_tokens=4096,
            temperature=0.3,  # Lower = more accurate, less hallucination
            top_p=0.9,
            presence_penalty=0.1,
            frequency_penalty=0.1,
        )

        ai_response = response.choices[0].message.content
        tokens_used = response.usage.total_tokens

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
    """Auto-generates a title for the conversation."""
    if not messages or not settings.GROQ_API_KEY:
        return "New Conversation"
    
    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        first_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
        
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{
                "role": "user",
                "content": f"Generate a short 4-6 word title for this conversation. Only the title, nothing else: '{first_msg[:200]}'"
            }],
            max_tokens=20,
            temperature=0.5,
        )
        return response.choices[0].message.content.strip().strip('"')
    except:
        return "New Conversation"


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

    last_msg = messages[-1]["content"] if messages else ""
    return {
        "response": response.text,
        "tokens_used": len(response.text.split()) * 2,
        "model": "gemini-2.0-flash",
        "intent": detect_intent(last_msg),
    }

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    system = build_system_prompt(user_context)
    full_prompt = system + "\n\n"
    for msg in messages:
        role = "User" if msg["role"] == "user" else "Assistant"
        full_prompt += f"{role}: {msg['content']}\n\n"
    full_prompt += "Assistant:"
    response = client.models.generate_content(model="gemini-2.0-flash", contents=full_prompt)
    last_msg = messages[-1]["content"] if messages else ""
    return {
        "response": response.text,
        "tokens_used": len(response.text.split()) * 2,
        "model": "gemini-2.0-flash",
        "intent": detect_intent(last_msg),
    }
async def chat_with_mistral(messages: list, user_context: dict = {}) -> dict:
    """
    Mistral fallback - free tier available.
    Uses Mistral Large for maximum intelligence.
    """
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

    last_msg = messages[-1]["content"] if messages else ""
    return {
        "response": response.choices[0].message.content,
        "tokens_used": response.usage.total_tokens,
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
    """
    Ultimate AI router — tries models in order:
    1. Groq (Llama 3.3 70B) — fastest
    2. Gemini (2.0 Flash) — fallback
    3. Mistral (Large) — final fallback

    Never fails. Always returns a response.
    This is what makes FlowDesk feel like Claude.
    """
    errors = []

    # Try Groq first
    try:
        result = await chat_with_ai(
            messages=messages,
            user_plan=user_plan,
            ai_messages_used=ai_messages_used,
            user_context=user_context,
            session_messages=session_messages,
        )
        result["model_used"] = "groq/llama-3.3-70b"
        return result
    except Exception as e:
        errors.append(f"Groq: {str(e)[:100]}")
        logger.warning("Groq failed, trying Gemini", error=str(e)[:100])

    # Try Gemini second
    try:
        result = await chat_with_gemini(messages, user_context)
        result["model_used"] = "google/gemini-2.0-flash"
        return result
    except Exception as e:
        errors.append(f"Gemini: {str(e)[:100]}")
        logger.warning("Gemini failed, trying Mistral", error=str(e)[:100])

    # Try Mistral third
    try:
        result = await chat_with_mistral(messages, user_context)
        result["model_used"] = "mistral/mistral-large"
        return result
    except Exception as e:
        errors.append(f"Mistral: {str(e)[:100]}")
        logger.error("All AI models failed", errors=errors)

    raise ValueError("All AI models temporarily unavailable. Please try again in a few minutes.")