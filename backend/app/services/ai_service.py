"""
ai_service.py - AI Assistant Service
--------------------------------------
Uses Groq API - fastest free AI in the world.
Llama 3 model - better than GPT-3.5, completely free.

Features:
- Code explanation
- Bug fixing
- Code generation
- Code review
- General dev questions
- Context aware (remembers conversation)
"""

from groq import Groq
from app.config import get_settings
import structlog

logger = structlog.get_logger(__name__)
settings = get_settings()

# System prompt that makes AI a senior developer
SYSTEM_PROMPT = """You are FlowDesk AI - an elite senior software engineer assistant built into FlowDesk developer workspace.

Your personality:
- Expert in ALL programming languages and frameworks
- Give concise, practical answers - no fluff
- Always provide working code examples
- Explain WHY not just WHAT
- Point out potential bugs and security issues
- Suggest best practices and optimizations

Your capabilities:
- Explain any code instantly
- Fix bugs with explanations
- Generate production-ready code
- Review code for security, performance, bugs
- Answer any programming question
- Help with system design and architecture

Format rules:
- Use markdown for code blocks with language specified
- Keep explanations clear and simple
- Always test your code mentally before sharing
- If you spot a security issue, always mention it

You are part of FlowDesk - a unified developer workspace.
Be helpful, be fast, be accurate. Developers trust you."""


async def chat_with_ai(
    messages: list,
    user_plan: str,
    ai_messages_used: int,
) -> dict:
    """
    Sends messages to Groq AI and returns response.

    Free tier: 20 messages per day
    Pro tier: unlimited

    messages format:
    [
        {"role": "user", "content": "explain this code"},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "now fix the bug"},
    ]
    """

    # Check free tier limit
    if user_plan == "free" and ai_messages_used >= 20:
        raise ValueError("Free tier limit: 20 AI messages per day. Upgrade to Pro for unlimited.")

    if not settings.GROQ_API_KEY:
        raise ValueError("AI service not configured. Please add GROQ_API_KEY.")

    try:
        client = Groq(api_key=settings.GROQ_API_KEY)

        # Build messages with system prompt
        full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=full_messages,
            max_tokens=2048,
            temperature=0.7,
            top_p=0.9,
        )

        ai_response = response.choices[0].message.content
        tokens_used = response.usage.total_tokens

        logger.info(
            "AI response generated",
            tokens=tokens_used,
            model="llama-3.3-70b-versatile",
        )

        return {
            "response": ai_response,
            "tokens_used": tokens_used,
            "model": "llama-3.3-70b-versatile",
        }

    except Exception as e:
        logger.error("AI service error", error=str(e))
        raise ValueError(f"AI service error: {str(e)}")


async def analyze_code(code: str, language: str, task: str = "explain") -> str:
    """
    Analyzes code for specific tasks.
    Tasks: explain, fix, review, optimize, document
    """
    prompts = {
        "explain": f"Explain this {language} code clearly and concisely:\n\n```{language}\n{code}\n```",
        "fix": f"Find and fix ALL bugs in this {language} code. Show the fixed version with explanation:\n\n```{language}\n{code}\n```",
        "review": f"Review this {language} code for: bugs, security issues, performance, best practices:\n\n```{language}\n{code}\n```",
        "optimize": f"Optimize this {language} code for better performance and readability:\n\n```{language}\n{code}\n```",
        "document": f"Add professional documentation/comments to this {language} code:\n\n```{language}\n{code}\n```",
    }

    prompt = prompts.get(task, prompts["explain"])
    result = await chat_with_ai([{"role": "user", "content": prompt}], "pro", 0)
    return result["response"]
