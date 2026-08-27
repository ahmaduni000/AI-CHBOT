# Nebula AI — Professional AI Chatbot

A beautiful, secure, full-stack AI chatbot built with **Flask** (Python) and vanilla
HTML/CSS/JS. It streams responses from an OpenAI-compatible model (configured for
**DeepSeek V4 Flash Free** via OPENCODE) and stores everything in **SQLite**.

## Features

- 💬 Streaming AI responses with a typing indicator
- 🔐 Authentication (sign up / sign in / logout), hashed passwords, sessions
- 🗂️ Conversations: new, delete, pin, search, clear, export (Markdown)
- ✏️ Edit / delete / copy / regenerate messages; stop generation
- 🎨 Glassmorphism UI, dark & light mode, gradient accents, smooth animations
- 📱 Fully responsive (mobile sidebar)
- 🧩 Markdown + code blocks with syntax highlighting
- ⚙️ User settings: theme, model, temperature, max tokens, send-on-Enter
- 🛡️ API key kept server-side only; XSS-safe rendering; security headers

## Project Structure

```
app.py                 Flask entry point
config.py              Configuration (reads .env)
models/                SQLAlchemy models (User, Conversation, Message, Settings)
routes/                Blueprints (auth, chat, settings, main)
services/              AI streaming service + title generation
utils/                 Markdown rendering + syntax highlighting
templates/             Jinja2 HTML templates
static/                css/ js/ images/ uploads/
database/              SQLite file (created at runtime)
```

## Setup

```bash
# 1. Create & activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
#   then edit .env and set your AI_API_KEY, AI_BASE_URL, AI_MODEL

# 4. Run
python app.py
```

Open http://localhost:5000

## Configuration (.env)

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Flask session secret (use a long random string) |
| `AI_API_KEY` | Provider API key (server-side only) |
| `AI_BASE_URL` | OpenAI-compatible base URL |
| `AI_MODEL` | Model name (e.g. `deepseek-v4-flash-free`) |
| `AI_TEMPERATURE` / `AI_MAX_TOKENS` | Defaults |
| `DATABASE_URL` | SQLite path |

## Security Notes

- The API key is **never** exposed to the browser. All AI calls happen on the server.
- Passwords are hashed with Werkzeug's `generate_password_hash`.
- User-generated markdown is rendered through a safe, HTML-escaping renderer; the
  server-side renderer additionally sanitizes with Bleach.
- Security headers (CSP, X-Frame-Options, etc.) are set on every response.
