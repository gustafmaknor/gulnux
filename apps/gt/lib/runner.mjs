// Kör ett GT-verktyg: huvudlöst i Chromium med appens sparade inloggning, eller live i
// användarens Glome. Playwright installeras en gång i ~/.local/share/gt/runtime.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DATA, GLOME, GtError, checkName, sessionFile, toolNames } from "./core.mjs";
import { captureSession } from "./session.mjs";

const RUNTIME = path.join(DATA, "runtime");

function npm(args, cwd) {
  const win = process.platform === "win32";
  execFileSync(win ? "npm.cmd" : "npm", args, { cwd, stdio: ["ignore", "ignore", "inherit"], shell: win });
}

export function playwright() {
  const pkg = path.join(RUNTIME, "package.json");
  if (!fs.existsSync(path.join(RUNTIME, "node_modules", "playwright-core"))) {
    fs.mkdirSync(RUNTIME, { recursive: true });
    fs.writeFileSync(pkg, JSON.stringify({ private: true, dependencies: { "playwright-core": "^1" } }, null, 2));
    process.stderr.write("GT: installing the browser runtime (playwright-core), this happens once…\n");
    npm(["install", "--no-audit", "--no-fund", "--loglevel=error"], RUNTIME);
  }
  return createRequire(pkg)("playwright-core");
}

// Paket som verktygen själva behöver, utöver Playwright
function ensureToolDeps(app) {
  const dir = path.join(app.dir, "tools");
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return;
  const deps = JSON.parse(fs.readFileSync(file, "utf8")).dependencies || {};
  if (Object.keys(deps).length && !fs.existsSync(path.join(dir, "node_modules"))) {
    npm(["install", "--no-audit", "--no-fund", "--loglevel=error"], dir);
  }
}

export async function loadTool(app, name) {
  checkName(name, "tool name");
  const file = path.join(app.dir, "tools", `${name}.mjs`);
  if (!fs.existsSync(file)) throw new GtError(`${app.title} has no tool called "${name}" – see: gt tools ${app.name}`);
  // Frågesträngen gör att en ändrad fil läses in på nytt i en långlivad process (MCP)
  const mod = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`);
  if (typeof mod.run !== "function") throw new GtError(`tools/${name}.mjs exports no run() function`);
  return { name, meta: { args: {}, writes: false, ...(mod.meta || {}) }, run: mod.run };
}

export async function describeTools(app) {
  const tools = [];
  for (const name of toolNames(app)) {
    try {
      const { meta } = await loadTool(app, name);
      tools.push({ name, description: meta.description || "", args: meta.args, writes: Boolean(meta.writes) });
    } catch (e) {
      tools.push({ name, description: `(broken: ${e.message})`, args: {}, writes: false });
    }
  }
  return tools;
}

function looksLoggedOut(app, url) {
  try {
    const u = new URL(url);
    return app.origins.includes(u.origin) && app.loginPatterns.some((p) => u.pathname.toLowerCase().includes(p));
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, name) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new GtError(`${name} took longer than ${ms / 1000} s`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function normalize(result) {
  if (result === undefined || result === null) return { summary: "Done" };
  if (typeof result === "string") return { summary: result };
  return { summary: "Done", ...result };
}

export async function runTool(app, name, args = {}, { live = false, confirm = false, retried = false } = {}) {
  const tool = await loadTool(app, name);
  if (tool.meta.writes && !confirm) {
    throw new GtError(`${name} changes data in ${app.title}. Ask the user first, then run it with --yes (MCP: confirm: true).`);
  }
  ensureToolDeps(app);
  const { chromium } = playwright();

  let browser;
  let context;
  if (live) {
    browser = await chromium.connectOverCDP(GLOME).catch(() => {
      throw new GtError("Glome is not running – open it, or run without --live.");
    });
    [context] = browser.contexts();
  } else {
    if (!fs.existsSync(sessionFile(app))) await captureSession(app);
    browser = await chromium.launch({ executablePath: process.env.GT_CHROMIUM || undefined, headless: true });
    context = await browser.newContext({ storageState: sessionFile(app) });
  }

  const page = await context.newPage();
  const log = (...msg) => process.stderr.write(`[${name}] ${msg.join(" ")}\n`);
  let expired = false;
  try {
    const result = normalize(await withTimeout(tool.run({ page, context, args, app, log }), (tool.meta.timeout || 120) * 1000, name));
    if (!live && looksLoggedOut(app, page.url())) {
      expired = true;
    } else {
      if (!live) await context.storageState({ path: sessionFile(app) }); // spara förnyade kakor
      return result;
    }
  } catch (e) {
    if (e.name !== "SessionExpired" && !(!live && looksLoggedOut(app, page.url()))) throw e;
    expired = true;
  } finally {
    await page.close().catch(() => {});
    // För live kopplar close() bara ner från Glome; webbläsaren och flikarna stängs inte
    await browser.close().catch(() => {});
  }

  if (expired && !live && !retried) {
    // Försök en gång till med färsk inloggning från Glome
    await captureSession(app).catch(() => {});
    return runTool(app, name, args, { live, confirm, retried: true });
  }
  throw new GtError(`The login to ${app.title} has expired – log in again in Glome, then run: gt session ${app.name}`);
}
