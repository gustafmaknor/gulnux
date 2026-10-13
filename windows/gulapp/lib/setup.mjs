// Gulapps installation på användarnivå (utan administratörsrättigheter): kommandona i PATH,
// GT-knappens väg in från Glome (native messaging), Python-miljön för sökningen, Greed och
// Gloffice, sökningens inställningar och det personliga repot. Allt går att köra om.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  BIN, CONFIG, EXTENSIONS, LOCAL_DIR, PYTHON_ENV, REPO, browserPath, nodePath, pythonPath,
  readJson, saveSettings, settings, uvPath, which, writeJson,
} from "./config.mjs";
import { commands, writeShims } from "./commands.mjs";

// Paketen som Nix ger Python-apparna på Gulnux (modules/gulnux/{search,greed,gloffice}.nix)
export const PYTHON_PACKAGES = ["python-docx", "openpyxl", "python-pptx", "pypdf", "sqlite-vec", "feedparser", "trafilatura"];

const DRY = Boolean(process.env.GULAPP_DRY); // tester: rör inte registret

function powershell(script, env = {}) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  }).trim();
}

// Lägg Gulapps bin-katalog först i användarens PATH (gäller nya terminaler)
export function addToPath() {
  if (DRY) return false;
  return powershell(`
$p = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = @($p -split ';' | Where-Object { $_ })
if ($parts -notcontains $env:GULAPP_BIN) {
  [Environment]::SetEnvironmentVariable('Path', (@($env:GULAPP_BIN) + $parts) -join ';', 'User')
  'added'
}`, { GULAPP_BIN: BIN }) === "added";
}

// GT-knappen i Glome pratar med gt via native messaging. Edge hittar värdprogrammet i registret.
export function registerNativeHost() {
  const manifest = path.join(LOCAL_DIR, "native", "se.gulnux.gt.json");
  writeJson(manifest, {
    name: "se.gulnux.gt",
    description: "Good Times",
    path: path.join(BIN, "gt-native-host.cmd"),
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSIONS.gt.id}/`],
  });
  if (!DRY) {
    execFileSync("reg.exe", ["add", "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\se.gulnux.gt", "/ve", "/t", "REG_SZ", "/d", manifest, "/f"],
      { stdio: "ignore", windowsHide: true });
  }
  return manifest;
}

const EXCLUDE = ["bank", "nordea", "seb.se", "kivra", "1177.se", "skatteverket.se", "forsakringskassan.se",
  "mail.", "outlook.", "localhost", "127.0.0.1"];

// Sökningens inställningar (på Gulnux skrivs de av gulnux.search i home.nix)
export function writeSearchConfig(s = settings()) {
  const file = path.join(CONFIG, "gulsearch", "config.json");
  const old = readJson(file, {});
  writeJson(file, {
    ...old,
    sources: { ...(old.sources || {}), documents: s.documents, memory: path.join(REPO, "memory") },
    glome: s.glomePages,
    exclude: old.exclude || EXCLUDE,
  });
  return file;
}

// Agentvalet där gul, GT och Greed läser det (samma fil som gul use skriver)
export function writeAgentChoice(agent) {
  const file = path.join(CONFIG, "gulnux", "agent");
  if (agent) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, agent + "\n");
  } else {
    fs.rmSync(file, { force: true });
  }
}

// Python-miljön skapas med uv. Tar en stund första gången; log får varje rad.
export function installPython(log = () => {}) {
  return new Promise((resolve, reject) => {
    const uv = uvPath();
    if (!uv) return reject(new Error("uv saknas"));
    const steps = [
      ["venv", "--allow-existing", "--python", "3.12", PYTHON_ENV],
      ["pip", "install", "--python", path.join(PYTHON_ENV, "Scripts", "python.exe"), ...PYTHON_PACKAGES],
    ];
    const next = () => {
      const step = steps.shift();
      if (!step) return resolve(pythonPath());
      const child = spawn(uv, step, { windowsHide: true });
      const onData = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach(log);
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? next() : reject(new Error(`uv ${step[0]} misslyckades (${code})`))));
    };
    next();
  });
}

// Klona det personliga repot (samma som gul setup på Gulnux gör när repot redan finns)
export function clonePersonal(github, log = () => {}) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(path.join(REPO, ".git"))) return resolve(REPO);
    if (!/^[A-Za-z0-9-]+$/.test(github || "")) return reject(new Error("Ange ditt GitHub-konto"));
    const child = spawn("git", ["clone", `https://github.com/${github}/gulnux-personal.git`, REPO], { windowsHide: true });
    child.stderr.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach(log));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve(REPO) : reject(new Error(`git clone misslyckades – finns ${github}/gulnux-personal och är du inloggad i Git?`))));
  });
}

// Vad som finns och vad som saknas, för inställningsfönstret
export function checkSystem() {
  return {
    node: nodePath(),
    uv: uvPath(),
    python: pythonPath(),
    edge: browserPath(),
    terminal: which("wt.exe"),
    git: which("git.exe"),
    claude: which("claude.exe") || which("claude"),
    codex: which("codex.cmd") || which("codex"),
    repo: fs.existsSync(path.join(REPO, ".git")) ? REPO : null,
    ollama: which("ollama.exe"),
  };
}

// Allt som går snabbt och kan göras vid varje start
export function setup({ electron } = {}) {
  const s = settings();
  // Electron kör Node-kommandona om ingen Node är installerad
  if (electron && s.electron !== electron) saveSettings({ electron });
  const missing = writeShims(commands({ electron }));
  const pathAdded = addToPath();
  const manifest = registerNativeHost();
  writeSearchConfig(s);
  return { missing, pathAdded, manifest };
}
