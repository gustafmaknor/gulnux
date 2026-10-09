// Good Times – gemensamma sökvägar och hantering av appar som GT har lärt sig.
//
// En app är en mapp i det personliga repot, gt/<namn>/, med app.json, SKILL.md, notes/ och
// tools/. Inloggningen ligger utanför repot, i ~/.local/share/gt/sessions/<namn>.json.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOME = os.homedir();
export const REPO = process.env.GULNUX_PERSONAL || path.join(HOME, "gulnux-personal");
export const APPS = path.join(REPO, "gt");
export const DATA = path.join(process.env.XDG_DATA_HOME || path.join(HOME, ".local", "share"), "gt");
export const STATE = path.join(process.env.XDG_STATE_HOME || path.join(HOME, ".local", "state"), "gt");
export const CONFIG = process.env.XDG_CONFIG_HOME || path.join(HOME, ".config");
export const GLOME = `http://127.0.0.1:${process.env.GLOME_PORT || "9222"}`;

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export class GtError extends Error {}

export function checkName(name, what = "name") {
  if (!NAME.test(name || "")) throw new GtError(`Invalid ${what} "${name}" (use a-z, 0-9 and -)`);
  return name;
}

// "app.example.se" → "app-example", "www.vitecexpress.se" → "vitecexpress"
export function slugFromUrl(url) {
  const labels = new URL(url).hostname.replace(/^www\./, "").split(".");
  if (labels.length > 1) labels.pop();
  return labels.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

// Inloggningskakor ligger ofta på huvuddomänen (login.example.se, app.example.se → example.se)
export function guessDomain(url) {
  const host = new URL(url).hostname;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return host; // IP-adress
  const labels = host.split(".");
  return labels.length > 2 ? labels.slice(-2).join(".") : host;
}

export function loadApp(name) {
  checkName(name, "app name");
  const dir = path.join(APPS, name);
  const file = path.join(dir, "app.json");
  if (!fs.existsSync(file)) throw new GtError(`GT has not learned an app called "${name}" – see: gt apps`);
  return { origins: [], domains: [], loginPatterns: [], schedules: [], ...JSON.parse(fs.readFileSync(file, "utf8")), name, dir };
}

export function saveApp(app) {
  const { name, dir, ...data } = app;
  fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify(data, null, 2) + "\n");
}

export function listApps() {
  if (!fs.existsSync(APPS)) return [];
  return fs.readdirSync(APPS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && NAME.test(d.name) && fs.existsSync(path.join(APPS, d.name, "app.json")))
    .map((d) => loadApp(d.name));
}

export function findAppByUrl(url) {
  const origin = new URL(url).origin;
  return listApps().find((app) => app.origins.includes(origin));
}

export function createApp(url, title) {
  const u = new URL(url);
  const base = slugFromUrl(url);
  let name = base;
  for (let n = 2; fs.existsSync(path.join(APPS, name)); n++) name = `${base}-${n}`;
  const dir = path.join(APPS, name);
  fs.mkdirSync(path.join(dir, "notes"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tools"), { recursive: true });

  const app = {
    name,
    dir,
    title: (title || "").trim().slice(0, 60) || u.hostname,
    startUrl: url,
    origins: [u.origin],
    domains: [guessDomain(url)],
    loginPatterns: ["/login", "/signin", "/sign-in", "/logga-in", "/auth"],
    schedules: [],
    created: new Date().toISOString(),
  };
  saveApp(app);
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---
name: gt-${name}
description: Good Times-kunskap om ${app.title} (${u.origin}) – hur appen fungerar och verktyg som utför användarens uppgifter i den. Använd när användaren vill göra något i ${app.title}.
---

# ${app.title}

(GT har inte lärt sig appen än. Kör \`gt learn ${url}\` eller tryck på GT-knappen i Glome.)

## Verktyg

Kör med \`gt run ${name} <verktyg> '<json>'\` eller med MCP-servern \`gt\` (\`run_tool\`).
Verktyg som ändrar data kräver att användaren godkänt det först.
`);
  fs.writeFileSync(path.join(dir, "tools", "package.json"),
    JSON.stringify({ name: `gt-${name}-tools`, private: true, type: "module", dependencies: {} }, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tools", ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(dir, "notes", ".gitkeep"), "");
  return loadApp(name);
}

export function sessionFile(app) {
  return path.join(DATA, "sessions", `${app.name}.json`);
}

export function toolNames(app) {
  const dir = path.join(app.dir, "tools");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4)).filter((n) => NAME.test(n)).sort();
}

export function agentName() {
  const file = path.join(CONFIG, "gulnux", "agent");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  if (process.env.GULNUX_AGENT) return process.env.GULNUX_AGENT;
  try {
    return fs.readFileSync("/etc/gulnux/default-agent", "utf8").trim();
  } catch {
    return "claude";
  }
}
