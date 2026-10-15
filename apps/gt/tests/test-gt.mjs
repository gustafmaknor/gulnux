// Testar Good Times från början till slut mot en låtsasapp (tests/maklarapp.mjs):
// en Chromium spelar Glome, GT lär sig appen, kopierar inloggningen, kör verktyg huvudlöst
// och live, hanterar utgången inloggning, MCP-servern och scheman.
//
//   GT_CHROMIUM=$(command -v chromium) node tests/test-gt.mjs
//
// Allt hamnar i en tillfällig katalog; inget i ditt riktiga repo eller din riktiga Glome.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GT = path.join(HERE, "..", "gt.mjs");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "gt-test-"));
const env = {
  ...process.env,
  GULNUX_PERSONAL: path.join(T, "repo"),
  XDG_DATA_HOME: path.join(T, "data"),
  XDG_STATE_HOME: path.join(T, "state"),
  XDG_CONFIG_HOME: path.join(T, "config"),
  GLOME_PORT: "9399",
  GT_PROMPTS: path.join(HERE, "..", "..", "..", "agent", "prompts"),
  GT_DRY: "1",
  GT_SYSTEMD_DIR: path.join(T, "units"),
  GULNUX_AGENT: "claude",
};
const chromium = process.env.GT_CHROMIUM;
assert.ok(chromium, "Sätt GT_CHROMIUM till en Chromium (t.ex. $(command -v chromium))");

const ok = (text) => console.log("OK  ", text);
const gt = (...args) => execFileSync(process.execPath, [GT, ...args], { env, encoding: "utf8" });
const gtFails = (...args) => {
  try {
    gt(...args);
  } catch (e) {
    return e.stderr.toString();
  }
  throw new Error(`gt ${args.join(" ")} borde ha misslyckats`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn(process.execPath, [path.join(HERE, "maklarapp.mjs")], { stdio: "ignore" });
const glome = spawn(chromium, ["--headless=new", "--remote-debugging-port=9399", `--user-data-dir=${path.join(T, "glome")}`,
  "--no-first-run", "http://localhost:9555/login?auto=1"], { stdio: "ignore" });

async function navigate(url) {
  const [page] = (await (await fetch("http://127.0.0.1:9399/json/list")).json()).filter((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url } }));
  await sleep(2500);
  ws.close();
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch("http://127.0.0.1:9399/json/version");
      break;
    } catch {
      await sleep(250);
    }
  }
  await sleep(2500);

  assert.match(JSON.parse(gt("learn", "--dry-run")).app, /^localhost$/);
  const dir = path.join(T, "repo", "gt", "localhost");
  for (const f of ["app.json", "SKILL.md", "tools/package.json"]) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const session = JSON.parse(fs.readFileSync(path.join(T, "data", "gt", "sessions", "localhost.json"), "utf8"));
  assert.ok(session.cookies.some((c) => c.name === "sid" && c.httpOnly), "httpOnly-kakan ska kopieras");
  assert.ok(session.origins[0].localStorage.some((l) => l.name === "token"), "localStorage ska kopieras");
  ok("gt learn skapar appen och kopierar inloggningen från Glome");

  fs.writeFileSync(path.join(dir, "tools", "till-salu.mjs"), `
export const meta = { description: "Objekt till salu" };
export async function run({ page, app }) {
  const svar = await page.request.get(app.origins[0] + "/api/objekt?status=till-salu");
  if (svar.status() === 401) throw Object.assign(new Error("utloggad"), { name: "SessionExpired" });
  const objekt = await svar.json();
  return { summary: objekt.length + " till salu", data: objekt };
}`);
  fs.writeFileSync(path.join(dir, "tools", "sidan.mjs"), `
export async function run({ page, app }) {
  await page.goto(app.origins[0] + "/objekt");
  return (await page.locator("li.objekt").count()) + " på sidan";
}`);
  fs.writeFileSync(path.join(dir, "tools", "pris.mjs"), `
export const meta = { writes: true, args: { id: { type: "number" }, pris: { type: "number" } } };
export async function run({ page, args, app }) {
  await page.request.post(app.origins[0] + "/api/objekt/pris", { data: args });
  return "ändrat";
}`);

  assert.equal(JSON.parse(gt("run", "localhost", "till-salu")).summary, "2 till salu");
  assert.equal(JSON.parse(gt("run", "localhost", "sidan")).summary, "3 på sidan");
  ok("verktyg körs huvudlöst med den delade inloggningen (API och gränssnitt)");

  assert.match(gtFails("run", "localhost", "pris", '{"id":1,"pris":1}'), /--yes/);
  assert.equal(JSON.parse(gt("run", "localhost", "pris", '{"id":1,"pris":1}', "--yes")).summary, "ändrat");
  ok("verktyg som ändrar data kräver --yes");

  await fetch("http://localhost:9555/admin/expire");
  assert.match(gtFails("run", "localhost", "till-salu"), /expired/);
  await navigate("http://localhost:9555/login?auto=1");
  assert.equal(JSON.parse(gt("run", "localhost", "till-salu")).summary, "2 till salu");
  ok("utgången inloggning: tydligt fel, och ny inloggning i Glome hämtas automatiskt");

  const pagesBefore = (await (await fetch("http://127.0.0.1:9399/json/list")).json()).filter((t) => t.type === "page").length;
  assert.equal(JSON.parse(gt("run", "localhost", "sidan", "--live")).summary, "3 på sidan");
  const pagesAfter = (await (await fetch("http://127.0.0.1:9399/json/list")).json()).filter((t) => t.type === "page").length;
  assert.equal(pagesAfter, pagesBefore, "live-körningen ska stänga sin flik men inte Glome");
  ok("--live kör i Glome och lämnar Glome orörd");

  const unit = (id, ext = "service") => fs.readFileSync(path.join(T, "units", `gt-localhost-${id}.${ext}`), "utf8");
  gt("schedule", "localhost", "till-salu", "Mon..Fri 08:00");
  assert.ok(unit("till-salu").includes("--notify") && !unit("till-salu").includes("--yes"));
  assert.match(gtFails("schedule", "localhost", "till-salu", "daily; rm -rf ~"), /not a valid time/);
  ok("schemaläggning av ett läsverktyg");

  assert.match(gtFails("schedule", "localhost", "pris", "2030-10-30 09:00", '{"id":1,"pris":3500000}', "--once"), /--yes/);
  assert.match(gt("schedule", "localhost", "pris", "2030-10-30 09:00", '{"id":1,"pris":3500000}', "--once", "--yes"), /runs once.*\(id pris\)/);
  assert.match(gt("schedule", "localhost", "pris", "Fri 09:00", '{"id":3,"pris":2600000}', "--yes"), /\(id pris-2\)/);
  assert.ok(unit("pris").includes("--yes") && unit("pris").includes("ExecStartPost=") && unit("pris").includes("unschedule localhost pris"));
  assert.ok(!unit("pris-2").includes("ExecStartPost="), "ett återkommande schema ska inte ta bort sig självt");
  assert.equal(JSON.parse(Buffer.from(/--args-base64 (\S+)/.exec(unit("pris-2"))[1], "base64").toString()).pris, 2600000);
  const lista = gt("schedule");
  assert.match(lista, /pris {2}2030-10-30 09:00 {2}\(once, changes data\)/);
  assert.match(lista, /pris-2 {2}Fri 09:00 {2}\(changes data\)/);
  ok("schemalagda handlingar: kräver --yes, engångs och återkommande, flera med samma verktyg");

  // Så som timern kör engångshandlingen: körningen lyckas, och schemat tar bort sig självt
  const exec = /ExecStart=\S+ (.+)/.exec(unit("pris"))[1].split(" ");
  gt(...exec);
  gt(...(/ExecStartPost=\S+ (.+)/.exec(unit("pris"))[1].split(" ")));
  assert.ok(!fs.existsSync(path.join(T, "units", "gt-localhost-pris.service")));
  assert.doesNotMatch(gt("schedule"), /pris {2}2030/);
  ok("en engångshandling körs och tar sedan bort sitt schema");

  assert.match(gtFails("unschedule", "localhost", "finns-inte"), /no schedule/);
  fs.rmSync(path.join(T, "units"), { recursive: true });
  assert.match(gt("sync"), /Created 2/);
  gt("unschedule", "localhost", "pris-2");
  gt("unschedule", "localhost", "till-salu");
  assert.equal(fs.readdirSync(path.join(T, "units")).length, 0);
  ok("gt sync återskapar scheman, unschedule tar bort dem");

  const mcp = spawn(process.execPath, [GT, "mcp"], { env, stdio: ["pipe", "pipe", "ignore"] });
  const replies = [];
  let buffer = "";
  mcp.stdout.on("data", (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      replies.push(JSON.parse(buffer.slice(0, i)));
      buffer = buffer.slice(i + 1);
    }
  });
  const send = (id, method, params) => mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  send(1, "initialize", {});
  send(2, "tools/list", {});
  send(3, "tools/call", { name: "run_tool", arguments: { app: "localhost", tool: "till-salu" } });
  send(4, "tools/call", { name: "run_tool", arguments: { app: "localhost", tool: "pris", args: { id: 1, pris: 2 } } });
  const action = { app: "localhost", tool: "pris", when: "2030-11-01 10:00", args: { id: 2, pris: 5100000 }, once: true };
  send(5, "tools/call", { name: "schedule", arguments: action });
  send(6, "tools/call", { name: "schedule", arguments: { ...action, confirm: true } });
  for (let i = 0; i < 80 && replies.length < 6; i++) await sleep(250);
  mcp.kill();
  const byId = Object.fromEntries(replies.map((r) => [r.id, r]));
  assert.ok(byId[2].result.tools.some((t) => t.name === "run_tool"));
  assert.equal(JSON.parse(byId[3].result.content[0].text).summary, "2 till salu");
  assert.ok(byId[4].result.isError, "skrivverktyg utan confirm ska nekas via MCP");
  assert.ok(byId[5].result.isError, "en schemalagd handling utan confirm ska nekas via MCP");
  assert.equal(JSON.parse(byId[6].result.content[0].text).once, true);
  assert.ok(unit("pris").includes("--yes"));
  ok("MCP-servern, även schemalagda handlingar");

  console.log("\nAlla tester gick igenom.");
} finally {
  glome.kill();
  app.kill();
}
