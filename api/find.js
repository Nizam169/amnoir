/**
 * api/find.js — Vercel Edge Function
 *
 * Dual-Engine Alight Motion Preset Scraper:
 * 1. Primary Engine: https://am.izzxd.my.id/api/find (Fast, direct, accurate)
 * 2. Fallback Engine: https://amfinder.web.id/api/find (with automatic token challenge solver)
 *
 * Emits real-time SSE event stream for pipeline steps & terminal console.
 */

export const config = {
  runtime: "edge",
};

const BASE_FALLBACK = "https://amfinder.web.id";
const PRIMARY_ENGINE = "https://am.izzxd.my.id/api/find";
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
  const step1Res = await fetch(`${BASE_FALLBACK}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: BASE_FALLBACK,
      referer: `${BASE_FALLBACK}/`,
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

  const step2Res = await fetch(`${BASE_FALLBACK}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: BASE_FALLBACK,
      referer: `${BASE_FALLBACK}/`,
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

export default async function handler(req) {
  const url = new URL(req.url);
  const target = (url.searchParams.get("url") || "").trim();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!target) {
    return json({ ok: false, error: "parameter ?url= kosong. Contoh: /api/find?url=https://vt.tiktok.com/xxx" }, 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event, data) {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
      }

      try {
        sendEvent("log", "[1/5] Membuka halaman video TikTok...");

        // ==========================================
        // 1. PRIMARY ENGINE: am.izzxd.my.id
        // ==========================================
        let resolved = null;
        try {
          sendEvent("log", "[2/5] Membaca data dan deskripsi video...");
          const primaryRes = await fetch(`${PRIMARY_ENGINE}?url=${encodeURIComponent(target)}`, {
            headers: {
              "user-agent": UA,
              accept: "application/json",
            },
          });

          if (primaryRes.ok) {
            const j = await primaryRes.json().catch(() => null);
            if (j && j.ok) {
              sendEvent("log", "[3/5] Memeriksa tautan profil & bio...");
              sendEvent("log", `[4/5] Memindai komentar & balasan (${j.scanned?.comments || 0} komentar)...`);
              sendEvent("log", "[5/5] Menyusun hasil ekstraksi preset...");
              resolved = normalizeResult(j, target);
            }
          }
        } catch (e) {
          sendEvent("log", `[info] engine 1: ${e.message}, beralih ke engine cadangan...`);
        }

        // ==========================================
        // 2. FALLBACK ENGINE: amfinder.web.id (SSE)
        // ==========================================
        if (!resolved) {
          sendEvent("log", "[info] Mengaktifkan engine scraper sekunder...");
          let token = url.searchParams.get("t") || "";
          if (!token) {
            try {
              token = await getToken();
            } catch (e) {
              sendEvent("log", `[!] handshake failed: ${e.message}`);
            }
          }

          try {
            const fallbackRes = await fetch(`${BASE_FALLBACK}/api/find?url=${encodeURIComponent(target)}&t=${encodeURIComponent(token)}`, {
              headers: {
                accept: "text/event-stream",
                "user-agent": UA,
                referer: `${BASE_FALLBACK}/`,
              },
            });

            if (fallbackRes.ok && fallbackRes.body) {
              const reader = fallbackRes.body.getReader();
              const decoder = new TextDecoder();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
              return;
            }
          } catch (e) {
            sendEvent("log", `[!] fallback engine error: ${e.message}`);
          }
        }

        if (resolved) {
          sendEvent("result", resolved);
        } else {
          sendEvent("result", { ok: false, error: "Tidak ada preset yang ditemukan di video ini atau video tidak dapat diakses." });
        }
      } catch (err) {
        sendEvent("result", { ok: false, error: err.message || "Terjadi kesalahan sistem saat memproses video." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
