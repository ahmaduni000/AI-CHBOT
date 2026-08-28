/* ============================================================
   Nebula AI — Main chat application logic
   Handles: sidebar, conversations, streaming, markdown, features
   ============================================================ */
(function () {
    "use strict";

    const CFG = window.APP_CONFIG;
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    // ---------- State ----------
    const state = {
        convId: null,
        conversations: [],
        streaming: false,
        abort: null,
        attachments: [],
    };

    // ---------- DOM ----------
    const els = {
        sidebar: $("#sidebar"),
        sidebarOverlay: $("#sidebar-overlay"),
        menuToggle: $("#menu-toggle"),
        sidebarClose: $("#sidebar-close"),
        convList: $("#conv-list"),
        searchConv: $("#search-conv"),
        newChat: $("#new-chat"),
        messages: $("#messages"),
        emptyState: $("#empty-state"),
        composer: $("#composer"),
        prompt: $("#prompt"),
        sendBtn: $("#send-btn"),
        stopBtn: $("#stop-btn"),
        attachBtn: $("#attach-btn"),
        fileInput: $("#file-input"),
        chatTitle: $("#chat-title"),
        chatSubtitle: $("#chat-subtitle"),
        pinChat: $("#pin-chat"),
        renameChat: $("#rename-chat"),
        exportChat: $("#export-chat"),
        clearChat: $("#clear-chat"),
        deleteChat: $("#delete-chat"),
        themeToggle: $("#theme-toggle"),
        userMenuBtn: $("#user-menu-btn"),
        userMenu: $("#user-menu"),
        themeToggleMenu: $("#theme-toggle-menu"),
        msgTemplate: $("#msg-template"),
        quickPrompts: $("#quick-prompts"),
    };

    // ---------- Utilities ----------
    function escapeHtml(s) {
        const chr = String.fromCharCode;
        const SEMI = chr(59);
        const QUOT = chr(34);
        const APOS = chr(39);
        const amp = "&" + chr(97) + chr(109) + chr(112) + SEMI;
        const lt = "&" + chr(108) + chr(116) + SEMI;
        const gt = "&" + chr(103) + chr(116) + SEMI;
        const quot = "&" + chr(113) + chr(117) + chr(111) + chr(116) + SEMI;
        const apos = "&" + chr(97) + chr(112) + chr(111) + chr(115) + SEMI;
        const map = {};
        map["&"] = amp;
        map["<"] = lt;
        map[">"] = gt;
        map[QUOT] = quot;
        map[APOS] = apos;
        return String(s).replace(/[&<>"']/g, (c) => map[c]);
    }
    function formatTime(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function nowTime() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function renderMarkdown(text) {
        return window.MiniMarkdown.render(text);
    }

    function toast(message, type = "info") {
        const c = $("#toast-container");
        const t = document.createElement("div");
        t.className = `toast ${type}`;
        const icon = type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ";
        t.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
        c.appendChild(t);
        setTimeout(() => {
            t.classList.add("out");
            t.addEventListener("animationend", () => t.remove());
        }, 3200);
    }

    function autoGrow() {
        els.prompt.style.height = "auto";
        els.prompt.style.height = Math.min(els.prompt.scrollHeight, 200) + "px";
    }

    function scrollToBottom() {
        els.messages.scrollTop = els.messages.scrollHeight;
    }

    // ---------- API helpers ----------
    async function api(url, opts = {}) {
        const res = await fetch(url, {
            headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
            ...opts,
        });
        if (!res.ok) {
            let msg = "Request failed";
            try { const j = await res.json(); msg = j.error || msg; } catch (e) { }
            throw new Error(msg);
        }
        return res.json();
    }

    // ---------- Theme ----------
    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("nebula-theme", theme); } catch (e) { }
    }
    function toggleTheme() {
        const cur = document.documentElement.getAttribute("data-theme") || "dark";
        const next = cur === "dark" ? "light" : "dark";
        applyTheme(next);
        toast(`Switched to ${next} mode`, "info");
    }

    // ---------- Conversations ----------
    async function loadConversations() {
        try {
            state.conversations = await api(CFG.urls.conversations);
            renderConvList();
        } catch (e) {
            toast(e.message, "error");
        }
    }

    function renderConvList() {
        const q = (els.searchConv.value || "").toLowerCase();
        const list = state.conversations.filter((c) => c.title.toLowerCase().includes(q));
        if (!list.length) {
            els.convList.innerHTML = `<div class="conv-empty">${state.conversations.length ? "No matches" : "No conversations yet"}</div>`;
            return;
        }
        els.convList.innerHTML = "";
        list.forEach((c) => {
            const item = document.createElement("div");
            item.className = "conv-item" + (c.id === state.convId ? " active" : "");
            item.dataset.id = c.id;
            item.innerHTML = `
                <span class="conv-title">${escapeHtml(c.title)}</span>
                ${c.pinned ? '<span class="conv-pin">📌</span>' : ""}
                <button class="conv-del" title="Delete" data-del="${c.id}">🗑</button>`;
            item.addEventListener("click", (e) => {
                if (e.target.dataset.del) return;
                openConversation(c.id);
            });
            item.querySelector(".conv-del").addEventListener("click", (e) => {
                e.stopPropagation();
                removeConversation(c.id);
            });
            els.convList.appendChild(item);
        });
    }

    async function newConversation() {
        try {
            const c = await api(CFG.urls.newConv, { method: "POST", body: JSON.stringify({ title: "New Chat" }) });
            state.conversations.unshift(c);
            renderConvList();
            openConversation(c.id, true);
        } catch (e) { toast(e.message, "error"); }
    }

    async function openConversation(id, isNew) {
        state.convId = id;
        renderConvList();
        els.emptyState.style.display = "none";
        els.messages.innerHTML = "";
        const inner = document.createElement("div");
        inner.className = "messages-inner";
        els.messages.appendChild(inner);

        try {
            const data = await api(CFG.urls.getConv.replace("__CID__", id));
            els.chatTitle.textContent = data.conversation.title;
            updatePinUI(data.conversation.pinned);
            data.messages.forEach((m) => appendMessage(m.role, m.content, m.created_at, false, m.id));
            scrollToBottom();
        } catch (e) {
            toast(e.message, "error");
        }
        if (window.innerWidth <= 860) closeSidebar();
    }

    async function removeConversation(id) {
        if (!confirm("Delete this conversation? This cannot be undone.")) return;
        try {
            await api(CFG.urls.deleteConv.replace("__CID__", id), { method: "DELETE" });
            state.conversations = state.conversations.filter((c) => c.id !== id);
            renderConvList();
            if (state.convId === id) {
                state.convId = null;
                resetChatView();
            }
            toast("Conversation deleted", "success");
        } catch (e) { toast(e.message, "error"); }
    }

    async function renameConversation() {
        if (!state.convId) { toast("Open a chat first", "info"); return; }
        const current = els.chatTitle.textContent;
        const title = prompt("Rename this chat:", current);
        if (title === null) return;
        const t = title.trim();
        if (!t) { toast("Title cannot be empty", "error"); return; }
        try {
            const r = await api(CFG.urls.renameConv.replace("__CID__", state.convId),
                { method: "POST", body: JSON.stringify({ title: t }) });
            els.chatTitle.textContent = r.title;
            const local = state.conversations.find((x) => x.id === state.convId);
            if (local) local.title = r.title;
            renderConvList();
            toast("Renamed", "success");
        } catch (e) { toast(e.message, "error"); }
    }

    function resetChatView() {
        els.messages.innerHTML = "";
        els.messages.appendChild(els.emptyState);
        els.emptyState.style.display = "block";
        els.chatTitle.textContent = "New Chat";
        updatePinUI(false);
    }

    function updatePinUI(pinned) {
        els.pinChat.textContent = pinned ? "📌" : "📍";
        els.pinChat.style.color = pinned ? "var(--accent)" : "";
    }

    // ---------- Messages ----------
    function appendMessage(role, content, time, animate = true, id = null) {
        const inner = $(".messages-inner") || (() => {
            const d = document.createElement("div"); d.className = "messages-inner";
            els.messages.appendChild(d); return d;
        })();
        const node = els.msgTemplate.content.firstElementChild.cloneNode(true);
        node.dataset.role = role;
        node.dataset.id = id || "";
        node.querySelector(".msg-avatar").textContent = role === "user" ? CFG.user.initial : "✦";
        node.querySelector(".msg-role").textContent = role === "user" ? CFG.user.username : CFG.appName;
        node.querySelector(".msg-time").textContent = formatTime(time) || nowTime();
        const contentEl = node.querySelector(".msg-content");
        contentEl.innerHTML = renderMarkdown(content);
        bindCodeCopy(contentEl);
        if (role === "user") {
            node.querySelector(".regen-btn").style.display = "none";
        }
        inner.appendChild(node);
        if (animate) scrollToBottom();
        return node;
    }

    function bindCodeCopy(scope) {
        $$(".code-copy", scope).forEach((btn) => {
            btn.addEventListener("click", () => {
                const code = btn.closest(".code-block").querySelector("code").innerText;
                navigator.clipboard.writeText(code).then(() => {
                    const old = btn.textContent; btn.textContent = "Copied!";
                    setTimeout(() => (btn.textContent = old), 1400);
                });
            });
        });
    }

    function showTyping() {
        const inner = $(".messages-inner") || (() => {
            const d = document.createElement("div"); d.className = "messages-inner";
            els.messages.appendChild(d); return d;
        })();
        const node = document.createElement("div");
        node.className = "message"; node.dataset.role = "assistant"; node.id = "typing-node";
        node.innerHTML = `<div class="msg-avatar">✦</div><div class="msg-body">
            <div class="msg-meta"><span class="msg-role">${CFG.appName}</span></div>
            <div class="msg-content"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
        inner.appendChild(node);
        scrollToBottom();
        return node;
    }

    // ---------- Sending / streaming ----------
    async function sendMessage(text) {
        if (state.streaming) return;
        text = (text || "").trim();
        if (!text) return;

        if (!state.convId) {
            try {
                const c = await api(CFG.urls.newConv, { method: "POST", body: JSON.stringify({ title: "New Chat" }) });
                state.conversations.unshift(c);
                renderConvList();
                openConversation(c.id, true);
            } catch (e) { toast(e.message, "error"); return; }
        }

        appendMessage("user", text, null, true);
        els.prompt.value = "";
        autoGrow();
        setStreaming(true);

        const typing = showTyping();
        const assistantNode = els.msgTemplate.content.firstElementChild.cloneNode(true);
        assistantNode.dataset.role = "assistant";
        assistantNode.querySelector(".msg-avatar").textContent = "✦";
        assistantNode.querySelector(".msg-role").textContent = CFG.appName;
        const contentEl = assistantNode.querySelector(".msg-content");
        contentEl.innerHTML = "";
        assistantNode.querySelector(".regen-btn").style.display = "none";

        const settings = CFG.settings || {};
        const body = JSON.stringify({
            content: text,
            temperature: settings.temperature,
            max_tokens: settings.max_tokens,
            model: settings.model || "",
        });

        const url = CFG.urls.send.replace("__CID__", state.convId);
        const controller = new AbortController();
        state.abort = controller;

        let full = "";
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body, signal: controller.signal,
            });
            if (!res.ok) {
                let msg = "Generation failed";
                try { const j = await res.json(); msg = j.error || msg; } catch (e) { }
                throw new Error(msg);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop();
                for (const part of parts) {
                    if (!part.startsWith("data:")) continue;
                    const payload = part.slice(5).trim();
                    if (!payload) continue;
                    let evt; try { evt = JSON.parse(payload); } catch (e) { continue; }
                    if (evt.delta) {
                        full += evt.delta;
                        contentEl.innerHTML = renderMarkdown(full);
                        bindCodeCopy(contentEl);
                        scrollToBottom();
                    } else if (evt.error) {
                        throw new Error(evt.error);
                    }
                }
            }
            typing.remove();
            assistantNode.querySelector(".msg-time").textContent = nowTime();
            $(".messages-inner").appendChild(assistantNode);
            scrollToBottom();
            loadConversations();
        } catch (e) {
            typing.remove();
            if (e.name === "AbortError") {
                contentEl.innerHTML = renderMarkdown(full + "\n\n_⏹ Stopped._");
                $(".messages-inner").appendChild(assistantNode);
                toast("Generation stopped", "info");
            } else {
                toast(e.message, "error");
            }
        } finally {
            setStreaming(false);
            state.abort = null;
        }
    }

    function setStreaming(on) {
        state.streaming = on;
        els.stopBtn.hidden = !on;
        els.sendBtn.hidden = on;
        els.prompt.disabled = on;
    }

    function stopGeneration() {
        if (state.abort) state.abort.abort();
    }

    // ---------- Message actions (event delegation) ----------
    els.messages.addEventListener("click", (e) => {
        const msgEl = e.target.closest(".message");
        if (!msgEl) return;
        const role = msgEl.dataset.role;
        const id = msgEl.dataset.id;
        const contentEl = msgEl.querySelector(".msg-content");

        if (e.target.classList.contains("copy-btn")) {
            navigator.clipboard.writeText(contentEl.innerText).then(() => toast("Copied to clipboard", "success"));
        } else if (e.target.classList.contains("del-btn") && id) {
            if (!confirm("Delete this message?")) return;
            api(CFG.urls.deleteMsg.replace("__CID__", state.convId).replace("/0", "/" + id), { method: "DELETE" })
                .then(() => { msgEl.remove(); toast("Message deleted", "success"); })
                .catch((err) => toast(err.message, "error"));
        } else if (e.target.classList.contains("edit-btn") && role === "user") {
            editMessage(msgEl, id, contentEl);
        } else if (e.target.classList.contains("regen-btn") && role === "assistant") {
            regenerate();
        }
    });

    function editMessage(msgEl, id, contentEl) {
        const current = contentEl.innerText;
        const ta = document.createElement("textarea");
        ta.className = "edit-area";
        ta.value = current;
        ta.style.cssText = "width:100%;min-height:80px;padding:10px;border-radius:12px;background:var(--surface);color:var(--text);border:1px solid var(--accent);font-family:inherit;font-size:14px;";
        contentEl.replaceWith(ta);
        ta.focus();
        const save = async () => {
            const val = ta.value.trim();
            if (!val) { toast("Message cannot be empty", "error"); return; }
            try {
                const m = await api(CFG.urls.editMsg.replace("__CID__", state.convId).replace("/0", "/" + id),
                    { method: "PUT", body: JSON.stringify({ content: val }) });
                const newEl = document.createElement("div");
                newEl.className = "msg-content";
                newEl.innerHTML = renderMarkdown(m.content);
                ta.replaceWith(newEl);
                bindCodeCopy(newEl);
                toast("Message updated", "success");
            } catch (err) { toast(err.message, "error"); }
        };
        ta.addEventListener("blur", save);
        ta.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); }
            if (ev.key === "Escape") { const d = document.createElement("div"); d.className = "msg-content"; d.innerHTML = renderMarkdown(current); ta.replaceWith(d); }
        });
    }

    async function regenerate() {
        if (state.streaming || !state.convId) return;
        setStreaming(true);
        const typing = showTyping();
        const assistantNode = els.msgTemplate.content.firstElementChild.cloneNode(true);
        assistantNode.dataset.role = "assistant";
        assistantNode.querySelector(".msg-avatar").textContent = "✦";
        assistantNode.querySelector(".msg-role").textContent = CFG.appName;
        const contentEl = assistantNode.querySelector(".msg-content");
        const settings = CFG.settings || {};
        const url = CFG.urls.regenerate.replace("__CID__", state.convId);
        const controller = new AbortController(); state.abort = controller;
        let full = "";
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ temperature: settings.temperature, max_tokens: settings.max_tokens, model: settings.model || "" }),
                signal: controller.signal,
            });
            const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n"); buffer = parts.pop();
                for (const part of parts) {
                    if (!part.startsWith("data:")) continue;
                    const payload = part.slice(5).trim(); if (!payload) continue;
                    let evt; try { evt = JSON.parse(payload); } catch (e) { continue; }
                    if (evt.delta) { full += evt.delta; contentEl.innerHTML = renderMarkdown(full); bindCodeCopy(contentEl); scrollToBottom(); }
                    else if (evt.error) throw new Error(evt.error);
                }
            }
            typing.remove();
            assistantNode.querySelector(".msg-time").textContent = nowTime();
            $(".messages-inner").appendChild(assistantNode);
            scrollToBottom();
        } catch (e) {
            typing.remove();
            if (e.name !== "AbortError") toast(e.message, "error");
        } finally { setStreaming(false); state.abort = null; }
    }

    // ---------- Header actions ----------
    async function pinChat() {
        if (!state.convId) return;
        try {
            const c = await api(CFG.urls.pinConv.replace("__CID__", state.convId), { method: "POST", body: JSON.stringify({}) });
            const local = state.conversations.find((x) => x.id === state.convId);
            if (local) local.pinned = c.pinned;
            updatePinUI(c.pinned);
            renderConvList();
            toast(c.pinned ? "Pinned" : "Unpinned", "success");
        } catch (e) { toast(e.message, "error"); }
    }
    function exportChat() {
        if (!state.convId) return;
        window.location.href = CFG.urls.exportConv.replace("__CID__", state.convId);
    }
    async function clearChat() {
        if (!state.convId) return;
        if (!confirm("Clear all messages in this chat?")) return;
        try {
            await api(CFG.urls.clearConv.replace("__CID__", state.convId), { method: "POST" });
            els.messages.innerHTML = "";
            const inner = document.createElement("div"); inner.className = "messages-inner"; els.messages.appendChild(inner);
            els.chatTitle.textContent = "New Chat";
            toast("Chat cleared", "success");
        } catch (e) { toast(e.message, "error"); }
    }
    async function deleteChat() {
        if (!state.convId) return;
        await removeConversation(state.convId);
    }

    // ---------- Sidebar ----------
    function openSidebar() { els.sidebar.classList.add("open"); els.sidebarOverlay.classList.add("show"); }
    function closeSidebar() { els.sidebar.classList.remove("open"); els.sidebarOverlay.classList.remove("show"); }

    // ---------- Attachments (UI only) ----------
    function handleFiles(files) {
        Array.from(files).forEach((f) => {
            state.attachments.push(f);
            const chip = document.createElement("div");
            chip.className = "attach-chip";
            chip.innerHTML = `📎 ${escapeHtml(f.name)} <button title="Remove">✕</button>`;
            chip.querySelector("button").addEventListener("click", () => {
                state.attachments = state.attachments.filter((x) => x !== f);
                chip.remove();
            });
            $(".composer-wrap").insertBefore(chip, els.composer);
        });
        els.fileInput.value = "";
    }

    // ---------- Slash commands ----------
    const SLASH_COMMANDS = [
        { cmd: "/new", desc: "Start a new chat" },
        { cmd: "/rename", desc: "Rename current chat" },
        { cmd: "/clear", desc: "Clear current chat" },
        { cmd: "/export", desc: "Export current chat" },
        { cmd: "/theme", desc: "Toggle light/dark theme" },
        { cmd: "/pin", desc: "Pin/unpin current chat" },
    ];
    function handleSlashCommand(raw) {
        const cmd = raw.trim().toLowerCase();
        if (cmd === "/new") { newConversation(); return true; }
        if (cmd === "/rename") { renameConversation(); return true; }
        if (cmd === "/clear") { clearChat(); return true; }
        if (cmd === "/export") { exportChat(); return true; }
        if (cmd === "/theme") { toggleTheme(); return true; }
        if (cmd === "/pin") { pinChat(); return true; }
        return false;
    }

    // ---------- Init ----------
    function init() {
        const saved = (() => { try { return localStorage.getItem("nebula-theme"); } catch (e) { return null; } })();
        applyTheme(saved || CFG.theme || "dark");
        loadConversations();

        els.newChat.addEventListener("click", newConversation);
        els.menuToggle.addEventListener("click", openSidebar);
        els.sidebarClose.addEventListener("click", closeSidebar);
        els.sidebarOverlay.addEventListener("click", closeSidebar);
        els.searchConv.addEventListener("input", renderConvList);

        els.composer.addEventListener("submit", (e) => { e.preventDefault(); sendMessage(els.prompt.value); });
        els.prompt.addEventListener("input", autoGrow);
        els.prompt.addEventListener("keydown", (e) => {
            const enterSends = CFG.settings.send_on_enter !== false;
            if (e.key === "Enter" && !e.shiftKey && enterSends) {
                e.preventDefault();
                const v = els.prompt.value;
                if (v.startsWith("/") && handleSlashCommand(v)) { els.prompt.value = ""; autoGrow(); return; }
                sendMessage(v);
            }
        });
        els.stopBtn.addEventListener("click", stopGeneration);
        els.attachBtn.addEventListener("click", () => els.fileInput.click());
        els.fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

        els.pinChat.addEventListener("click", pinChat);
        els.renameChat.addEventListener("click", renameConversation);
        els.exportChat.addEventListener("click", exportChat);
        els.clearChat.addEventListener("click", clearChat);
        els.deleteChat.addEventListener("click", deleteChat);
        els.themeToggle.addEventListener("click", toggleTheme);
        if (els.themeToggleMenu) els.themeToggleMenu.addEventListener("click", (e) => { e.stopPropagation(); toggleTheme(); });

        els.userMenuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            els.userMenu.hidden = !els.userMenu.hidden;
        });
        document.addEventListener("click", () => { els.userMenu.hidden = true; });

        els.chatTitle.addEventListener("click", renameConversation);

        if (els.quickPrompts) {
            els.quickPrompts.addEventListener("click", (e) => {
                const btn = e.target.closest(".quick-prompt");
                if (btn) sendMessage(btn.dataset.prompt);
            });
        }

        autoGrow();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
