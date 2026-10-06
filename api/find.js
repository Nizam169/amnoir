/**
 * api/find.js — Vercel Edge Function
 *
 * Proxy SSE ke https://amfinder.web.id/api/find?url=...
 * Wajib runtime "edge" supaya streaming SSE tidak di-buffer/timeout 10s.
 *
 * Response: text/event-stream (diteruskan apa adanya) atau JSON saat error.
 */

export const config = {
  runtime: "edge",
};

const BASE_URL = "https://amfinder.web.id";
const UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

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

export default async function handler(req) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url") || "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!target) {
    return json({ ok: false, error: "parameter ?url= kosong. Contoh: /api/find?url=https://vt.tiktok.com/xxx" }, 400);
  }

  let upstream;
  try {
    upstream = await fetch(`${BASE_URL}/api/find?url=${encodeURIComponent(target)}`, {
      headers: { accept: "text/event-stream", "user-agent": UA },
    });
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
