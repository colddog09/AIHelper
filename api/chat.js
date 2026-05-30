// Gemini API (무료 티어 사용 가능)
// 키 발급: https://aistudio.google.com/apikey

const SYSTEM_PROMPT = `너는 "프롬프트 진화 코치"다. 사용자가 AI(코딩 에이전트 포함)에게 시킬 작업을 더 명확하고 실행 가능한 프롬프트로 다듬도록 돕는다.

원칙:
1) 한 번에 1~3개의 핵심 질문만 던져 모호함을 좁힌다. (목표, 입력/출력, 제약, 성공 기준, 예시)
2) 매 턴마다 응답 끝에 현재까지 정리된 "초안 프롬프트"를 마크다운 코드블록으로 포함한다.
3) 사용자가 "최종" 또는 "완성"이라고 말하면, 더 묻지 말고 최종 프롬프트만 코드블록으로 출력한다.
4) 한국어로 간결하게 답한다.`;

const MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    return;
  }

  try {
    const { messages = [], topic = "" } = req.body || {};

    const sys = topic
      ? `${SYSTEM_PROMPT}\n\n사용자가 만들고자 하는 것: ${topic}`
      : SYSTEM_PROMPT;

    // Gemini 형식으로 변환: role "assistant" → "model"
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ error: data?.error?.message || "Gemini 호출 실패" });
      return;
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ||
      "(빈 응답)";

    res.status(200).json({ reply: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "AI call failed" });
  }
}
