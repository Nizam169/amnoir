/**
 * api/suggest.js — Vercel Edge Function
 *
 * Provides live search suggestions for DJ / song / preset keywords.
 * Engine URL dibaca dari env var ENGINE_SUGGEST_URL.
 */

export const config = {
  runtime: "edge",
};

const ENGINE_SUGGEST_URL = process.env.ENGINE_SUGGEST_URL || "https://am.izzxd.my.id/api/suggest";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, user-agent",
};

export default async function handler(req) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const p = url.searchParams.get("p") || "tiktok";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!q.trim()) {
    return new Response(JSON.stringify({ ok: true, list: [] }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", ...CORS },
    });
  }

  try {
    const upstreamUrl = `${ENGINE_SUGGEST_URL}?q=${encodeURIComponent(q)}&p=${encodeURIComponent(p)}`;
    const res = await fetch(upstreamUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36",
        accept: "application/json",
      },
    });

    const data = await res.json().catch(() => ({ list: [] }));
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...CORS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: true, list: [] }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...CORS,
      },
    });
  }
}
