/**
 * api/find.js — Vercel Edge Function
 *
 * Proxy SSE ke https://amfinder.web.id/api/find?url=...&t=...
 * Wajib runtime "edge" supaya streaming SSE tidak di-buffer/timeout 10s.
 * Otomatis menangani handshake security token upstream (PoW challenge).
 *
 * Response: text/event-stream (diteruskan apa adanya) atau JSON saat error.
 */

export const config = {
  runtime: "edge",
};

const BASE_URL = "https://amfinder.web.id";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, user-agent",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

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
  const step1Res = await fetch(`${BASE_URL}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
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

  const step2Res = await fetch(`${BASE_URL}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
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

export default async function handler(req) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url") || "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!target) {
    return json({ ok: false, error: "parameter ?url= kosong. Contoh: /api/find?url=https://vt.tiktok.com/xxx" }, 400);
  }

  const clientToken = url.searchParams.get("t") || "";
  let token = clientToken;
  if (!token) {
    try {
      token = await getToken();
    } catch (e) {
      return json({ ok: false, error: `gagal verifikasi keamanan scraper (${e.message})` }, 502);
    }
  }

  let upstream;
  try {
    upstream = await fetch(`${BASE_URL}/api/find?url=${encodeURIComponent(target)}&t=${encodeURIComponent(token)}`, {
      headers: {
        accept: "text/event-stream",
        "user-agent": UA,
        referer: `${BASE_URL}/`,
      },
    });

    // Jika token kedaluwarsa atau ditolak 403, coba refresh token 1 kali
    if (upstream.status === 403) {
      cachedToken = null;
      token = await fetchSecurityToken();
      upstream = await fetch(`${BASE_URL}/api/find?url=${encodeURIComponent(target)}&t=${encodeURIComponent(token)}`, {
        headers: {
          accept: "text/event-stream",
          "user-agent": UA,
          referer: `${BASE_URL}/`,
        },
      });
    }
  } catch (e) {
    return json({ ok: false, error: `tidak bisa menghubungi server scraper (${e.message})` }, 502);
  }

  // error biasa (link tidak valid dll) -> JSON, teruskan apa adanya
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let msg = `HTTP ${upstream.status}`;
    try {
      const j = JSON.parse(text);
      if (j && j.ok === false) msg = j.error || msg;
    } catch {
      /* bukan JSON */
    }
    return json({ ok: false, error: msg }, upstream.status || 502);
  }

  // teruskan SSE stream ke klien
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...CORS,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
