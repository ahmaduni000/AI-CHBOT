"""
Chat API routes: conversations, messages, streaming AI responses, edits, etc.
All AI calls happen server-side; the API key never reaches the client.
"""
import json
from flask import request, jsonify, Response, stream_with_context
from flask_login import login_required, current_user
from models import db, Conversation, Message, UserSettings
from routes import chat_bp
from services import stream_chat, AIServiceError
from services.title_service import make_title
from utils import estimate_tokens, generate_title


def _get_conv(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first()
    if not conv:
        return None, jsonify({"error": "Conversation not found."}), 404
    return conv, None, None


@chat_bp.route("/conversations", methods=["GET"])
@login_required
def list_conversations():
    search = (request.args.get("q") or "").strip().lower()
    query = Conversation.query.filter_by(user_id=current_user.id)
    if search:
        query = query.filter(Conversation.title.ilike(f"%{search}%"))
    query = query.order_by(
        Conversation.pinned.desc(), Conversation.updated_at.desc()
    )
    convs = query.all()
    return jsonify([c.to_dict() for c in convs])


@chat_bp.route("/conversations", methods=["POST"])
@login_required
def new_conversation():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "New Chat").strip()[:200] or "New Chat"
    conv = Conversation(user_id=current_user.id, title=title)
    db.session.add(conv)
    db.session.commit()
    return jsonify(conv.to_dict()), 201


@chat_bp.route("/conversations/<int:conv_id>", methods=["GET"])
@login_required
def get_conversation(conv_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    msgs = [m.to_dict() for m in conv.messages.order_by(Message.created_at.asc())]
    return jsonify({"conversation": conv.to_dict(), "messages": msgs})


@chat_bp.route("/conversations/<int:conv_id>", methods=["DELETE"])
@login_required
def delete_conversation(conv_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    db.session.delete(conv)
    db.session.commit()
    return jsonify({"success": True})


@chat_bp.route("/conversations/<int:conv_id>/rename", methods=["POST"])
@login_required
def rename_conversation(conv_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    data = request.get_json(silent=True) or request.form
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title cannot be empty."}), 400
    if len(title) > 200:
        title = title[:200]
    conv.title = title
    db.session.commit()
    return jsonify({"success": True, "id": conv.id, "title": conv.title})


@chat_bp.route("/conversations/<int:conv_id>/pin", methods=["POST"])
@login_required
def pin_conversation(conv_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    data = request.get_json(silent=True) or {}
    conv.pinned = bool(data.get("pinned", not conv.pinned))
    db.session.commit()
    return jsonify(conv.to_dict())


@chat_bp.route("/conversations/<int:conv_id>/clear", methods=["POST"])
@login_required
def clear_conversation(conv_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    conv.messages.delete()
    conv.title = "New Chat"
    db.session.commit()
    return jsonify({"success": True})


@chat_bp.route("/conversations/<int:conv_id>/messages", methods=["GET"])
@login_required
def list_messages(conv_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    msgs = [m.to_dict() for m in conv.messages.order_by(Message.created_at.asc())]
    return jsonify(msgs)


@chat_bp.route("/conversations/<int:conv_id>/messages/<int:msg_id>", methods=["PUT"])
@login_required
def edit_message(conv_id, msg_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    msg = conv.messages.filter_by(id=msg_id).first()
    if not msg:
        return jsonify({"error": "Message not found."}), 404
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Message content cannot be empty."}), 400
    msg.content = content
    msg.edited = True
    db.session.commit()
    return jsonify(msg.to_dict())


@chat_bp.route("/conversations/<int:conv_id>/messages/<int:msg_id>", methods=["DELETE"])
@login_required
def delete_message(conv_id, msg_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    msg = conv.messages.filter_by(id=msg_id).first()
    if not msg:
        return jsonify({"error": "Message not found."}), 404
    db.session.delete(msg)
    db.session.commit()
    return jsonify({"success": True})


@chat_bp.route("/conversations/<int:conv_id>/send", methods=["POST"])
@login_required
def send_message(conv_id):
    """
    Accepts a user message, stores it, and streams the AI response as
    Server-Sent Events. The assistant message is persisted at the end.
    """
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code

    data = request.get_json(silent=True) or {}
    user_content = (data.get("content") or "").strip()
    if not user_content:
        return jsonify({"error": "Message cannot be empty."}), 400

    settings = current_user.settings
    temperature = data.get("temperature", settings.temperature if settings else 0.7)
    max_tokens = data.get("max_tokens", settings.max_tokens if settings else 2048)
    model = data.get("model") or (settings.model if settings and settings.model else None)

    # Persist user message
    user_msg = Message(conversation_id=conv.id, role="user", content=user_content,
                       tokens=estimate_tokens(user_content))
    db.session.add(user_msg)
    db.session.commit()

    # Build message history for the model
    history = [
        {"role": m.role, "content": m.content}
        for m in conv.messages.order_by(Message.created_at.asc())
    ]

    # Generate title from first user message if still default
    if conv.title in ("New Chat", "New chat", ""):
        try:
            conv.title = make_title(user_content)
            db.session.commit()
        except Exception:  # noqa: BLE001
            conv.title = generate_title(user_content)
            db.session.commit()

    def event_stream():
        full_response = []
        try:
            for delta in stream_chat(history, model=model,
                                     temperature=temperature, max_tokens=max_tokens):
                full_response.append(delta)
                yield f"data: {json.dumps({'delta': delta})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except AIServiceError as e:
            yield f"data: {json.dumps({'error': e.message})}\n\n"
        except Exception as e:  # noqa: BLE001
            yield f"data: {json.dumps({'error': 'Unexpected error during generation.'})}\n\n"
        finally:
            text = "".join(full_response)
            if text:
                assistant_msg = Message(
                    conversation_id=conv.id, role="assistant",
                    content=text, tokens=estimate_tokens(text),
                )
                db.session.add(assistant_msg)
                conv.updated_at = db.func.now()
                db.session.commit()

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@chat_bp.route("/conversations/<int:conv_id>/regenerate", methods=["POST"])
@login_required
def regenerate(conv_id):
    """Regenerate the last assistant message based on prior history."""
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code

    settings = current_user.settings
    data = request.get_json(silent=True) or {}
    temperature = data.get("temperature", settings.temperature if settings else 0.7)
    max_tokens = data.get("max_tokens", settings.max_tokens if settings else 2048)
    model = data.get("model") or (settings.model if settings and settings.model else None)

    # Remove the last assistant message if present
    last = conv.messages.order_by(Message.created_at.desc()).first()
    if last and last.role == "assistant":
        db.session.delete(last)
        db.session.commit()

    history = [
        {"role": m.role, "content": m.content}
        for m in conv.messages.order_by(Message.created_at.asc())
    ]
    if not history or history[-1]["role"] != "user":
        return jsonify({"error": "No user message to respond to."}), 400

    def event_stream():
        full_response = []
        try:
            for delta in stream_chat(history, model=model,
                                     temperature=temperature, max_tokens=max_tokens):
                full_response.append(delta)
                yield f"data: {json.dumps({'delta': delta})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except AIServiceError as e:
            yield f"data: {json.dumps({'error': e.message})}\n\n"
        except Exception:  # noqa: BLE001
            yield f"data: {json.dumps({'error': 'Unexpected error during generation.'})}\n\n"
        finally:
            text = "".join(full_response)
            if text:
                assistant_msg = Message(
                    conversation_id=conv.id, role="assistant",
                    content=text, tokens=estimate_tokens(text),
                )
                db.session.add(assistant_msg)
                conv.updated_at = db.func.now()
                db.session.commit()

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@chat_bp.route("/export/<int:conv_id>", methods=["GET"])
@login_required
def export_conversation(conv_id):
    conv, err, code = _get_conv(conv_id)
    if err:
        return err, code
    lines = [f"# {conv.title}", ""]
    for m in conv.messages.order_by(Message.created_at.asc()):
        role = "User" if m.role == "user" else "Assistant"
        lines.append(f"## {role}")
        lines.append(m.content)
        lines.append("")
    text = "\n".join(lines)
    return Response(
        text,
        mimetype="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=chat_{conv.id}.md"},
    )
