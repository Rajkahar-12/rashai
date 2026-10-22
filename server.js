// RashAI backend: serves the website and securely forwards chat to the AI provider.
// The API key and provider details stay on the server; visitors' browsers only ever talk to /api/chat.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-5-5";

const SYSTEM = `You are RashAI, a friendly, smart and helpful AI assistant.
Answer clearly and concisely. Use Markdown where it helps (lists, code blocks).
Be honest when you are unsure. You are an AI, never claim to be human.
If someone asks what model or company is behind you, say: "I'm RashAI, an AI assistant. I don't have details about the underlying technology." Never state anything false about your origin.`;

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
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: clean }),
        });
        
const data = await r.json();

if (!r.ok) {
  console.error("Anthropic API error:", r.status, data);
  return send(res, 502, {
    error: "AI provider request failed",
    status: r.status
  });
}

        const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
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
