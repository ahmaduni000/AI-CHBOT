/* ============================================================
   Nebula AI — MiniMarkdown (safe, dependency-free renderer)
   Renders a subset of Markdown to HTML without injecting raw HTML.
   Supports: headings, bold, italic, inline code, code fences,
   links, lists, blockquotes, tables, hr, line breaks.
   ============================================================ */
(function () {
    "use strict";

    function esc(s) {
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
        map["&"] = amp; map["<"] = lt; map[">"] = gt; map[QUOT] = quot; map[APOS] = apos;
        return s.replace(/[&<>"']/g, function (c) { return map[c]; });
    }

    function inline(text) {
        // Escape first, then apply formatting to escaped text.
        let t = esc(text);
        // inline code
        t = t.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
        // bold
        t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
        // italic
        t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        t = t.replace(/_([^_]+)_/g, "<em>$1</em>");
        // links [text](url) — only http(s) and mailto
        t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
            function (_, txt, url) { return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + txt + "</a>"; });
        // strikethrough
        t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
        return t;
    }

    function highlight(code, lang) {
        // Lightweight escaping; full highlighting is server-side for stored messages.
        return '<div class="code-block" data-lang="' + esc(lang || "text") + '">' +
            '<div class="code-header"><span class="code-lang">' + esc(lang || "text") +
            '</span><button class="code-copy" type="button">Copy</button></div>' +
            "<pre><code>" + esc(code) + "</code></pre></div>";
    }

    function render(src) {
        if (!src) return "";
        const lines = src.replace(/\r\n/g, "\n").split("\n");
        let html = "";
        let i = 0;
        let listType = null; // 'ul' | 'ol'
        let listBuffer = [];

        function flushList() {
            if (listType) {
                html += "<" + listType + ">" + listBuffer.map(function (li) { return "<li>" + inline(li) + "</li>"; }).join("") + "</" + listType + ">";
                listType = null; listBuffer = [];
            }
        }

        while (i < lines.length) {
            let line = lines[i];

            // Code fence
            const fence = line.match(/^```(\w*)\s*$/);
            if (fence) {
                flushList();
                const lang = fence[1];
                const code = [];
                i++;
                while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
                i++; // skip closing fence
                html += highlight(code.join("\n"), lang);
                continue;
            }

            // Headings
            const h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) { flushList(); const lvl = h[1].length; html += "<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">"; i++; continue; }

            // Horizontal rule
            if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) { flushList(); html += "<hr>"; i++; continue; }

            // Blockquote
            if (/^>\s?/.test(line)) {
                flushList();
                const q = [];
                while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
                html += "<blockquote>" + inline(q.join(" ")) + "</blockquote>";
                continue;
            }

            // Tables (header | --- | rows)
            if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
                flushList();
                const headers = line.split("|").map(function (c) { return c.trim(); }).filter(function (c, idx, arr) { return arr.length > 1 ? c !== "" : true; });
                const headCells = line.replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
                i += 2;
                let rows = "";
                while (i < lines.length && /\|/.test(lines[i])) {
                    const cells = lines[i].replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
                    rows += "<tr>" + cells.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
                    i++;
                }
                html += "<table><thead><tr>" + headCells.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") +
                    "</tr></thead><tbody>" + rows + "</tbody></table>";
                continue;
            }

            // Unordered list
            const ul = line.match(/^\s*[-*+]\s+(.*)$/);
            if (ul) {
                if (listType && listType !== "ul") flushList();
                listType = "ul"; listBuffer.push(ul[1]); i++; continue;
            }
            // Ordered list
            const ol = line.match(/^\s*\d+\.\s+(.*)$/);
            if (ol) {
                if (listType && listType !== "ol") flushList();
                listType = "ol"; listBuffer.push(ol[1]); i++; continue;
            }

            // Blank line
            if (/^\s*$/.test(line)) { flushList(); i++; continue; }

            // Paragraph (merge consecutive non-empty lines)
            flushList();
            const para = [line];
            i++;
            while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|>|```|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i]) && !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i])) {
                para.push(lines[i]); i++;
            }
            html += "<p>" + para.map(inline).join("<br>") + "</p>";
        }
        flushList();
        return html;
    }

    window.MiniMarkdown = { render: render };
})();
