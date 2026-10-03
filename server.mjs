import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SpaceXAI } from "@xai-official/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const model = process.env.XAI_MODEL || "grok-4.7";
const imageModel = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0";
const defaultVoice = process.env.XAI_VOICE || "eve";
const maxBody = 32_000;
const maxPrompt = 8_000;
const maxSpeech = 4_000;
const maxImagePrompt = 4_000;

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

async function readJson(req) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    if (err && err.status === 413) {
      throw Object.assign(new Error("body too large"), { status: 413 });
    }
    throw err;
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

function requireClient(res) {
  const xai = getClient();
  if (!xai) {
    sendJson(res, 503, { error: "XAI_API_KEY is not set" });
    return null;
  }
  return xai;
}

function logFail(scope, err) {
  let message = err instanceof Error ? err.message : "unknown error";
  message = message.replace(/[A-Za-z0-9_\-]{24,}/g, "[redacted]");
  console.error(`${scope} failed:`, message.slice(0, 300));
}

function textField(payload, key, max) {
  const value = typeof payload[key] === "string" ? payload[key].trim() : "";
  if (!value) return { error: `${key} is required`, status: 400 };
  if (value.length > max) return { error: `${key} too long`, status: 400 };
  return { value };
}

async function handleChat(req, res) {
  const xai = requireClient(res);
  if (!xai) return;

  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    const status = err.status === 413 ? 413 : 400;
    sendJson(res, status, { error: status === 413 ? "body too large" : "invalid JSON" });
    return;
  }

  const prompt = textField(payload, "prompt", maxPrompt);
  if (prompt.error) {
    sendJson(res, prompt.status, { error: prompt.error });
    return;
  }

  try {
    const response = await xai.responses.create({ model, input: prompt.value });
    sendJson(res, 200, { reply: response.toText(), model });
  } catch (err) {
    logFail("chat", err);
    sendJson(res, 502, { error: "chat request failed" });
  }
}

function voiceIdOf(payload) {
  const raw = typeof payload.voice_id === "string" && payload.voice_id.trim()
    ? payload.voice_id.trim()
    : defaultVoice;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(raw)) return null;
  return raw;
}

function languageOf(payload) {
  const raw = typeof payload.language === "string" && payload.language.trim()
    ? payload.language.trim()
    : "en";
  if (raw === "auto") return raw;
  if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})?$/.test(raw)) return null;
  return raw;
}

async function handleVoice(req, res) {
  const xai = requireClient(res);
  if (!xai) return;

  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    const status = err.status === 413 ? 413 : 400;
    sendJson(res, status, { error: status === 413 ? "body too large" : "invalid JSON" });
    return;
  }

  const text = textField(payload, "text", maxSpeech);
  if (text.error) {
    sendJson(res, text.status, { error: text.error });
    return;
  }
  const voiceId = voiceIdOf(payload);
  const language = languageOf(payload);
  if (!voiceId || !language) {
    sendJson(res, 400, { error: "invalid voice_id or language" });
    return;
  }

  try {
    const speech = await xai.voice.speak({
      text: text.value,
      voice_id: voiceId,
      language,
      output_format: { codec: "mp3" },
    });
    const bytes = Buffer.from(await speech.bytes());
    res.writeHead(200, {
      "Content-Type": speech.contentType || "audio/mpeg",
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
      "X-Voice-Id": voiceId,
    });
    res.end(bytes);
  } catch (err) {
    logFail("voice", err);
    if (!res.headersSent) sendJson(res, 502, { error: "voice request failed" });
  }
}

async function handleImage(req, res) {
  const xai = requireClient(res);
  if (!xai) return;

  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    const status = err.status === 413 ? 413 : 400;
    sendJson(res, status, { error: status === 413 ? "body too large" : "invalid JSON" });
    return;
  }

  const prompt = textField(payload, "prompt", maxImagePrompt);
  if (prompt.error) {
    sendJson(res, prompt.status, { error: prompt.error });
    return;
  }

  try {
    const result = await xai.images.generate({
      model: imageModel,
      prompt: prompt.value,
      n: 1,
      response_format: "url",
    });
    const image = result.data?.[0];
    const url = image && typeof image.url === "string" ? image.url : "";
    if (!url) {
      sendJson(res, 502, { error: "image response had no url" });
      return;
    }
    sendJson(res, 200, { url, model: imageModel });
  } catch (err) {
    logFail("image", err);
    sendJson(res, 502, { error: "image request failed" });
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

const routes = {
  "/api/chat": handleChat,
  "/api/voice": handleVoice,
  "/api/image": handleImage,
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const handler = routes[url.pathname];
    if (handler) {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "POST JSON only" });
        return;
      }
      await handler(req, res);
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
