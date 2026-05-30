// PromptForge — 클라이언트
// 무료 10회 후, 토스뱅크 송금 → 발급받은 코드로 충전

const FREE_QUOTA = 10;

const chatEl = document.getElementById("chat");
const formEl = document.getElementById("inputForm");
const inputEl = document.getElementById("userInput");
const topicEl = document.getElementById("topicInput");
const startBtn = document.getElementById("startBtn");
const finalEl = document.getElementById("finalPrompt");
const quotaEl = document.getElementById("quotaCount");
const buyBtn = document.getElementById("buyBtn");
const copyBtn = document.getElementById("copyBtn");

const modal = document.getElementById("topupModal");
const closeModal = document.getElementById("closeModal");
const redeemBtn = document.getElementById("redeemBtn");
const redeemInput = document.getElementById("redeemCode");
const redeemMsg = document.getElementById("redeemMsg");
const copyAcct = document.getElementById("copyAcct");

const state = { messages: [], topic: "" };

function getQuota() {
  const v = localStorage.getItem("pf_quota");
  if (v === null) { localStorage.setItem("pf_quota", String(FREE_QUOTA)); return FREE_QUOTA; }
  return parseInt(v, 10);
}
function setQuota(n) { localStorage.setItem("pf_quota", String(n)); quotaEl.textContent = String(n); }
setQuota(getQuota());

function appendMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function extractDraftPrompt(text) {
  const re = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let m, last = null;
  while ((m = re.exec(text)) !== null) last = m[1];
  return last;
}

function openModal() { modal.style.display = "flex"; redeemMsg.textContent = ""; }
function hideModal() { modal.style.display = "none"; }

startBtn.addEventListener("click", () => {
  const topic = topicEl.value.trim();
  if (!topic) { topicEl.focus(); return; }
  state.topic = topic;
  state.messages = [];
  chatEl.innerHTML = "";
  appendMsg("sys", `주제: "${topic}" — 대화를 시작합니다.`);
  sendToAI("");
});

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  if (!state.topic) { appendMsg("sys", "먼저 주제를 입력하고 '대화 시작'을 눌러 주세요."); return; }
  inputEl.value = "";
  sendToAI(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); formEl.requestSubmit(); }
});

async function sendToAI(userText) {
  const remaining = getQuota();
  if (remaining <= 0) {
    appendMsg("sys", "무료 사용량이 모두 소진되었습니다. 우측 상단 '충전하기'를 눌러 주세요.");
    openModal();
    return;
  }

  if (userText) {
    appendMsg("user", userText);
    state.messages.push({ role: "user", content: userText });
  } else {
    state.messages.push({
      role: "user",
      content: `내가 만들고 싶은 것: ${state.topic}\n프롬프트를 정교화하는 첫 질문을 해줘.`,
    });
  }

  const thinking = appendMsg("ai", "…");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: state.topic, messages: state.messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "AI 호출 실패");
    thinking.textContent = data.reply;
    state.messages.push({ role: "assistant", content: data.reply });

    const draft = extractDraftPrompt(data.reply);
    if (draft) finalEl.textContent = draft;

    setQuota(remaining - 1);
  } catch (err) {
    thinking.textContent = `⚠️ ${err.message}`;
  }
}

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(finalEl.textContent);
    copyBtn.textContent = "복사됨!";
    setTimeout(() => (copyBtn.textContent = "복사"), 1500);
  } catch {}
});

// --- 충전 모달 ---
buyBtn.addEventListener("click", openModal);
closeModal.addEventListener("click", hideModal);
modal.addEventListener("click", (e) => { if (e.target === modal) hideModal(); });

copyAcct.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("1002-2303-7735");
    copyAcct.textContent = "복사됨";
    setTimeout(() => (copyAcct.textContent = "복사"), 1200);
  } catch {}
});

redeemBtn.addEventListener("click", async () => {
  const code = redeemInput.value.trim();
  if (!code) { redeemMsg.textContent = "코드를 입력해 주세요."; return; }
  redeemMsg.textContent = "확인 중...";
  try {
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "충전 실패");
    const cur = getQuota();
    setQuota(cur + data.credit);
    redeemMsg.textContent = `✅ ${data.credit}회 충전 완료!`;
    redeemInput.value = "";
    setTimeout(hideModal, 1200);
  } catch (err) {
    redeemMsg.textContent = `⚠️ ${err.message}`;
  }
});
