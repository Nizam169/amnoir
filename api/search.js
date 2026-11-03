/**
 * api/search.js — Vercel Edge Function
 *
 * Searches for preset videos on TikTok / YouTube by song name or keyword.
 * Proxies to upstream search engine: https://am.izzxd.my.id/api/search
 */

export const config = {
  runtime: "edge",
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, user-agent",
};

export default async function handler(req) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const p = url.searchParams.get("p") || "tiktok";
  const cursor = url.searchParams.get("cursor") || "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!q.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "parameter ?q= kosong" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8", ...CORS },
    });
  }

  try {
    const upstreamUrl = `https://am.izzxd.my.id/api/search?q=${encodeURIComponent(q)}&p=${encodeURIComponent(p)}${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
    }`;

    const res = await fetch(upstreamUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36",
        accept: "application/json",
      },
    });

    const data = await res.json().catch(() => ({}));
    return new Response(JSON.stringify(data), {
      status: res.status,
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
