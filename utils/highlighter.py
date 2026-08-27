"""
Syntax highlighting for code blocks using Pygments.
"""
from pygments import highlight
from pygments.lexers import get_lexer_by_name, guess_lexer, TextLexer
from pygments.formatters import HtmlFormatter
from pygments.util import ClassNotFound

# Cache the CSS once; included in base template.
PYGMENTS_CSS = HtmlFormatter(style="github-dark", cssclass="hl").get_style_defs(".hl")


def highlight_code(code, lang="text"):
    """Return highlighted HTML for a code block with a copy button wrapper."""
    try:
        if lang and lang != "text":
            lexer = get_lexer_by_name(lang, stripall=False)
        else:
            lexer = guess_lexer(code)
    except (ClassNotFound, Exception):
        lexer = TextLexer()

    formatter = HtmlFormatter(style="github-dark", cssclass="hl", nowrap=False)
    highlighted = highlight(code, lexer, formatter)
    lang_label = (lang or "text").lower()
    return (
        f'<div class="code-block" data-lang="{lang_label}">'
        f'<div class="code-header">'
        f'<span class="code-lang">{lang_label}</span>'
        f'<button class="code-copy" type="button" aria-label="Copy code">Copy</button>'
        f"</div>"
        f"{highlighted}"
        f"</div>"
    )


def get_pygments_css():
    return PYGMENTS_CSS
