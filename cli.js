#!/usr/bin/env node
/**
 * cli.js — pengganti test.js / amfinder.js
 *
 * Usage:
 *   node cli.js <link-tiktok>
 *
 * Output: JSON murni di stdout (log proses di stderr).
 * Logika parser SSE diimpor dari public/amfinder.js (sumbernya sama).
 */

import { fetchPreset } from "./public/amfinder.js";

const args = process.argv.slice(2);
if (!args.length || args.includes("-h") || args.includes("--help")) {
  console.log("Usage: node cli.js <link-tiktok>");
  console.log("Contoh: node cli.js https://vt.tiktok.com/ZSbmLgnUC/");
  process.exit(0);
}

const input = args.filter((a) => !a.startsWith("-"))[0];
if (!input) {
  console.log("Link TikTok tidak boleh kosong.");
  process.exit(1);
}

function info(msg) {
  process.stderr.write(`${msg}\n`);
}

async function main() {
  const r = await fetchPreset(input, (log) => info(`[proc] ${log}`));

  if (!r.ok) {
    process.stdout.write(JSON.stringify({ ok: false, error: r.error || "gagal" }, null, 2) + "\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
}

main().catch((e) => {
  info("[!] Error: " + e.message);
  process.exit(1);
});
