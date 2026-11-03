/**
 * biji/amfinder.js — SSE parser client module
 *
 * Dipakai oleh:
 *   - biji/app.js    (web UI)
 *   - cli.js         (CLI)
 *
 * API:
 *   fetchPreset(url, onLog) -> Promise<result>
 *     onLog(msg) dipanggil untuk setiap event "log" (progress proses).
 */

const BASE_URL =
  typeof window === "undefined"
    ? "https://amfinder.web.id/api/find"
    : window.__AMFINDER_API__ || "/api/find";

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

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

async function getSecurityToken() {
  const origin = "https://amfinder.web.id";
  const did = crypto.randomUUID();
  const step1Res = await fetch(`${origin}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin,
      referer: `${origin}/`,
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

  const step2Res = await fetch(`${origin}/api/v/7f91a2e4`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin,
      referer: `${origin}/`,
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

  return step2.token;
}

async function fetchPreset(input, onLog) {
  let api = `${BASE_URL}?url=${encodeURIComponent(input)}`;
  if (typeof window === "undefined" && BASE_URL.includes("amfinder.web.id")) {
    try {
      const token = await getSecurityToken();
      api += `&t=${encodeURIComponent(token)}`;
    } catch (e) {
      if (onLog) onLog(`[!] Warning handshake: ${e.message}`);
    }
  }

  const res = await fetch(api, {
    headers: {
      accept: "text/event-stream",
      "user-agent": UA,
      referer: "https://amfinder.web.id/",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      const j = JSON.parse(text);
      if (j && j.ok === false) throw new Error(j.error || "link TikTok tidak valid");
    } catch (e) {
      if (e && e.message) throw e;
    }
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let event = "message";
      const dataLines = [];
      for (const line of raw.split("\n")) {
        const m = line.match(/^(event|data):\s?(.*)$/);
        if (!m) continue;
        if (m[1] === "event") event = m[2];
        else dataLines.push(m[2]);
      }
      if (!dataLines.length) continue;
      const data = dataLines.join("\n");

      if (event === "log") {
        const msg = data.replace(/^"|"$/g, "");
        // buang warning internal node dari server upstream
        if (msg.startsWith("(node:") || msg.startsWith("Reparsing") || msg.startsWith("To eliminate") || msg.startsWith("(Use `node")) {
          continue;
        }
        if (onLog) onLog(msg);
      } else if (event === "result") {
        try {
          result = JSON.parse(data);
        } catch {
          if (onLog) onLog("[!] result tidak bisa di-parse sebagai JSON");
        }
      }
    }
  }

  if (!result) throw new Error("tidak ada event result dari server");
  return result;
}

export { fetchPreset };
