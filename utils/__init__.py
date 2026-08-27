"""
Utility helpers: markdown rendering, sanitization, title generation, etc.
"""
import re
import bleach
from markdown import markdown
from utils.highlighter import highlight_code

ALLOWED_TAGS = [
    "a", "abbr", "b", "blockquote", "br", "code", "div", "em", "h1", "h2",
    "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "span",
    "strong", "table", "tbody", "td", "th", "thead", "tr", "ul", "del",
    "input", "section", "details", "summary",
]
ALLOWED_ATTRS = {
    "*": ["class", "id"],
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "code": ["class"],
    "span": ["class"],
    "input": ["type", "checked", "disabled"],
}


def render_markdown(text):
    """Render markdown to sanitized HTML with syntax-highlighted code blocks."""
    if not text:
        return ""
    # Convert fenced code blocks to highlighted HTML before markdown parsing
    text = _highlight_fenced_blocks(text)
    html = markdown(
        text,
        extensions=[
            "fenced_code",
            "tables",
            "nl2br",
            "sane_lists",
            "toc",
        ],
    )
    # Sanitize to prevent XSS
    clean = bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS)
    # Add target/rel to links
    clean = bleach.linkify(clean, callbacks=[_set_link_attrs])
    return clean


def _set_link_attrs(attrs, new=False):
    attrs[(None, "target")] = "_blank"
    attrs[(None, "rel")] = "noopener noreferrer"
    return attrs


def _highlight_fenced_blocks(text):
    """Replace ```lang ... ``` blocks with highlighted <pre><code> HTML."""
    pattern = re.compile(r"```(\w+)?\n(.*?)```", re.DOTALL)

    def repl(m):
        lang = m.group(1) or "text"
        code = m.group(2)
        return highlight_code(code, lang)

    return pattern.sub(repl, text)


def generate_title(text, max_len=40):
    """Generate a short chat title from the first user message."""
    if not text:
        return "New Chat"
    clean = re.sub(r"\s+", " ", text).strip()
    # Remove markdown/code noise
    clean = re.sub(r"[#*`>_~\[\]()]", "", clean)
    if len(clean) > max_len:
        clean = clean[:max_len].rsplit(" ", 1)[0] + "…"
    return clean or "New Chat"


def estimate_tokens(text):
    """Rough token estimate (~4 chars per token)."""
    if not text:
        return 0
    return max(1, len(text) // 4)
