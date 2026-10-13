// Gulnux kommandon i Gulapp. Samma tabell blir .cmd-filer i %LOCALAPPDATA%\Gulapp\bin (som
// ligger i PATH, så att gul, gt, greed … fungerar i alla terminaler) och MCP-servrar för
// agenterna (som startar programmen direkt med rätt miljö, utan .cmd-filer emellan).

import fs from "node:fs";
import path from "node:path";
import { AGENT_DIR, APPS, BASE, BIN, GULAPP, browserPath, nodePath, pythonPath, settings } from "./config.mjs";

// Programmet som kör Node-kommandona: en installerad Node, annars Electron som Node
function node(electron) {
  const exe = nodePath();
  if (exe) return { exe, env: {} };
  if (electron) return { exe: electron, env: { ELECTRON_RUN_AS_NODE: "1" } };
  return null;
}

// name → { exe, args, env } eller null om det som behövs saknas (Node, Python-miljön)
export function commands({ electron = settings().electron } = {}) {
  const s = settings();
  const n = node(electron);
  const py = pythonPath();
  const js = (script, env = {}) => (n ? { exe: n.exe, args: [script], env: { ...n.env, ...env } } : null);
  const python = (module, paths, env = {}) => (py ? {
    exe: py,
    args: ["-m", module],
    env: { PYTHONPATH: paths.map((p) => path.join(APPS, p)).join(";"), PYTHONUTF8: "1", GLOFFICE_DIR: s.documents, ...env },
  } : null);

  return {
    gul: js(path.join(GULAPP, "cli", "gul.mjs")),
    "gul-agent-status": js(path.join(GULAPP, "cli", "agent-status.mjs")),
    glome: js(path.join(GULAPP, "cli", "glome.mjs")),
    "glome-mcp": js(path.join(GULAPP, "cli", "glome-mcp.mjs")),
    "glome-read": js(path.join(BASE, "scripts", "glome-read.mjs")),
    gt: js(path.join(APPS, "gt", "gt.mjs"), {
      GT_PROMPTS: path.join(AGENT_DIR, "prompts"),
      GT_CHROMIUM: browserPath() || "",
      GT_BIN: path.join(BIN, "gt.cmd"), // så att scheman får samma miljö
    }),
    "gt-native-host": js(path.join(APPS, "gt", "native-host.mjs"), { GT_BIN: path.join(BIN, "gt.cmd") }),
    gulsearch: python("gulsearch", ["gulsearch", "gloffice"]),
    greed: python("greed", ["greed", "gulsearch"], { GREED_PROMPTS: path.join(AGENT_DIR, "prompts") }),
    gloffice: python("gloffice", ["gloffice"]),
  };
}

// MCP-servrarna som agenterna får: namn → kommando med argument
export function mcpServers(cmds = commands()) {
  const servers = {};
  const add = (name, cmd, ...args) => {
    if (cmd) servers[name] = { command: cmd.exe, args: [...cmd.args, ...args], env: cmd.env };
  };
  add("glome", cmds["glome-mcp"]);
  add("gloffice", cmds.gloffice, "mcp");
  add("gulsearch", cmds.gulsearch, "mcp");
  add("greed", cmds.greed, "mcp");
  add("gt", cmds.gt, "mcp");
  return servers;
}

// cmd.exe tolkar % och ^ i .cmd-filer; sökvägar med dem stöds inte
const safe = (value) => {
  if (/[%^\r\n"]/.test(value)) throw new Error(`Sökvägen går inte att använda i Gulapp: ${value}`);
  return value;
};

export function cmdFile(cmd) {
  return [
    "@echo off",
    "setlocal",
    ...Object.entries(cmd.env).map(([k, v]) => `set "${k}=${safe(v)}"`),
    `"${safe(cmd.exe)}" ${cmd.args.map((a) => `"${safe(a)}"`).join(" ")} %*`,
    "",
  ].join("\r\n");
}

// Skriv .cmd-filerna. Kommandon som saknar något tas bort, så att PATH inte pekar fel.
export function writeShims(cmds = commands()) {
  fs.mkdirSync(BIN, { recursive: true });
  const missing = [];
  for (const [name, cmd] of Object.entries(cmds)) {
    const file = path.join(BIN, `${name}.cmd`);
    if (cmd) {
      fs.writeFileSync(file, cmdFile(cmd));
    } else {
      fs.rmSync(file, { force: true });
      missing.push(name);
    }
  }
  return missing;
}
