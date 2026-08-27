"""
Application configuration loaded from environment variables (.env).
All secrets (API keys) are read here on the server side only.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # --- Core Flask ---
    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-to-a-random-secret-key")
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    DATABASE_DIR = os.path.join(BASE_DIR, "database")
    os.makedirs(DATABASE_DIR, exist_ok=True)
    # Use forward slashes for SQLite URI on Windows
    db_path = os.path.join(DATABASE_DIR, "chatbot.db").replace("\\", "/")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{db_path}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_COOKIE_SECURE = False  # Set True in production behind HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # --- AI Provider (OpenAI-compatible) ---
    # OPENCODE / DeepSeek V4 Flash Free endpoint
    AI_API_KEY = os.getenv("AI_API_KEY", "")
    AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    AI_MODEL = os.getenv("AI_MODEL", "deepseek-v4-flash-free")
    AI_TEMPERATURE = float(os.getenv("AI_TEMPERATURE", "0.7"))
    AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "2048"))
    AI_TIMEOUT = int(os.getenv("AI_TIMEOUT", "60"))

    # --- App ---
    APP_NAME = "Nebula AI"
    MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "md"}


config = Config()
