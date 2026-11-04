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

// Engine upstream hanya di sisi server — bisa dioverride lewat env var.
const BASE_UPSTREAM = process.env.ENGINE_FALLBACK_URL || "https://amfinder.web.id";
const PRIMARY_ENGINE = process.env.ENGINE_PRIMARY_URL || "https://am.izzxd.my.id/api/find";
const ENGINE_SEARCH_URL = process.env.ENGINE_SEARCH_URL || "https://am.izzxd.my.id/api/search";
const ENGINE_SUGGEST_URL = process.env.ENGINE_SUGGEST_URL || "https://am.izzxd.my.id/api/suggest";
const UPSTREAM = `${BASE_UPSTREAM}/api/find`;
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function toHex(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function parseHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

let cachedToken = null;
let cachedExp = 0;
let pendingTokenPromise = null;

async function fetchSecurityToken() {
  const did = crypto.randomUUID();
  const step1Res = await fetch(`${BASE_UPSTREAM}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: BASE_UPSTREAM,
      referer: `${BASE_UPSTREAM}/`,
    },
    body: JSON.stringify({ did }),
  });

  const step1 = await step1Res.json().catch(() => ({}));
  if (!step1Res.ok || !step1.ok) {
    throw new Error(step1.error || `handshake step 1 failed (${step1Res.status})`);
  }

  const { cid, salt, ts, rounds } = step1;
  let hash = 0;
  for (let idx = 0; idx < salt.length; idx++) {
    hash = ((hash << 5) - hash + salt.charCodeAt(idx)) | 0;
  }
  const env = {
    c: hash || 1847291,
    sw: 1080,
    sh: 2400,
    cd: 24,
    dpr: 2.75,
    tz: "Asia/Jakarta",
    tzo: -420,
    hc: 8,
    mtp: 5,
    w: true,
    d: true,
  };

  const bsigRaw = `${cid}|${salt}|${env.c}|${env.sw}x${env.sh}|${env.cd}|${env.tz}|${env.tzo}|${env.hc}`;
  const bsigBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bsigRaw));
  const bsig = toHex(bsigBuf);

  const keyBytes = parseHex(salt);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  let data = new TextEncoder().encode(`${cid}|${did}|${ts}|${bsig}`);
  const roundsLimit = Math.max(1, Math.min(100000, Math.floor(rounds)));
  for (let i = 0; i < roundsLimit; i++) {
    data = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, data));
  }
  const proof = toHex(data);

  const step2Res = await fetch(`${BASE_UPSTREAM}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: BASE_UPSTREAM,
      referer: `${BASE_UPSTREAM}/`,
    },
    body: JSON.stringify({
      cid,
      did,
      ts,
      proof,
      bsig,
      env,
      score: 0,
      reasons: [],
    }),
  });

  const step2 = await step2Res.json().catch(() => ({}));
  if (!step2Res.ok || !step2.ok || !step2.token) {
    throw new Error(step2.error || `handshake step 2 failed (${step2Res.status})`);
  }

  cachedToken = step2.token;
  cachedExp = step2.exp || (Date.now() + 120000);
  return cachedToken;
}

async function getToken() {
  if (cachedToken && Date.now() < cachedExp - 15000) {
    return cachedToken;
  }
  if (!pendingTokenPromise) {
    pendingTokenPromise = fetchSecurityToken().finally(() => {
      pendingTokenPromise = null;
    });
  }
  return pendingTokenPromise;
}

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

async function handleHandshake(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, null, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, accept",
    });
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const upstreamRes = await fetch(`${BASE_UPSTREAM}/api/v/7f91a2e4`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": UA,
          origin: BASE_UPSTREAM,
          referer: `${BASE_UPSTREAM}/`,
        },
        body,
      });

      const data = await upstreamRes.json().catch(() => ({}));
      sendJson(res, upstreamRes.status, data);
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message });
    }
  });
}

function normalizeResult(j, target) {
  const presets = j.presets || j.presetLinks || [];
  return {
    ok: true,
    found: presets.length > 0,
    videoId: j.videoId || j.video?.id || "",
    videoUrl: j.video?.url || target,
    author: j.author?.nickname || j.author?.uniqueId || (typeof j.author === "string" ? j.author : ""),
    authorDetail: j.author || {},
    video: {
      id: j.video?.id || j.videoId || "",
      url: j.video?.url || target,
      description: j.video?.description || "",
      cover: j.video?.cover || "",
      playUrl: j.video?.src || j.video?.playUrl || "",
      playUrlNoWm: j.video?.src || j.video?.playUrlNoWm || "",
      embed: j.video?.embed || "",
      music: j.video?.music || null,
      stats: {
        views: j.video?.views || 0,
        likes: j.video?.likes || 0,
        comments: j.video?.comments || 0,
        shares: j.video?.shares || 0,
      },
    },
    checked: {
      description: true,
      bio: true,
      comments: j.scanned?.comments || 0,
      replies: j.scanned?.replies || 0,
    },
    presetLinks: presets.map((p) => ({
      type: (p.type || "5mb").toLowerCase(),
      url: p.url,
      title: p.title || (p.type === "xml" ? "XML Project File" : "5MB Alight Motion Preset"),
      size: p.size || null,
      thumb: p.thumb || "",
      source: p.source || "comment",
      detail: p.detail || "",
      pinned: !!p.pinned,
      verified: !!p.byAuthor,
    })),
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const target = (url.searchParams.get("url") || "").trim();

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

  // 1. Try Primary Engine
  try {
    const primaryRes = await fetch(`${PRIMARY_ENGINE}?url=${encodeURIComponent(target)}`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (primaryRes.ok) {
      const j = await primaryRes.json().catch(() => null);
      if (j && j.ok) {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });
        res.write(`event: log\ndata: [1/5] Membuka halaman video TikTok...\n\n`);
        res.write(`event: log\ndata: [2/5] Membaca data dan deskripsi video...\n\n`);
        res.write(`event: log\ndata: [3/5] Memeriksa tautan profil & bio...\n\n`);
        res.write(`event: log\ndata: [4/5] Memindai komentar & balasan (${j.scanned?.comments || 0} komentar)...\n\n`);
        res.write(`event: log\ndata: [5/5] Menyusun hasil ekstraksi preset...\n\n`);
        const normalized = normalizeResult(j, target);
        res.write(`event: result\ndata: ${JSON.stringify(normalized)}\n\n`);
        res.end();
        return;
      }
    }
  } catch {}

  // 2. Fallback Engine: amfinder.web.id
  let token = url.searchParams.get("t") || "";
  if (!token) {
    try {
      token = await getToken();
    } catch (e) {
      sendJson(res, 502, { ok: false, error: `gagal verifikasi keamanan scraper (${e.message})` });
      return;
    }
  }

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}?url=${encodeURIComponent(target)}&t=${encodeURIComponent(token)}`, {
      headers: {
        accept: "text/event-stream",
        "user-agent": UA,
        referer: `${BASE_UPSTREAM}/`,
      },
    });

    if (upstream.status === 403) {
      cachedToken = null;
      token = await fetchSecurityToken();
      upstream = await fetch(`${UPSTREAM}?url=${encodeURIComponent(target)}&t=${encodeURIComponent(token)}`, {
        headers: {
          accept: "text/event-stream",
          "user-agent": UA,
          referer: `${BASE_UPSTREAM}/`,
        },
      });
    }
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

async function handleSearch(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const q = url.searchParams.get("q") || "";
  const p = url.searchParams.get("p") || "tiktok";
  const cursor = url.searchParams.get("cursor") || "";

  if (req.method === "OPTIONS") {
    send(res, 204, null, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "accept, user-agent",
    });
    return;
  }

  if (!q.trim()) {
    sendJson(res, 400, { ok: false, error: "parameter ?q= kosong" });
    return;
  }

  try {
    const upstreamUrl = `${ENGINE_SEARCH_URL}?q=${encodeURIComponent(q)}&p=${encodeURIComponent(p)}${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
    }`;
    const upstreamRes = await fetch(upstreamUrl, { headers: { "user-agent": UA } });
    const data = await upstreamRes.json().catch(() => ({}));
    sendJson(res, upstreamRes.status, data);
  } catch (e) {
    sendJson(res, 502, { ok: false, error: e.message });
  }
}

async function handleSuggest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const q = url.searchParams.get("q") || "";
  const p = url.searchParams.get("p") || "tiktok";

  if (req.method === "OPTIONS") {
    send(res, 204, null, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "accept, user-agent",
    });
    return;
  }

  if (!q.trim()) {
    sendJson(res, 200, { ok: true, list: [] });
    return;
  }

  try {
    const upstreamUrl = `${ENGINE_SUGGEST_URL}?q=${encodeURIComponent(q)}&p=${encodeURIComponent(p)}`;
    const upstreamRes = await fetch(upstreamUrl, { headers: { "user-agent": UA } });
    const data = await upstreamRes.json().catch(() => ({ list: [] }));
    sendJson(res, upstreamRes.status, data);
  } catch {
    sendJson(res, 200, { ok: true, list: [] });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/find") return handleApi(req, res);
  if (url.pathname === "/api/search") return handleSearch(req, res);
  if (url.pathname === "/api/suggest") return handleSuggest(req, res);
  if (url.pathname === "/api/handshake") return handleHandshake(req, res);
  return handleStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AMNOIR dev server → http://localhost:${PORT}`);
  console.log(`(proxy /api/find → ${UPSTREAM})`);
});
