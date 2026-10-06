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

async function fetchPreset(input, onLog) {
  const api = `${BASE_URL}?url=${encodeURIComponent(input)}`;
  const res = await fetch(api, {
    headers: { accept: "text/event-stream" },
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
