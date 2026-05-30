// AI 출처 검증 — 텍스트에서 URL/DOI/arXiv/ISBN/논문제목을 뽑아내 공개 API로 존재 여부 확인
// 무료, API 키 불필요 (Crossref, arXiv, Open Library, HEAD 요청)

const TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

// --- 파서 ---
function extractCandidates(text) {
  const found = [];
  const seen = new Set();
  const add = (type, value, raw) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ type, value, raw: raw || value });
  };

  // DOI (10.xxxx/...)
  const doiRe = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi;
  let m;
  while ((m = doiRe.exec(text)) !== null) {
    let doi = m[1].replace(/[.,;:)\]]+$/, "");
    add("doi", doi);
  }

  // arXiv (arXiv:2401.12345 or 2401.12345 standalone)
  const arxivRe = /arxiv[:\s]\s*(\d{4}\.\d{4,5})(v\d+)?/gi;
  while ((m = arxivRe.exec(text)) !== null) add("arxiv", m[1]);

  // ISBN (10 or 13 digits, possibly hyphenated)
  const isbnRe = /\b(?:ISBN[:\s-]*)?((?:97[89][-\s]?)?\d(?:[-\s]?\d){8,12}[\dXx])\b/g;
  while ((m = isbnRe.exec(text)) !== null) {
    const digits = m[1].replace(/[-\s]/g, "");
    if (digits.length === 10 || digits.length === 13) add("isbn", digits, m[1]);
  }

  // URL
  const urlRe = /https?:\/\/[^\s)"'<>]+/g;
  while ((m = urlRe.exec(text)) !== null) {
    let u = m[0].replace(/[.,;:)\]]+$/, "");
    // DOI URL은 doi로 처리
    const doiInUrl = u.match(/(?:doi\.org\/|dx\.doi\.org\/)(10\.\d{4,9}\/[^\s]+)/i);
    if (doiInUrl) add("doi", doiInUrl[1].replace(/[.,;:)\]]+$/, ""));
    else add("url", u);
  }

  // 논문 제목 추정: "큰따옴표" 안의 4단어+ 문자열
  const titleRe = /[""]([^""]{15,200})[""]|"([^"]{15,200})"/g;
  while ((m = titleRe.exec(text)) !== null) {
    const title = (m[1] || m[2]).trim();
    if (title.split(/\s+/).length >= 4) add("title", title);
  }

  return found;
}

// --- 개별 검증 함수 ---
async function verifyDOI(doi) {
  try {
    const r = await withTimeout(
      fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
        headers: { "User-Agent": "AIHelper-Verifier/1.0 (mailto:noreply@example.com)" },
      }),
      TIMEOUT_MS
    );
    if (r.status === 404) return { status: "not_found", detail: "Crossref에 등록되지 않은 DOI" };
    if (!r.ok) return { status: "unknown", detail: `Crossref HTTP ${r.status}` };
    const j = await r.json();
    const w = j.message;
    const title = (w.title && w.title[0]) || "(제목 없음)";
    const authors = (w.author || []).map((a) => `${a.family || ""} ${a.given || ""}`.trim()).join(", ");
    const year = w.issued?.["date-parts"]?.[0]?.[0];
    const venue = w["container-title"]?.[0] || "";
    return {
      status: "verified",
      detail: `${title}${authors ? " — " + authors : ""}${year ? " (" + year + ")" : ""}${venue ? " · " + venue : ""}`,
      link: `https://doi.org/${doi}`,
    };
  } catch (e) {
    return { status: "unknown", detail: e.message };
  }
}

async function verifyArxiv(id) {
  try {
    const r = await withTimeout(
      fetch(`https://export.arxiv.org/api/query?id_list=${id}`),
      TIMEOUT_MS
    );
    if (!r.ok) return { status: "unknown", detail: `arXiv HTTP ${r.status}` };
    const xml = await r.text();
    if (/<entry>/.test(xml) && !/Error/.test(xml)) {
      const title = (xml.match(/<title>([\s\S]*?)<\/title>/g) || [])[1];
      const t = title ? title.replace(/<\/?title>/g, "").trim().replace(/\s+/g, " ") : "(제목 없음)";
      return { status: "verified", detail: t, link: `https://arxiv.org/abs/${id}` };
    }
    return { status: "not_found", detail: "arXiv에 해당 ID 없음" };
  } catch (e) {
    return { status: "unknown", detail: e.message };
  }
}

async function verifyISBN(isbn) {
  try {
    const r = await withTimeout(
      fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
      TIMEOUT_MS
    );
    if (!r.ok) return { status: "unknown", detail: `Open Library HTTP ${r.status}` };
    const j = await r.json();
    const key = `ISBN:${isbn}`;
    if (j[key]) {
      const b = j[key];
      const authors = (b.authors || []).map((a) => a.name).join(", ");
      return {
        status: "verified",
        detail: `${b.title || "(제목 없음)"}${authors ? " — " + authors : ""}${b.publish_date ? " (" + b.publish_date + ")" : ""}`,
        link: b.url,
      };
    }
    return { status: "not_found", detail: "Open Library에 등록되지 않은 ISBN" };
  } catch (e) {
    return { status: "unknown", detail: e.message };
  }
}

async function verifyURL(url) {
  try {
    let r = await withTimeout(fetch(url, { method: "HEAD", redirect: "follow" }), TIMEOUT_MS);
    if (r.status === 405 || r.status === 403) {
      // HEAD 거부 → GET 재시도
      r = await withTimeout(fetch(url, { method: "GET", redirect: "follow" }), TIMEOUT_MS);
    }
    if (r.ok) return { status: "verified", detail: `HTTP ${r.status} OK`, link: url };
    if (r.status === 404 || r.status === 410)
      return { status: "not_found", detail: `HTTP ${r.status}` };
    return { status: "unknown", detail: `HTTP ${r.status}` };
  } catch (e) {
    return { status: "not_found", detail: "도달 불가: " + e.message };
  }
}

async function verifyTitle(title) {
  try {
    const r = await withTimeout(
      fetch(
        `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1&select=title,author,issued,DOI`,
        { headers: { "User-Agent": "AIHelper-Verifier/1.0" } }
      ),
      TIMEOUT_MS
    );
    if (!r.ok) return { status: "unknown", detail: `Crossref HTTP ${r.status}` };
    const j = await r.json();
    const hit = j.message?.items?.[0];
    if (!hit) return { status: "not_found", detail: "Crossref 검색 결과 없음" };
    const hitTitle = (hit.title?.[0] || "").toLowerCase();
    const q = title.toLowerCase();
    // 유사도 간단 체크: 입력 단어의 60% 이상이 결과 제목에 등장
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    const matched = words.filter((w) => hitTitle.includes(w)).length;
    const ratio = words.length ? matched / words.length : 0;
    if (ratio < 0.5) {
      return {
        status: "not_found",
        detail: `근접 결과 없음 (가장 가까운 제목: "${hit.title?.[0]}")`,
      };
    }
    return {
      status: "verified",
      detail: `${hit.title[0]}${hit.author ? " — " + hit.author.map((a) => a.family).join(", ") : ""}`,
      link: hit.DOI ? `https://doi.org/${hit.DOI}` : undefined,
    };
  } catch (e) {
    return { status: "unknown", detail: e.message };
  }
}

const VERIFIERS = {
  doi: verifyDOI,
  arxiv: verifyArxiv,
  isbn: verifyISBN,
  url: verifyURL,
  title: verifyTitle,
};

async function extractCandidatesWithGemini(text, apiKey) {
  try {
    const prompt = `사용자가 입력한 텍스트에서 개별 논문, 도서, 학술 문서 등의 출처들을 구별하고, 검증(API 검색) 가능한 정보만 정밀하게 추출해서 JSON 배열로 반환하세요.
주변에 번호나 저자명, 연도 등이 지저분하게 섞여 있다면 핵심 제목(title)이나 식별자(DOI, arXiv, ISBN, URL)만 깔끔하게 정제해 주세요.

유형(type)은 다음 중 하나로 지정하세요:
1. "doi": DOI 식별자 값만 추출 (예: 10.1016/j.cell.2019.01.001)
2. "arxiv": arXiv ID 숫자만 추출 (예: 1706.03762)
3. "isbn": ISBN 10자리 또는 13자리 숫자만 추출 (예: 9788912345678)
4. "url": 일반 웹사이트 링크 (예: https://example.com)
5. "title": 논문 또는 책의 제목만 깨끗하게 추출 (저자나 학회명, 연도는 제거하고 순수 제목만 넣을 것, 예: "Attention is all you need")

주의: 
- 텍스트 안에 여러 개의 논문/출처가 들어 있다면 각각 객체로 분리하세요.
- 불필요한 서사나 설명 없이 오직 아래 형식의 JSON 배열만 반환하세요:
[
  {"type": "유형", "value": "추출한 값"}
]`;

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${prompt}\n\n사용자 입력 텍스트:\n${text}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });
    if (!r.ok) throw new Error("Gemini parser failed");
    const data = await r.json();
    const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textOut) {
      const parsed = JSON.parse(textOut.trim());
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          type: item.type,
          value: item.value,
          raw: item.value
        }));
      }
    }
  } catch (e) {
    console.error("Gemini parser error, falling back to regex:", e);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { text = "" } = req.body || {};
  if (!text.trim()) {
    res.status(400).json({ error: "검증할 텍스트를 입력해 주세요." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  let candidates = null;
  if (apiKey) {
    candidates = await extractCandidatesWithGemini(text, apiKey);
  }
  if (!candidates || candidates.length === 0) {
    candidates = extractCandidates(text);
  }

  if (candidates.length === 0) {
    res.status(200).json({ candidates: [], results: [] });
    return;
  }

  // 최대 20개까지만 (남용 방지)
  const limited = candidates.slice(0, 20);

  const results = await Promise.all(
    limited.map(async (c) => {
      const fn = VERIFIERS[c.type];
      const out = fn ? await fn(c.value) : { status: "unknown", detail: "검증기 없음" };
      return { ...c, ...out };
    })
  );

  res.status(200).json({ results });
}
