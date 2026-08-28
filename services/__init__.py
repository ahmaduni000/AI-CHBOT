"""
AI service: OpenAI-compatible streaming chat completions, with a built-in
offline "mock" provider so the chatbot works without any external API.
The API key is read from config (server-side only) and never sent to the client.
"""
import json
import time
import re
from openai import OpenAI
from config import config


class AIServiceError(Exception):
    """Raised when the AI provider returns an error or is misconfigured."""

    def __init__(self, message, status=500):
        super().__init__(message)
        self.message = message
        self.status = status


def _client():
    if not config.AI_API_KEY:
        raise AIServiceError(
            "AI provider is not configured. Please set AI_API_KEY in the .env file.",
            status=503,
        )
    return OpenAI(
        api_key=config.AI_API_KEY,
        base_url=config.AI_BASE_URL,
        timeout=config.AI_TIMEOUT,
        max_retries=1,
    )


def _last_user(messages):
    for m in reversed(messages):
        if m.get("role") == "user":
            return m.get("content", "")
    return ""


def _mock_reply(user_text):
    """Generate a contextual, helpful demo reply (offline, no API needed)."""
    text = (user_text or "").strip()
    if not text:
        return "Hi! Ask me anything and I'll do my best to help. 🌟"

    lowered = text.lower()

    # Greetings
    if re.search(r"\b(hi|hello|hey|yo|salam|assalam)\b", lowered):
        return ("Hello! I'm Nebula AI 🌟 I'm currently running in demo mode, "
                "so my replies are generated locally. Ask me a question, request code, "
                "or ask me to explain a concept and I'll respond right away.")

    # Code request
    if re.search(r"\b(code|function|script|python|javascript|java|write a|implement)\b", lowered):
        lang = "python"
        if "javascript" in lowered or " js" in lowered:
            lang = "javascript"
        snippet = (
            f"Here's a small {lang} example:\n\n"
            f"```{lang}\n"
            f"def greet(name):\n"
            f"    return f\"Hello, {{name}}!\"\n\n"
            f"print(greet(\"world\"))\n"
            f"```\n\n"
            f"This is a demo response. Connect a real API key in `.env` "
            f"(set `AI_PROVIDER=openai` and `AI_API_KEY`) to get live model answers."
        )
        return snippet

    # Explain / what is
    if re.search(r"\b(what is|explain|define|how does|why)\b", lowered):
        topic = re.sub(r"^(what is|explain|define|how does|why)\s+", "", lowered).strip(" ?.")
        return (f"**{topic.title()}**\n\n"
                f"In demo mode I can't fetch live definitions, but here's the idea: "
                f"*{topic}* usually refers to a concept you can explore further. "
                f"Once you connect a real provider (OpenAI, OpenRouter, Groq, etc.) "
                f"via `AI_API_KEY`, I'll give you accurate, detailed explanations.")

    # Default helpful response that echoes the question
    return (f"You said: “{text}”\n\n"
            f"I'm Nebula AI running in **offline demo mode**, so this reply is generated "
            f"locally without calling any external API. The chat UI, streaming, themes, "
            f"conversation history, and all features work fully. To get real AI answers, "
            f"add a valid API key in your `.env` file and set `AI_PROVIDER=openai`.")


def stream_chat(messages, model=None, temperature=None, max_tokens=None):
    """
    Generator that yields text deltas from the AI model.
    `messages` is a list of {"role": ..., "content": ...} dicts.
    Raises AIServiceError on failure.
    """
    # Offline demo provider: no network, no key required.
    if config.AI_PROVIDER == "mock":
        reply = _mock_reply(_last_user(messages))
        # Stream word-by-word to mimic a real typing response.
        for word in reply.split(" "):
            yield word + " "
            time.sleep(0.015)
        return

    client = _client()
    try:
        stream = client.chat.completions.create(
            model=model or config.AI_MODEL,
            messages=messages,
            temperature=temperature if temperature is not None else config.AI_TEMPERATURE,
            max_tokens=max_tokens or config.AI_MAX_TOKENS,
            stream=True,
            stream_options={"include_usage": True},
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
    except AIServiceError:
        raise
    except Exception as e:  # noqa: BLE001 - surface safe message to client
        msg = str(e)
        # Avoid leaking secrets from error text
        if config.AI_API_KEY and config.AI_API_KEY in msg:
            msg = msg.replace(config.AI_API_KEY, "[REDACTED]")
        raise AIServiceError(f"AI request failed: {msg}", status=502)


def chat_once(messages, model=None, temperature=None, max_tokens=None):
    """Non-streaming call (used for title generation)."""
    if config.AI_PROVIDER == "mock":
        user_text = _last_user(messages)
        # Derive a short title from the first user message.
        title = user_text.strip().split("\n")[0][:40]
        return title if title else "New Chat"

    client = _client()
    try:
        resp = client.chat.completions.create(
            model=model or config.AI_MODEL,
            messages=messages,
            temperature=temperature if temperature is not None else 0.3,
            max_tokens=max_tokens or 32,
            stream=False,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if config.AI_API_KEY and config.AI_API_KEY in msg:
            msg = msg.replace(config.AI_API_KEY, "[REDACTED]")
        raise AIServiceError(f"AI request failed: {msg}", status=502)
