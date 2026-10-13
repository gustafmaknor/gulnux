// Gulapps sökvägar och inställningar. Används både av Electron-appen och av kommandona
// (gul, glome …), så här får inget bero på Electron.
//
// Gulapp använder samma kataloger som Gulnux (~/.config, ~/.local/share, ~/.local/state och
// ~/gulnux-personal), så att GT, Greed och sökningen fungerar likadant utan inställningar.
// Det som bara finns på Windows (kommandon, Python-miljön, Glomes profil) ligger i
// %LOCALAPPDATA%\Gulapp och inställningarna i %APPDATA%\Gulapp\settings.json.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOME = os.homedir();
export const GULAPP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASE = path.resolve(GULAPP, "..", ".."); // Gulnux-grunden (det här repot)
export const APPS = path.join(BASE, "apps");
export const AGENT_DIR = path.join(BASE, "agent");

const LOCAL = process.env.LOCALAPPDATA || path.join(HOME, "AppData", "Local");
const ROAMING = process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
export const LOCAL_DIR = process.env.GULAPP_LOCAL || path.join(LOCAL, "Gulapp");
export const BIN = path.join(LOCAL_DIR, "bin");
export const PYTHON_ENV = path.join(LOCAL_DIR, "python");
export const GLOME_PROFILE = path.join(LOCAL_DIR, "Glome");
export const LOGS = path.join(LOCAL_DIR, "logs");
export const SETTINGS_FILE = process.env.GULAPP_SETTINGS || path.join(ROAMING, "Gulapp", "settings.json");

export const CONFIG = process.env.XDG_CONFIG_HOME || path.join(HOME, ".config");
export const STATE = path.join(process.env.XDG_STATE_HOME || path.join(HOME, ".local", "state"), "gulnux");
export const REPO = process.env.GULNUX_PERSONAL || path.join(HOME, "gulnux-personal");

export const AGENTS = ["claude", "codex"];
export const GLOME_PORT = process.env.GLOME_PORT || "9222";

// Gulnux egna tillägg i Glome och deras fasta id (se CLAUDE.md – ändra aldrig key i manifesten)
export const EXTENSIONS = {
  search: { dir: path.join(APPS, "glome-tillagg"), id: "okelhmbnolibhpnjedoejgidbpnnoolh" },
  gt: { dir: path.join(APPS, "gt-tillagg"), id: "ggkddmolbkjjhlicmldkhpflblbleocb" },
  greed: { dir: path.join(APPS, "greed-tillagg"), id: "ccbiciocgndmnhmblociljbphlibegne" },
};

const DEFAULTS = {
  agent: "",                                  // tomt: från settings.nix i det personliga repot, annars claude
  documents: path.join(HOME, "Documents"),    // det sökningen indexerar och Gloffice utgår från
  glomePages: "manual",                       // webbsidor till sökningen: off, manual eller auto
  services: { gulsearch: true, greed: true }, // bakgrundstjänster som Gulapp håller igång
  autostart: true,
};

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(file + ".tmp", file);
}

export function settings() {
  const s = readJson(SETTINGS_FILE, {});
  return { ...DEFAULTS, ...s, services: { ...DEFAULTS.services, ...(s.services || {}) } };
}

export function saveSettings(changes) {
  const s = { ...settings(), ...changes };
  if (s.agent && !AGENTS.includes(s.agent)) throw new Error(`Okänd agent: ${s.agent}`);
  writeJson(SETTINGS_FILE, s);
  return s;
}

// Agenten i settings.nix (agent = "codex";), så att samma val gäller på Gulnux och i Gulapp
export function repoAgent() {
  try {
    const m = /^\s*agent\s*=\s*"([a-z]+)"/m.exec(fs.readFileSync(path.join(REPO, "settings.nix"), "utf8"));
    return m && AGENTS.includes(m[1]) ? m[1] : "";
  } catch {
    return "";
  }
}

// Samma ordning som gul på Gulnux: gul use, Gulapps inställning, settings.nix, claude
export function agentName() {
  const chosen = readText(path.join(CONFIG, "gulnux", "agent"));
  if (AGENTS.includes(chosen)) return chosen;
  return settings().agent || repoAgent() || "claude";
}

export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

// Ett program i PATH (med PATHEXT, så att .cmd-filer från npm hittas), eller null
export function which(name) {
  try {
    const out = execFileSync("where.exe", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    return out.split(/\r?\n/).find(Boolean) || null;
  } catch {
    return null;
  }
}

// Glome är Microsoft Edge med en egen profil (Edge finns på alla Windows-datorer och tar,
// till skillnad från Chrome, emot --load-extension). GULAPP_BROWSER väljer en annan Chromium.
export function browserPath() {
  const candidates = [
    process.env.GULAPP_BROWSER,
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(LOCAL, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

// Node för GT och Glome-kommandona: en installerad Node om den finns (GT behöver npm för
// sin körmiljö), annars Electrons inbyggda.
export function nodePath() {
  return which("node.exe");
}

export function uvPath() {
  return which("uv.exe") || [path.join(HOME, ".local", "bin", "uv.exe"), path.join(HOME, ".cargo", "bin", "uv.exe")].find((p) => fs.existsSync(p)) || null;
}

export function pythonPath() {
  const p = path.join(PYTHON_ENV, "Scripts", "python.exe");
  return fs.existsSync(p) ? p : null;
}

// Startsidan: Greed serverar den med dagens val; utan Greed samma sida som fil
export function startPage(greedRunning) {
  if (greedRunning) return "http://127.0.0.1:9303/start";
  return "file:///" + path.join(APPS, "greed", "greed", "static", "start.html").replaceAll("\\", "/");
}
