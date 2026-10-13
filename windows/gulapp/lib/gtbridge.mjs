// GT-knappens brygga. GT-tillägget pratar med gt via native messaging, men jobbdatorer kan
// ha stängt av värdprogram på användarnivå med en policy (NativeMessagingUserLevelHosts).
// Då skickar tillägget samma meddelande hit, och bryggan kör samma värdprogram.
//
// Som Gulnux övriga lokala servrar: bara 127.0.0.1, rätt Host, bara GT-tilläggets Origin,
// och hela anropet läses innan något besvaras.

import { spawn } from "node:child_process";
import http from "node:http";
import { EXTENSIONS } from "./config.mjs";

export const BRIDGE_PORT = Number(process.env.GULAPP_GT_PORT || 9304);
const ORIGIN = `chrome-extension://${EXTENSIONS.gt.id}`;

// Kör värdprogrammet med ett meddelande i native messaging-form (längd + JSON)
function askHost(host, message) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(message));
    const head = Buffer.alloc(4);
    head.writeUInt32LE(body.length);
    const child = spawn(host.exe, host.args, { env: { ...process.env, ...host.env }, windowsHide: true });
    const out = [];
    child.stdout.on("data", (d) => out.push(d));
    child.on("error", reject);
    child.on("exit", () => {
      const buf = Buffer.concat(out);
      if (buf.length < 4) return reject(new Error("Good Times did not answer"));
      resolve(JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)).toString("utf8")));
    });
    child.stdin.end(Buffer.concat([head, body]));
  });
}

export function startBridge(host) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const send = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGIN });
        res.end(JSON.stringify(data));
      };
      if (req.headers.host !== `127.0.0.1:${BRIDGE_PORT}` || req.headers.origin !== ORIGIN) return send(403, { ok: false, message: "not allowed" });
      if (req.method !== "POST" || req.url !== "/gt") return send(404, { ok: false, message: "not found" });
      let message;
      try {
        message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(400, { ok: false, message: "bad request" });
      }
      if (!["status", "learn"].includes(message.action)) return send(400, { ok: false, message: "unknown action" });
      const cmd = typeof host === "function" ? host() : host;
      if (!cmd) return send(503, { ok: false, message: "Good Times needs Node.js" });
      try {
        send(200, await askHost(cmd, { action: message.action, url: String(message.url || ""), title: String(message.title || "") }));
      } catch (e) {
        send(500, { ok: false, message: e.message });
      }
    });
  });
  server.on("error", () => {}); // porten upptagen: knappen fungerar då bara med native messaging
  server.listen(BRIDGE_PORT, "127.0.0.1");
  return server;
}
