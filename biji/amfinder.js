/**
 * biji/amfinder.js — SSE parser client module
 *
 * Dipakai oleh:
 *   - biji/app.js    (web UI)
 *   - cli.js         (CLI)
 *
 * Semua request dikirim ke endpoint internal (/api/find, /api/handshake).
 * Upstream engine hanya diketahui di sisi server — tidak ada di file public.
 *
 * API:
 *   fetchPreset(url, onLog) -> Promise<result>
 *     onLog(msg) dipanggil untuk setiap event "log" (progress proses).
 */

const BASE_URL =
  typeof window === "undefined"
    ? process.env.AMNOIR_API || "https://www.amnoir.my.id/api/find"
    : window.__AMFINDER_API__ || "/api/find";

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

function getCanvasChecksum(salt) {
  if (typeof document === "undefined") return 0;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const col1 = "#" + (salt.slice(0, 6) || "3b82f6");
    const col2 = "#" + (salt.slice(6, 12) || "10b981");
    const grad = ctx.createLinearGradient(0, 0, 128, 48);
    grad.addColorStop(0, col1);
    grad.addColorStop(1, col2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 48);
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("AM:" + salt.slice(0, 8), 10, 28);
    ctx.beginPath();
    ctx.arc(100, 24, 12, 0, 2 * Math.PI);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2;
    ctx.stroke();
    const imgData = ctx.getImageData(0, 0, 128, 48).data;
    let checksum = 0;
    for (let i = 0; i < imgData.length; i += 4) {
      checksum = ((checksum << 5) - checksum + imgData[i] + imgData[i + 1] + imgData[i + 2]) | 0;
    }
    return checksum === 0 ? 1 : checksum;
  } catch {
    return 0;
  }
}

let browserTokenCache = null;
let browserTokenExp = 0;

async function getBrowserSecurityToken() {
  if (browserTokenCache && Date.now() < browserTokenExp - 15000) {
    return browserTokenCache;
  }

  const did = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

  const handshakeApi = window.__HANDSHAKE_API__ || "/api/handshake";
  const step1Res = await fetch(handshakeApi, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ did }),
  });

  const step1 = await step1Res.json();
  if (!step1.ok) throw new Error(step1.error || "Handshake step 1 failed");

  const { cid, salt, ts, rounds } = step1;
  const canvasVal = getCanvasChecksum(salt);
  const sw = typeof screen !== "undefined" && screen.width ? screen.width : 1080;
  const sh = typeof screen !== "undefined" && screen.height ? screen.height : 2400;
  const cd = typeof screen !== "undefined" && screen.colorDepth ? screen.colorDepth : 24;
  const dpr = window.devicePixelRatio || 1;
  let tz = "Asia/Jakarta";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";
  } catch {}
  const tzo = new Date().getTimezoneOffset();
  const hc = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 8;
  const mtp = typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;

  const env = {
    c: canvasVal,
    sw,
    sh,
    cd,
    dpr,
    tz,
    tzo,
    hc,
    mtp,
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

  const step2Res = await fetch(handshakeApi, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

  const step2 = await step2Res.json();
  if (!step2.ok || !step2.token) throw new Error(step2.error || "Handshake step 2 failed");

  browserTokenCache = step2.token;
  browserTokenExp = step2.exp || (Date.now() + 120000);
  return browserTokenCache;
}

async function fetchPreset(input, onLog) {
  // Semua mode (web maupun CLI) melewati endpoint internal / milik sendiri.
  // Engine upstream & token handshake diselesaikan di sisi server.
  let api = `${BASE_URL}?url=${encodeURIComponent(input)}`;

  if (typeof window !== "undefined") {
    try {
      const token = await getBrowserSecurityToken();
      if (token) api += `&t=${encodeURIComponent(token)}`;
    } catch {
      if (onLog) onLog("[info] handshake via server proxy");
    }
  }

  const res = await fetch(api, {
    headers: { accept: "text/event-stream" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      const j = JSON.parse(text);
      if (j && j.ok === false) throw new Error(j.error || "link video tidak valid");
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
        // buang warning internal node dari server scraper
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
