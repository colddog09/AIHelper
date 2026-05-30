// 충전 코드 검증
// 환경변수 REDEEM_CODES 에 "CODE1:50,CODE2:100" 형식으로 등록
// (코드:충전회수). 사용 추적은 DB 없이는 불가하므로 1회용으로 운영하려면
// 코드를 한 사용자에게만 전달하고, 소진되면 환경변수에서 삭제하세요.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const raw = process.env.REDEEM_CODES || "";
  const codeMap = {};
  raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const [c, n] = pair.split(":");
    if (c) codeMap[c.toUpperCase()] = parseInt(n || "50", 10);
  });

  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ error: "코드를 입력해 주세요." });
    return;
  }
  const credit = codeMap[String(code).trim().toUpperCase()];
  if (!credit) {
    res.status(404).json({ error: "유효하지 않은 코드입니다." });
    return;
  }
  res.status(200).json({ credit });
}
