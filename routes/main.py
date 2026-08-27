"""
Main application routes: home/chat page, health check.
"""
from flask import render_template, jsonify, request
from flask_login import login_required, current_user
from models import Conversation, UserSettings
from routes import main_bp
from config import config
from utils.highlighter import get_pygments_css


@main_bp.route("/")
@login_required
def index():
    convs = (
        Conversation.query.filter_by(user_id=current_user.id)
        .order_by(Conversation.pinned.desc(), Conversation.updated_at.desc())
        .all()
    )
    settings = current_user.settings
    theme = settings.theme if settings else "dark"
    return render_template(
        "index.html",
        conversations=convs,
        app_name=config.APP_NAME,
        model=config.AI_MODEL,
        theme=theme,
        pygments_css=get_pygments_css(),
        settings=settings.to_dict() if settings else {},
    )


@main_bp.route("/health")
def health():
    return jsonify({"status": "ok", "app": config.APP_NAME})


@main_bp.route("/welcome")
def welcome():
    """Landing page for logged-out users."""
    return render_template("welcome.html", app_name=config.APP_NAME,
                           model=config.AI_MODEL)
