/* ============================================================
   Nebula AI — Auth page logic (sign in / sign up)
   ============================================================ */
(function () {
    "use strict";
    const $ = (s) => document.querySelector(s);
    const mode = window.AUTH_MODE;

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
    function clearErrors() { document.querySelectorAll(".field-error").forEach((e) => (e.textContent = "")); }

    function showLoading(on) {
        const btn = $("#auth-submit");
        btn.querySelector(".btn-label").hidden = on;
        btn.querySelector(".spinner").hidden = !on;
        btn.disabled = on;
    }

    function validate() {
        clearErrors();
        let ok = true;
        if (mode === "signup") {
            const u = $("#username").value.trim();
            if (u.length < 3) { setError("username", "Username must be at least 3 characters."); ok = false; }
        }
        const id = $("#identifier").value.trim();
        if (!id) { setError("identifier", "This field is required."); ok = false; }
        const pw = $("#password").value;
        if (pw.length < 8) { setError("password", "Password must be at least 8 characters."); ok = false; }
        if (mode === "signup") {
            const cp = $("#confirm_password").value;
            if (cp !== pw) { setError("confirm_password", "Passwords do not match."); ok = false; }
        }
        return ok;
    }

    async function submit(e) {
        e.preventDefault();
        if (!validate()) return;
        showLoading(true);
        const payload = {
            identifier: $("#identifier").value.trim(),
            password: $("#password").value,
        };
        if (mode === "signup") {
            payload.username = $("#username").value.trim();
            payload.email = $("#identifier").value.trim();
            payload.confirm_password = $("#confirm_password").value;
        }
        const url = mode === "signup" ? window.AUTH_SIGNUP_URL : window.AUTH_SIGNIN_URL;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast(data.error || "Authentication failed", "error"); showLoading(false); return; }
            toast("Success! Redirecting…", "success");
            setTimeout(() => (window.location.href = data.redirect || "/"), 500);
        } catch (err) {
            toast("Network error. Please try again.", "error");
            showLoading(false);
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#auth-form").addEventListener("submit", submit);
        document.querySelectorAll(".toggle-pw").forEach((b) => {
            b.addEventListener("click", () => {
                const inp = b.previousElementSibling;
                inp.type = inp.type === "password" ? "text" : "password";
            });
        });
    });
})();
