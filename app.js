// AIHelper — 클라이언트

const STORAGE_KEY = "pf_session";

const chatEl       = document.getElementById("chat");
const formEl       = document.getElementById("inputForm");
const inputEl      = document.getElementById("userInput");
const topicEl      = document.getElementById("topicInput");
const modelSelect  = document.getElementById("modelSelect");
const startBtn     = document.getElementById("startBtn");
const newChatBtn   = document.getElementById("newChatBtn");
const finalEl      = document.getElementById("finalPrompt");
const buyBtn       = document.getElementById("buyBtn");
const copyBtn      = document.getElementById("copyBtn");

const modal       = document.getElementById("topupModal");
const closeModal  = document.getElementById("closeModal");
const redeemBtn   = document.getElementById("redeemBtn");
const redeemInput = document.getElementById("redeemCode");
const redeemMsg   = document.getElementById("redeemMsg");

// prompt-box 요소
const sendBtn        = document.getElementById("sendBtn");
const attachBtn      = document.getElementById("attachBtn");
const fileInput      = document.getElementById("fileInput");
const imgPreviewWrap = document.getElementById("imagePreviewWrap");
const imgPreview     = document.getElementById("imagePreview");
const removeImgBtn   = document.getElementById("removeImageBtn");
const toolsBtn       = document.getElementById("toolsBtn");
const toolsBtnLabel  = document.getElementById("toolsBtnLabel");
const toolsMenu      = document.getElementById("toolsMenu");
const activeChip     = document.getElementById("activeToolChip");
const activeLabel    = document.getElementById("activeToolLabel");
const clearToolBtn   = document.getElementById("clearToolBtn");

// ── 상태 ──
const state = { messages: [], topic: "", activeTool: null, imageData: null, draftPrompt: "" };

// ── localStorage 세션 저장/복원 ──
function saveSession() {
  const session = {
    topic: state.topic,
    messages: state.messages,
    draftPrompt: state.draftPrompt,
    // 채팅 DOM을 텍스트로 직렬화
    chatHtml: chatEl.innerHTML,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s.topic) return;

    state.topic    = s.topic;
    state.messages = s.messages || [];
    state.draftPrompt = s.draftPrompt || "";

    topicEl.value   = s.topic;
    chatEl.innerHTML = s.chatHtml || "";
    chatEl.scrollTop = chatEl.scrollHeight;

    if (state.draftPrompt) finalEl.textContent = state.draftPrompt;
  } catch {}
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  state.topic = "";
  state.messages = [];
  state.draftPrompt = "";
  chatEl.innerHTML = "";
  topicEl.value = "";
  finalEl.textContent = "아직 비어 있습니다. 왼쪽에서 대화를 시작해 주세요.";
}

// ── 메시지 렌더 ──
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

// ── 모달 ──
function openModal() { modal.style.display = "flex"; redeemMsg.textContent = ""; }
function hideModal()  { modal.style.display = "none"; }

// ── prompt-box 로직 ──
function syncSendBtn() {
  sendBtn.disabled = !inputEl.value.trim() && !state.imageData;
}

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
  syncSendBtn();
});

attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onloadend = () => {
    state.imageData = reader.result;
    imgPreview.src  = reader.result;
    imgPreviewWrap.style.display = "block";
    syncSendBtn();
  };
  reader.readAsDataURL(file);
  fileInput.value = "";
});

removeImgBtn.addEventListener("click", () => {
  state.imageData = null;
  imgPreview.src  = "";
  imgPreviewWrap.style.display = "none";
  syncSendBtn();
});

// 도구 드롭업
toolsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = toolsMenu.style.display === "none" || !toolsMenu.style.display;
  toolsMenu.style.display = isHidden ? "flex" : "none";
  toolsMenu.style.flexDirection = "column";
});
document.addEventListener("click", () => { toolsMenu.style.display = "none"; });
toolsMenu.addEventListener("click", (e) => e.stopPropagation());

document.querySelectorAll(".pb-tool-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.activeTool = btn.dataset.tool;
    toolsMenu.style.display = "none";
    toolsBtn.style.display  = "none";
    activeLabel.textContent  = btn.dataset.short;
    activeChip.style.display = "flex";
  });
});

clearToolBtn.addEventListener("click", () => {
  state.activeTool = null;
  activeChip.style.display = "none";
  toolsBtn.style.display   = "flex";
});

// ── 대화 시작 ──
startBtn.addEventListener("click", () => {
  const topic = topicEl.value.trim();
  if (!topic) { topicEl.focus(); return; }
  clearSession();
  state.topic = topic;
  topicEl.value = topic;
  appendMsg("sys", `주제: "${topic}" — 대화를 시작합니다.`);
  sendToAI("");
});

newChatBtn.addEventListener("click", () => {
  if (state.messages.length && !confirm("현재 대화를 지우고 새로 시작할까요?")) return;
  clearSession();
  topicEl.focus();
});

// ── 폼 제출 ──
formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text && !state.imageData) return;
  if (!state.topic) { appendMsg("sys", "먼저 주제를 입력하고 '대화 시작'을 눌러 주세요."); return; }
  const toolPrefix = state.activeTool ? `[도구: ${state.activeTool}] ` : "";
  const fullText   = toolPrefix + text;
  inputEl.value    = "";
  inputEl.style.height = "auto";
  state.imageData  = null;
  imgPreviewWrap.style.display = "none";
  imgPreview.src   = "";
  syncSendBtn();
  sendToAI(fullText);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); formEl.requestSubmit(); }
});

// ── AI 호출 (사용량 제한 없음) ──
async function sendToAI(userText) {
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
      body: JSON.stringify({
        topic: state.topic,
        messages: state.messages,
        model: modelSelect ? modelSelect.value : "gemini-2.5-pro",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "AI 호출 실패");

    thinking.textContent = data.reply;
    state.messages.push({ role: "assistant", content: data.reply });

    const draft = extractDraftPrompt(data.reply);
    if (draft) {
      state.draftPrompt = draft;
      finalEl.textContent = draft;
    }

    saveSession(); // 매 턴마다 저장
  } catch (err) {
    thinking.textContent = `⚠️ ${err.message}`;
    saveSession();
  }
}

// ── 복사 ──
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(finalEl.textContent);
    copyBtn.textContent = "복사됨!";
    setTimeout(() => (copyBtn.textContent = "복사"), 1500);
  } catch {}
});

// ── 충전 모달 ──
buyBtn.addEventListener("click", openModal);
closeModal.addEventListener("click", hideModal);
modal.addEventListener("click", (e) => { if (e.target === modal) hideModal(); });

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
    redeemMsg.textContent = `✅ 충전 완료! (${data.credit}회)`;
    redeemInput.value = "";
    setTimeout(hideModal, 1200);
  } catch (err) {
    redeemMsg.textContent = `⚠️ ${err.message}`;
  }
});

// ── 페이지 로드 시 세션 복원 ──
loadSession();
