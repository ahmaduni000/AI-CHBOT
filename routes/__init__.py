"""
Route blueprints for Nebula AI Chatbot.
"""
from flask import Blueprint

main_bp = Blueprint("main", __name__)
auth_bp = Blueprint("auth", __name__, url_prefix="/auth")
chat_bp = Blueprint("chat", __name__, url_prefix="/api")
settings_bp = Blueprint("settings", __name__, url_prefix="/settings")

from routes import main, auth, chat, settings  # noqa: E402,F401
