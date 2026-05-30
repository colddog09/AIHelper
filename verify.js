const btn = document.getElementById("verifyBtn");
const txt = document.getElementById("verifyText");
const statusEl = document.getElementById("verifyStatus");
const resultsEl = document.getElementById("results");

const ICONS = { verified: "✅", not_found: "❌", unknown: "⚠️" };
const LABELS = { verified: "확인됨", not_found: "존재하지 않음", unknown: "확인 불가" };
const TYPE_LABEL = { doi: "DOI", arxiv: "arXiv", isbn: "ISBN", url: "URL", title: "제목" };

btn.addEventListener("click", async () => {
  const text = txt.value.trim();
  if (!text) {
    statusEl.textContent = "텍스트를 붙여 넣어 주세요.";
    return;
  }
  btn.disabled = true;
  statusEl.textContent = "검증 중…";
  resultsEl.innerHTML = "";

  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "검증 실패");

    if (!data.results || data.results.length === 0) {
      resultsEl.innerHTML = '<p class="muted">검증할 수 있는 출처를 찾지 못했습니다. (URL/DOI/arXiv/ISBN/"제목" 형식)</p>';
      statusEl.textContent = "";
      return;
    }

    const counts = { verified: 0, not_found: 0, unknown: 0 };
    data.results.forEach((r) => counts[r.status]++);
    statusEl.textContent = `✅ ${counts.verified} · ❌ ${counts.not_found} · ⚠️ ${counts.unknown}`;

    resultsEl.innerHTML = data.results.map((r) => `
      <div class="result ${r.status}">
        <div class="result-head">
          <span class="result-icon">${ICONS[r.status]}</span>
          <span class="result-type">${TYPE_LABEL[r.type] || r.type}</span>
          <span class="result-status">${LABELS[r.status]}</span>
        </div>
        <div class="result-value">${escapeHtml(r.raw || r.value)}</div>
        <div class="result-detail">${escapeHtml(r.detail || "")}${r.link ? ` · <a href="${escapeAttr(r.link)}" target="_blank" rel="noopener">열기 ↗</a>` : ""}</div>
      </div>
    `).join("");
  } catch (err) {
    statusEl.textContent = "";
    resultsEl.innerHTML = `<p class="error">⚠️ ${escapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
