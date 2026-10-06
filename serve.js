#!/usr/bin/env node
/**
 * serve.js — dev server lokal (mock perilaku Vercel Edge Function)
 *
 * Menyajikan folder biji/ dan memproksi /api/find -> server scraper
 * dengan streaming SSE, persis seperti di Vercel nanti.
 *
 * Jalankan: npm run dev   (atau node serve.js)
 * Buka:     http://localhost:3000
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "biji");
const PORT = process.env.PORT || 3000;
const UPSTREAM = "https://amfinder.web.id/api/find";
const UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj, extra = {}) {
  send(res, status, JSON.stringify(obj), {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    ...extra,
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const target = url.searchParams.get("url") || "";

  if (req.method === "OPTIONS") {
    send(res, 204, null, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "accept, user-agent",
    });
    return;
  }

  if (!target) {
    sendJson(res, 400, { ok: false, error: "parameter ?url= kosong. Contoh: /api/find?url=https://vt.tiktok.com/xxx" });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}?url=${encodeURIComponent(target)}`, {
      headers: { accept: "text/event-stream", "user-agent": UA },
    });
  } catch (e) {
    sendJson(res, 502, { ok: false, error: `tidak bisa menghubungi server scraper (${e.message})` });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let msg = `HTTP ${upstream.status}`;
    try {
      const j = JSON.parse(text);
      if (j && j.ok === false) msg = j.error || msg;
    } catch {
      /* bukan JSON */
    }
    sendJson(res, upstream.status || 502, { ok: false, error: msg });
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch {
    /* klien terputus */
  }
  res.end();
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { "content-type": MIME[ext] || "application/octet-stream" });
  } catch {
    send(res, 404, "404 Not Found");
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/find") return handleApi(req, res);
  return handleStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AMNOIR dev server → http://localhost:${PORT}`);
  console.log(`(proxy /api/find → ${UPSTREAM})`);
});
