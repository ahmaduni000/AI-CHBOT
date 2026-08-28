"""
Nebula AI — Flask application entry point.
Run with:  python app.py
"""
import os
from flask import Flask, redirect, url_for
from flask_login import LoginManager

from config import config
from models import db, User
from routes import main_bp, auth_bp, chat_bp, settings_bp

login_manager = LoginManager()
login_manager.login_view = "auth.signin"
login_manager.login_message = None


def create_app():
    app = Flask(__name__)
    app.config.from_object(config)

    # Initialize extensions
    db.init_app(app)
    login_manager.init_app(app)

    # Register blueprints
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(settings_bp)

    # Landing redirect for logged-out users
    @app.route("/login")
    def login_redirect():
        return redirect(url_for("auth.signin"))

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    # Security headers
    @app.after_request
    def set_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: blob:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "script-src 'self' 'unsafe-inline'; "
            "connect-src 'self'"
        )
        return resp

    with app.app_context():
        db.create_all()

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
