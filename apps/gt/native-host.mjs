// Glome-tilläggets väg in till GT (Chromium native messaging). Chromium startar programmet,
// skickar ett meddelande med fyra bytes längd följt av JSON, och väntar på ett svar i samma form.
// Bara tillägget med id:t i värdmanifestets allowed_origins kan nå hit.

import { spawn } from "node:child_process";
import { findAppByUrl, toolNames } from "./lib/core.mjs";

function readMessage() {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    process.stdin.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (buffer.length >= 4 + length) resolve(JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")));
      }
    });
    process.stdin.on("end", () => reject(new Error("no message")));
  });
}

function reply(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function answer(msg) {
  const url = String(msg.url || "");
  if (!/^https?:\/\//.test(url)) return { ok: false, message: "Good Times can only learn web apps" };
  const app = findAppByUrl(url);

  if (msg.action === "status") {
    return app
      ? { ok: true, known: true, message: `Good Times knows ${app.title} (${toolNames(app).length} tools) – click to teach it more` }
      : { ok: true, known: false, message: "Teach Good Times this app" };
  }
  if (msg.action === "learn") {
    // Lärsessionen ska leva vidare när Chromium stänger värdprogrammet
    const child = spawn(process.env.GT_BIN || "gt", ["learn", url], { detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true, known: Boolean(app), message: app ? `Continuing to learn ${app.title}` : "Good Times is starting to learn this app" };
  }
  return { ok: false, message: `Unknown action: ${msg.action}` };
}

readMessage()
  .then((msg) => reply(answer(msg)))
  .catch((e) => reply({ ok: false, message: e.message }))
  .finally(() => process.exit(0));
