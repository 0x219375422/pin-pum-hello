import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SpaceXAI } from "@xai-official/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const model = process.env.XAI_MODEL || "grok-4.7";
const maxBody = 32_000;
const maxPrompt = 8_000;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

let client;

function getClient() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new SpaceXAI({ apiKey });
  return client;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBody) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  const xai = getClient();
  if (!xai) {
    sendJson(res, 503, { error: "XAI_API_KEY is not set" });
    return;
  }

  let payload;
  try {
    const raw = await readBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch (err) {
    const status = err.status === 413 ? 413 : 400;
    sendJson(res, status, { error: status === 413 ? "body too large" : "invalid JSON" });
    return;
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) {
    sendJson(res, 400, { error: "prompt is required" });
    return;
  }
  if (prompt.length > maxPrompt) {
    sendJson(res, 400, { error: "prompt too long" });
    return;
  }

  try {
    const response = await xai.responses.create({ model, input: prompt });
    sendJson(res, 200, { reply: response.toText(), model });
  } catch (err) {
    console.error("chat failed:", err instanceof Error ? err.message : "unknown error");
    sendJson(res, 502, { error: "chat request failed" });
  }
}

async function handleStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let filePath = url.pathname === "/" ? "/public/index.html" : url.pathname;
  if (filePath.includes("..") || !filePath.startsWith("/public/")) {
    res.writeHead(filePath.includes("..") ? 400 : 404).end("not found");
    return;
  }
  const abs = path.join(__dirname, filePath.replace(/^\//, ""));
  const data = await readFile(abs);
  const ext = path.extname(abs);
  res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/chat" && req.method === "POST") {
      await handleChat(req, res);
      return;
    }
    if (url.pathname === "/api/chat") {
      sendJson(res, 405, { error: "POST JSON {prompt} only" });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    await handleStatic(req, res);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      res.writeHead(404).end("not found");
      return;
    }
    console.error("request failed");
    if (!res.headersSent) res.writeHead(500).end("server error");
  }
});

server.listen(port, () => {
  console.log(`pin-pum-hello on http://127.0.0.1:${port}`);
});
