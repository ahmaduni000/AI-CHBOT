"""
Authentication routes: sign up, sign in, logout, profile, change password.
"""
from flask import request, jsonify, redirect, url_for, render_template, flash
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash
from models import db, User
from routes import auth_bp
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USER_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,30}$")


@auth_bp.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        username = (data.get("username") or "").strip()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        confirm = data.get("confirm_password") or ""

        if not USER_RE.match(username):
            return _fail("Username must be 3-30 chars (letters, numbers, . _ -).")
        if not EMAIL_RE.match(email):
            return _fail("Please enter a valid email address.")
        if len(password) < 8:
            return _fail("Password must be at least 8 characters.")
        if password != confirm:
            return _fail("Passwords do not match.")

        if User.query.filter_by(username=username).first():
            return _fail("Username already taken.")
        if User.query.filter_by(email=email).first():
            return _fail("Email already registered.")

        user = User(username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        # Create default settings
        from models import UserSettings
        db.session.add(UserSettings(user_id=user.id))
        db.session.commit()

        login_user(user)
        return _ok({"redirect": url_for("main.index")})

    return render_template("auth.html", mode="signup")


@auth_bp.route("/signin", methods=["GET", "POST"])
def signin():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        identifier = (data.get("identifier") or "").strip().lower()
        password = data.get("password") or ""

        user = User.query.filter(
            (User.username == identifier) | (User.email == identifier)
        ).first()
        if not user or not user.check_password(password):
            return _fail("Invalid credentials.")

        login_user(user)
        user.last_active = db.func.now()
        db.session.commit()
        return _ok({"redirect": url_for("main.index")})

    return render_template("auth.html", mode="signin")


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth.signin"))


@auth_bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        current = data.get("current_password") or ""
        new_pw = data.get("new_password") or ""
        confirm = data.get("confirm_password") or ""

        if not current_user.check_password(current):
            return _fail("Current password is incorrect.")
        if len(new_pw) < 8:
            return _fail("New password must be at least 8 characters.")
        if new_pw != confirm:
            return _fail("New passwords do not match.")

        current_user.password_hash = generate_password_hash(new_pw)
        db.session.commit()
        return _ok({"message": "Password updated successfully."})

    return render_template("settings.html", section="profile")


def _fail(msg):
    if request.is_json or request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify({"error": msg}), 400
    flash(msg, "error")
    return redirect(request.url)


def _ok(payload):
    if request.is_json or request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(payload)
    return redirect(payload.get("redirect", url_for("main.index")))
