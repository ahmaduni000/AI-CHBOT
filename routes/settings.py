"""
Settings routes: theme, model params, preferences, profile section.
"""
from flask import request, jsonify, render_template
from flask_login import login_required, current_user
from models import db, UserSettings
from routes import settings_bp
from config import config


@settings_bp.route("", methods=["GET", "POST"])
@login_required
def index():
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        s = current_user.settings
        if not s:
            s = UserSettings(user_id=current_user.id)
            db.session.add(s)

        theme = data.get("theme")
        if theme in ("dark", "light"):
            s.theme = theme
        try:
            temp = float(data.get("temperature", s.temperature))
            s.temperature = max(0.0, min(2.0, temp))
        except (ValueError, TypeError):
            pass
        try:
            mt = int(data.get("max_tokens", s.max_tokens))
            s.max_tokens = max(64, min(8192, mt))
        except (ValueError, TypeError):
            pass
        model = (data.get("model") or "").strip()
        s.model = model
        send_enter = data.get("send_on_enter")
        if send_enter is not None:
            s.send_on_enter = str(send_enter).lower() in ("1", "true", "on", "yes")

        db.session.commit()
        return jsonify({"success": True, "settings": s.to_dict()})

    return render_template("settings.html", section="preferences",
                           model=config.AI_MODEL)


@settings_bp.route("/preferences", methods=["GET", "POST"])
@login_required
def preferences():
    return index()
