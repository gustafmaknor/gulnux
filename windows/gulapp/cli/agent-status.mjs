// gul-agent-status – agentens status för Gulapps ikon (som gul-agent-status på Gulnux)
//
//   gul-agent-status                         print the status as JSON
//   gul-agent-status working|idle|attention  set by the agents' hooks
//   gul-agent-status tool                    set from a Claude Code PreToolUse hook (JSON on stdin)

import fs from "node:fs";
import path from "node:path";
import { STATE, readJson, writeJson } from "../lib/config.mjs";

const FILE = path.join(STATE, "agent.json");

// Vad agenten gör just nu, utifrån verktyget den ska använda
function describeTool(input) {
  const name = input.tool_name || "";
  const i = input.tool_input || {};
  const target = path.basename(String(i.file_path || i.path || i.notebook_path || ""));
  if (name.startsWith("mcp__gloffice__")) return "arbetar i Gloffice";
  if (name.startsWith("mcp__glome__")) return "använder Glome";
  if (name.startsWith("mcp__gulsearch__")) return "söker i dina dokument";
  if (name.startsWith("mcp__greed__")) return "läser ditt flöde";
  if (name.startsWith("mcp__gt__")) return "använder Good Times";
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(name)) return `redigerar ${target || "en fil"}`;
  if (name === "Read") return `läser ${target || "en fil"}`;
  if (["Glob", "Grep"].includes(name)) return "letar i filer";
  if (["Bash", "PowerShell"].includes(name)) return "kör ett kommando";
  if (["WebSearch", "WebFetch"].includes(name)) return "söker på webben";
  if (["Task", "Agent"].includes(name)) return "delar upp arbetet";
  return "arbetar";
}

function stdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

const save = (state, text) => writeJson(FILE, { state, text, time: Date.now() / 1000 });

switch (process.argv[2] || "show") {
  case "working": save("working", "arbetar"); break;
  case "idle": save("idle", "väntar på dig"); break;
  case "attention": save("attention", "behöver dig"); break;
  case "tool": save("working", describeTool(stdin())); break;
  case "show": console.log(JSON.stringify(readJson(FILE, { state: "idle", text: "redo" }))); break;
  default:
    console.error("gul-agent-status: choose working, idle, attention, tool or nothing");
    process.exit(1);
}
