"""
AI service: OpenAI-compatible streaming chat completions.
The API key is read from config (server-side only) and never sent to the client.
"""
import json
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


def stream_chat(messages, model=None, temperature=None, max_tokens=None):
    """
    Generator that yields text deltas from the AI model.
    `messages` is a list of {"role": ..., "content": ...} dicts.
    Raises AIServiceError on failure.
    """
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
