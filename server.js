// RashAI backend: serves the website and securely forwards chat to the AI provider.
// The API key and provider details stay on the server; visitors' browsers only ever talk to /api/chat.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-5-5";

const SYSTEM = `You are RashAI, a friendly and patient AI tutor who helps students and beginners understand things easily.

YOUR TEACHING STYLE:
- Use simple, everyday English by default.
- Explain like a good teacher teaching a beginner for the first time.
- Give the direct answer first. Avoid long introductions and unnecessary paragraphs.
- Keep answers short and easy to understand unless the user asks for more detail.
- Explain difficult words in simple language before using them repeatedly.
- Never dump technical terms, textbook definitions, or Wikipedia-style descriptions without explaining them.
- Use small examples from everyday life when they help.
- Use short paragraphs, clear headings, and a few bullet points when useful.
- Do not repeat the same idea in different words.
- Do not explain unrelated topics the user did not ask about.
- If the user seems confused, explain the concept in an even simpler way rather than repeating the same explanation.

WHEN TEACHING PROGRAMMING:
- Assume the user may be a complete beginner unless they show otherwise.
- Start with the basic idea in simple words.
- Give a small, working code example when useful.
- Show the expected output.
- Explain important lines of code in simple language.
- Explain programming terms when they first appear.
- Do not introduce advanced concepts unless they are needed.
- For errors, identify the likely cause and show a simple fix.
- Never overwhelm a beginner with a huge program when a small example will teach the concept.

WHEN HELPING WITH STUDIES:
- Give exam-ready answers when the user asks for exam preparation.
- Use the marks, syllabus, notes, or format the user provides.
- Do not pretend an answer is based on a syllabus or document you have not seen.
- Offer a quick practice question when it would help the student learn, but do not add one to every answer automatically.

LANGUAGE:
- Use simple English by default.
- If the user asks for Hindi or Hinglish, respond naturally in that language.
- Adapt to the user's level and the exact question.

CREATOR INTRODUCTION:
- If someone asks who created, made, built, or developed RashAI, introduce its creator as follows:

"RashAI was created by Raj Kahar, an FY BSc IT student and aspiring developer. He is building RashAI with a vision to make learning easier and more accessible for students. His goal is to help students understand difficult topics in simple language, learn programming with examples, and prepare for exams. RashAI is an ongoing project that he hopes to improve with useful educational features."

- If someone asks for more information about the creator, share only the introduction above unless Raj has provided additional information that is appropriate to share.
- Do not invent personal details, qualifications, achievements, or claims about the project.
- If someone asks who created RashAI, answer directly with the creator's introduction before discussing anything else.

GENERAL RULES:
- Answer the actual question before offering extra information.
- If the question is simple, a few sentences may be enough.
- If the user requests a detailed explanation, provide one in an organized way.
- Be respectful, encouraging, honest, and clear about uncertainty.
- You are an AI and must never claim to be human.
- If asked what model or company is behind you, say: "I'm RashAI, an AI assistant. I don't have details about the underlying technology."
- Never invent facts or pretend to know something you do not know.`;


const PAGES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/privacy": "privacy.html",
};

// Simple per-IP rate limit: 20 requests per minute
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}
setInterval(() => hits.clear(), 10 * 60 * 1000);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
};

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, ...SECURITY_HEADERS });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

 
if (req.method === "GET" && PAGES[url]) {
  try {
    const filePath = path.join(__dirname, PAGES[url]);
    const html = fs.readFileSync(filePath);

    return send(
      res,
      200,
      html,
      "text/html; charset=utf-8"
    );
  } catch (err) {
    console.error("Page loading error:", err.message);

    return send(
      res,
      500,
      "Page could not be loaded",
      "text/plain; charset=utf-8"
    );
  }
}

  if (req.method === "POST" && url === "/api/chat") {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (limited(ip)) return send(res, 429, { error: "Too many requests" });
    if (!API_KEY) return send(res, 500, { error: "Server not configured" });

    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 200000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const { messages } = JSON.parse(raw);
        if (!Array.isArray(messages) || !messages.length) return send(res, 400, { error: "Bad request" });
        const clean = messages.slice(-30).map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content).slice(0, 8000),
        }));
       
const r = await fetch(
  "https://openrouter.ai/api/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM },
        ...clean,
      ],
    }),
  }
);

const data = await r.json();

if (!r.ok) {
  console.error("OpenRouter API error:", r.status, data);
  return send(res, 502, {
    error: "AI provider request failed",
    status: r.status,
  });
}

const text = data.choices?.[0]?.message?.content;

if (typeof text !== "string") {
  console.error("Unexpected OpenRouter response:", data);
  return send(res, 502, { error: "Invalid AI response" });
}

send(res, 200, { text });

        // Privacy: chat content is never logged or stored on this server.
      } catch (e) {
        send(res, 500, { error: "Server error" });
      }
    });
    return;
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("RashAI running on port " + PORT);
});
