/* ============================================================
   Nebula AI — Settings page logic
   ============================================================ */
(function () {
    "use strict";
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const S = window.USER_SETTINGS || {};
    const P = window.PROFILE || {};

    function toast(message, type = "info") {
        const c = $("#toast-container");
        const t = document.createElement("div");
        t.className = `toast ${type}`;
        const icon = type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ";
        t.innerHTML = `<span>${icon}</span><span>${message.replace(/[<>&]/g, "")}</span>`;
        c.appendChild(t);
        setTimeout(() => { t.classList.add("out"); t.addEventListener("animationend", () => t.remove()); }, 3200);
    }

    function setError(name, msg) {
        const el = document.querySelector(`.field-error[data-for="${name}"]`);
        if (el) el.textContent = msg || "";
    }

    // Tabs
    $$(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            $$(".tab-btn").forEach((b) => b.classList.remove("active"));
            $$(".settings-section").forEach((s) => s.classList.remove("active"));
            btn.classList.add("active");
            $("#tab-" + btn.dataset.tab).classList.add("active");
        });
    });

    // Theme options
    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        $$(".theme-opt").forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
    }
    $$(".theme-opt").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.theme)));

    // Init values
    function init() {
        if (S.theme) applyTheme(S.theme);
        if (S.model) $("#model").value = S.model;
        if (S.temperature != null) { $("#temperature").value = S.temperature; $("#temp-val").textContent = S.temperature; }
        if (S.max_tokens != null) $("#max_tokens").value = S.max_tokens;
        if (S.send_on_enter != null) $("#send_on_enter").checked = S.send_on_enter;
        if (P.username) { $("#profile-username").textContent = P.username; $("#profile-avatar").textContent = P.username[0].toUpperCase(); }
        if (P.email) $("#profile-email").textContent = P.email;
    }

    // Preferences form
    $("#prefs-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            theme: document.documentElement.getAttribute("data-theme"),
            model: $("#model").value.trim(),
            temperature: parseFloat($("#temperature").value),
            max_tokens: parseInt($("#max_tokens").value, 10),
            send_on_enter: $("#send_on_enter").checked,
        };
        try {
            const res = await fetch(window.location.pathname, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast(data.error || "Save failed", "error"); return; }
            toast("Preferences saved", "success");
            // sync global config if present
            if (window.APP_CONFIG) window.APP_CONFIG.settings = data.settings;
        } catch (err) { toast("Network error", "error"); }
    });

    $("#temperature").addEventListener("input", (e) => { $("#temp-val").textContent = e.target.value; });

    // Password form
    $("#pw-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        [".field-error"].forEach(() => { });
        setError("current_password", ""); setError("new_password", ""); setError("confirm_password", "");
        const cur = $("#current_password").value;
        const np = $("#new_password").value;
        const cp = $("#confirm_password").value;
        if (np.length < 8) { setError("new_password", "At least 8 characters."); return; }
        if (np !== cp) { setError("confirm_password", "Passwords do not match."); return; }
        try {
            const res = await fetch(window.location.pathname, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify({ current_password: cur, new_password: np, confirm_password: cp }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast(data.error || "Update failed", "error"); return; }
            toast("Password updated", "success");
            $("#pw-form").reset();
        } catch (err) { toast("Network error", "error"); }
    });

    document.addEventListener("DOMContentLoaded", init);
})();
