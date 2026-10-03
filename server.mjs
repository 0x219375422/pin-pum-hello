import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    let filePath = url.pathname === "/" ? "/public/index.html" : url.pathname;
    if (filePath.includes("..")) {
      res.writeHead(400).end("bad path");
      return;
    }
    const abs = path.join(__dirname, filePath.replace(/^\//, ""));
    const data = await readFile(abs);
    const ext = path.extname(abs);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, () => {
  console.log(`pin-pum-hello on http://127.0.0.1:${port}`);
});
