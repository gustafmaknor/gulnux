// Låtsasapp för att testa Good Times: inloggning med kaka + localStorage, sidor och ett JSON-API.
import http from "node:http";
import crypto from "node:crypto";

const sessions = new Set();
let objekt = [
  { id: 1, adress: "Exempelgatan 1", status: "till-salu", pris: 3950000 },
  { id: 2, adress: "Provvägen 7", status: "såld", pris: 5200000 },
  { id: 3, adress: "Testtorget 3", status: "till-salu", pris: 2750000 },
];

function sid(req) {
  const m = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || "");
  return m && sessions.has(m[1]) ? m[1] : null;
}
const html = (res, body) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<!doctype html><meta charset="utf-8"><title>Mäklarappen</title>${body}`); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/login") {
    if (url.searchParams.has("auto")) {
      const id = crypto.randomBytes(8).toString("hex");
      sessions.add(id);
      res.writeHead(200, { "Set-Cookie": `sid=${id}; Path=/; HttpOnly; SameSite=Lax`, "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><title>Mäklarappen</title><script>localStorage.setItem("token","tok-${id}"); location.href="/objekt";</script>`);
      return;
    }
    return html(res, `<h1>Logga in</h1>`);
  }
  if (url.pathname === "/admin/expire") { sessions.clear(); res.end("ok"); return; }
  if (!sid(req)) {
    if (url.pathname.startsWith("/api/")) { res.writeHead(401); res.end("{}"); return; }
    res.writeHead(302, { Location: "/login" }); res.end(); return;
  }
  if (url.pathname === "/objekt") {
    return html(res, `<h1>Objekt</h1><ul>${objekt.map((o) => `<li class="objekt" data-status="${o.status}">${o.adress} – ${o.status}</li>`).join("")}</ul>`);
  }
  if (url.pathname === "/api/objekt") {
    const status = url.searchParams.get("status");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(objekt.filter((o) => !status || o.status === status)));
    return;
  }
  if (url.pathname === "/api/objekt/pris" && req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    const { id, pris } = JSON.parse(body);
    objekt = objekt.map((o) => (o.id === id ? { ...o, pris } : o));
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404); res.end();
}).listen(9555, "127.0.0.1", () => console.log("Mäklarappen på http://localhost:9555"));
