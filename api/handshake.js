/**
 * api/handshake.js — Vercel Edge Function
 *
 * Proxies the security challenge handshake to the upstream scraper.
 * Engine URL dibaca dari env var ENGINE_HANDSHAKE_URL.
 */

export const config = {
  runtime: "edge",
};

const BASE_URL = process.env.ENGINE_FALLBACK_URL || "https://amfinder.web.id";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", ...CORS },
    });
  }

  try {
    const body = await req.json();
    const upstreamRes = await fetch(`${BASE_URL}/api/v/7f91a2e4`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": req.headers.get("user-agent") || UA,
        origin: BASE_URL,
        referer: `${BASE_URL}/`,
      },
      body: JSON.stringify(body),
    });

    const data = await upstreamRes.json().catch(() => ({}));
    return new Response(JSON.stringify(data), {
      status: upstreamRes.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...CORS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...CORS,
      },
    });
  }
}
