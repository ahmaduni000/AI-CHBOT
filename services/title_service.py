"""
Generate a concise chat title from the first user message using the AI model.
Falls back to a local heuristic if the API is unavailable.
"""
from services import chat_once, AIServiceError
from utils import generate_title


def make_title(first_user_message):
    """Return a short title. Uses AI if available, else local heuristic."""
    if not first_user_message:
        return "New Chat"
    try:
        prompt = [
            {
                "role": "system",
                "content": (
                    "You generate a very short (max 6 words) title summarizing the "
                    "user's request. Respond with only the title, no quotes or punctuation."
                ),
            },
            {"role": "user", "content": first_user_message},
        ]
        title = chat_once(prompt, temperature=0.2, max_tokens=24)
        title = title.strip().strip('"').strip("'")
        if title:
            return generate_title(title, max_len=45)
    except AIServiceError:
        pass
    return generate_title(first_user_message)
