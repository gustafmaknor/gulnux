// Testar Gulapp utan Electron: kommandona (.cmd), kontexten, agenternas MCP-konfiguration och
// hooks, gul, agentstatusen och ikonerna. Allt hamnar i en tillfällig katalog och
// GULAPP_DRY gör att registret, PATH och Start-menyn inte rörs.
//
//   node tests/test-gulapp.mjs
//
// Med uv i PATH skapas också Python-miljön och sökningen, Greed och Gloffice testas via
// sina kommandon (tar en stund första gången).

import assert from "node:assert/strict";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = fs.mkdtempSync(path.join(os.tmpdir(), "gulapp-test-"));
const HOME = path.join(T, "home");
const REPO = path.join(HOME, "gulnux-personal");
const LOCAL = path.join(T, "local");
const BIN = path.join(LOCAL, "bin");
const FAKE = path.join(T, "fake");

// Ett PATH utan användarens egna program, så att låtsasagenten hittas i stället för den riktiga
const sys = process.env.SystemRoot || "C:\\Windows";
const uvDir = (process.env.PATH.split(";").find((p) => fs.existsSync(path.join(p, "uv.exe")))) || "";
const PATH = [FAKE, BIN, path.dirname(process.execPath), path.join(sys, "System32"), sys,
  path.join(sys, "System32", "WindowsPowerShell", "v1.0"), uvDir].filter(Boolean).join(";");

Object.assign(process.env, {
  USERPROFILE: HOME,
  GULAPP_LOCAL: LOCAL,
  GULAPP_SETTINGS: path.join(T, "roaming", "settings.json"),
  GULAPP_DRY: "1",
  XDG_CONFIG_HOME: path.join(HOME, ".config"),
  XDG_STATE_HOME: path.join(HOME, ".local", "state"),
  XDG_DATA_HOME: path.join(HOME, ".local", "share"),
  GULNUX_PERSONAL: REPO,
  GLOME_PORT: "9398",
  PATH,
});
delete process.env.GULNUX_AGENT;

const ok = (text) => console.log("OK  ", text);
const STATE = path.join(HOME, ".local", "state", "gulnux");
const run = (name, args = [], input) => spawnSync("cmd.exe", ["/d", "/c", name, ...args], { encoding: "utf8", input, env: process.env });

// Ett personligt repo med minne, en GT-app och codex i settings.nix
fs.mkdirSync(path.join(REPO, "memory"), { recursive: true });
fs.mkdirSync(path.join(REPO, "gt", "maklarapp"), { recursive: true });
fs.writeFileSync(path.join(REPO, "settings.nix"), '{\n  name = "Test";\n  agent = "codex"; # claude, codex eller vibe\n}\n');
fs.writeFileSync(path.join(REPO, "memory", "MEMORY.md"), "- [Kaffe](kaffe.md) — dricker kaffe utan mjölk\n");
fs.writeFileSync(path.join(REPO, "memory", "kaffe.md"), "Användaren dricker svart kaffe.\n");
fs.writeFileSync(path.join(REPO, "gt", "maklarapp", "app.json"), JSON.stringify({ title: "Mäklarappen", origins: ["http://localhost:9555"] }));
fs.writeFileSync(path.join(REPO, "gt", "maklarapp", "SKILL.md"), "# Mäklarappen\n");

const config = await import("../lib/config.mjs");
const { setup } = await import("../lib/setup.mjs");
const { claudeArgs, prepareCodex } = await import("../lib/agent.mjs");
const { statusIcon, appIco } = await import("../lib/icons.mjs");

try {
  // ---------------------------------------------------------------- inställningar
  assert.equal(config.agentName(), "codex", "agenten ska komma från settings.nix");
  config.saveSettings({ agent: "claude" });
  assert.equal(config.agentName(), "claude", "Gulapps val går före settings.nix");
  assert.throws(() => config.saveSettings({ agent: "vim" }));
  ok("agentval: settings.nix, Gulapps inställning");

  // ---------------------------------------------------------------- installation
  const r = setup({ electron: process.execPath });
  for (const name of ["gul", "gt", "glome", "glome-read", "glome-mcp", "gul-agent-status", "gt-native-host"]) {
    assert.ok(fs.existsSync(path.join(BIN, `${name}.cmd`)), `${name}.cmd saknas`);
  }
  const gtCmd = fs.readFileSync(path.join(BIN, "gt.cmd"), "utf8");
  assert.match(gtCmd, /set "GT_BIN=.*gt\.cmd"\r\n/);
  assert.match(gtCmd, /gt\.mjs" %\*\r\n$/);
  const host = JSON.parse(fs.readFileSync(r.manifest, "utf8"));
  assert.equal(host.allowed_origins[0], "chrome-extension://ggkddmolbkjjhlicmldkhpflblbleocb/");
  assert.ok(host.path.endsWith("gt-native-host.cmd"));
  const search = JSON.parse(fs.readFileSync(path.join(HOME, ".config", "gulsearch", "config.json"), "utf8"));
  assert.equal(search.sources.documents, path.join(HOME, "Documents"));
  assert.equal(search.sources.memory, path.join(REPO, "memory"));
  ok(`kommandona, GT-knappens värdprogram och sökningens inställningar${r.missing.length ? ` (utan Python: ${r.missing.join(", ")})` : ""}`);

  // ---------------------------------------------------------------- kommandona fungerar
  const apps = run("gt", ["apps"]);
  assert.equal(apps.status, 0, apps.stderr);
  assert.match(apps.stdout, /maklarapp/);
  const read = run("glome-read", ["--list"]);
  assert.notEqual(read.status, 0);
  assert.match(read.stderr, /Glome körs inte/);
  ok("gt och glome-read via sina .cmd-filer");

  // ---------------------------------------------------------------- native messaging
  const msg = Buffer.from(JSON.stringify({ action: "status", url: "http://localhost:9555/lista" }));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(msg.length);
  const reply = execFileSync("cmd.exe", ["/d", "/c", path.join(BIN, "gt-native-host.cmd")], { input: Buffer.concat([len, msg]), env: process.env });
  const answer = JSON.parse(reply.subarray(4, 4 + reply.readUInt32LE(0)).toString());
  assert.ok(answer.ok && answer.known, JSON.stringify(answer));
  ok("GT-knappens väg in svarar via .cmd-filen (som Edge startar den)");

  // Bryggan när native messaging är avstängt med en policy
  process.env.GULAPP_GT_PORT = "9394";
  const { startBridge } = await import("../lib/gtbridge.mjs");
  const { commands } = await import("../lib/commands.mjs");
  const bridge = startBridge(() => commands()["gt-native-host"]);
  const post = (origin, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 9394, method: "POST", path: "/gt", headers: { Origin: origin, "Content-Type": "application/json" } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c)).on("end", () => resolve([res.statusCode, JSON.parse(d)]));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
  await new Promise((r) => bridge.once("listening", r));
  const [code, svar] = await post("chrome-extension://ggkddmolbkjjhlicmldkhpflblbleocb", { action: "status", url: "http://localhost:9555/lista" });
  assert.equal(code, 200);
  assert.ok(svar.known, JSON.stringify(svar));
  assert.equal((await post("https://evil.example", { action: "learn", url: "http://localhost:9555/" }))[0], 403);
  assert.equal((await post("chrome-extension://ggkddmolbkjjhlicmldkhpflblbleocb", { action: "rm" }))[0], 400);
  bridge.close();
  ok("GT-knappens brygga: bara GT-tillägget, samma svar som native messaging");

  // ---------------------------------------------------------------- Claude Code
  const args = claudeArgs();
  const ctx = fs.readFileSync(args[args.indexOf("--append-system-prompt-file") + 1], "utf8");
  assert.match(ctx, /^# Gulapp – systemkontext/);
  assert.match(ctx, /dricker kaffe utan mjölk/);
  assert.match(ctx, /Mäklarappen: .*SKILL\.md/);
  const mcp = JSON.parse(fs.readFileSync(args[args.indexOf("--mcp-config") + 1], "utf8")).mcpServers;
  assert.ok(mcp.glome && mcp.gt, Object.keys(mcp).join(","));
  assert.ok(mcp.gt.args[0].endsWith("gt.mjs") && mcp.gt.args[1] === "mcp" && mcp.gt.env.GT_BIN);
  const settingsJson = JSON.parse(fs.readFileSync(args[args.indexOf("--settings") + 1], "utf8"));
  assert.ok(!fs.existsSync(path.join(HOME, ".claude")), "Gulapp ska inte röra ~/.claude");
  ok(`Claude Code: kontext, minne, GT-appar och ${Object.keys(mcp).length} MCP-servrar som flaggor`);

  // Hookarna körs av Claude Codes skal: både cmd och Git Bash ska fungera
  const hook = (event) => settingsJson.hooks[event][0].hooks[0].command;
  const status = () => JSON.parse(fs.readFileSync(path.join(STATE, "agent.json"), "utf8"));
  execSync(hook("PreToolUse"), { shell: "cmd.exe", input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "C:\\x\\offert.docx" } }), env: process.env });
  assert.deepEqual([status().state, status().text], ["working", "redigerar offert.docx"]);
  const bash = [process.env.ProgramFiles, path.join(process.env.LOCALAPPDATA || "", "Programs")]
    .map((d) => path.join(d || "", "Git", "usr", "bin", "bash.exe")).find((p) => fs.existsSync(p));
  if (bash) {
    execFileSync(bash, ["-c", hook("Notification")], { env: process.env });
    assert.equal(status().state, "attention");
  }
  execSync(hook("Stop"), { shell: "cmd.exe", env: process.env });
  assert.equal(status().state, "idle");
  ok(`hooks för agentens status (cmd${bash ? " och Git Bash" : ""})`);

  // ---------------------------------------------------------------- Codex
  prepareCodex();
  prepareCodex();
  const toml = fs.readFileSync(path.join(HOME, ".codex", "config.toml"), "utf8");
  assert.match(toml, /^notify = \["cmd\.exe", "\/c", ".*gul-agent-status\.cmd", "idle"\]/);
  assert.equal(toml.match(/^\[mcp_servers\.gt\]$/gm).length, 1, "MCP-servrarna ska bara läggas till en gång");
  assert.match(toml, /\[mcp_servers\.gt\.env\]\nGT_PROMPTS = /);
  assert.match(fs.readFileSync(path.join(HOME, ".codex", "AGENTS.md"), "utf8"), /^<!-- Skapad av Gulapp/);
  fs.writeFileSync(path.join(HOME, ".codex", "AGENTS.md"), "Mina egna regler\n");
  assert.ok(prepareCodex().skipped);
  assert.equal(fs.readFileSync(path.join(HOME, ".codex", "AGENTS.md"), "utf8"), "Mina egna regler\n");
  ok("Codex: AGENTS.md och config.toml, utan dubbletter och utan att skriva över användarens fil");

  // ---------------------------------------------------------------- gul
  assert.match(run("gul", ["memory"]).stdout, /kaffe/);
  assert.match(run("gul", ["memory", "SVART"]).stdout, /kaffe\.md: Användaren dricker svart kaffe/);
  assert.match(run("gul", ["use", "codex"]).stdout, /Default agent: codex/);
  assert.equal(config.agentName(), "codex");
  run("gul", ["use", "claude"]);

  // En låtsas-Claude som skriver ner sina argument
  fs.mkdirSync(FAKE, { recursive: true });
  fs.writeFileSync(path.join(FAKE, "fake-claude.mjs"), `import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(path.join(T, "claude-args.json"))}, JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(${JSON.stringify(path.join(T, "pid-under-run.txt"))}, String(fs.existsSync(${JSON.stringify(path.join(STATE, "agent.pid"))})));`);
  fs.writeFileSync(path.join(FAKE, "claude.cmd"), `@echo off\r\n"${process.execPath}" "${path.join(FAKE, "fake-claude.mjs")}" %*\r\n`);
  const gul = run("gul", ["--continue"]);
  assert.equal(gul.status, 0, gul.stderr);
  const claudeGot = JSON.parse(fs.readFileSync(path.join(T, "claude-args.json"), "utf8"));
  for (const flag of ["--append-system-prompt-file", "--mcp-config", "--settings"]) assert.ok(claudeGot.includes(flag), flag);
  assert.equal(claudeGot.at(-1), "--continue");
  assert.equal(fs.readFileSync(path.join(T, "pid-under-run.txt"), "utf8"), "true", "ikonen ska se att agenten körs");
  assert.ok(!fs.existsSync(path.join(STATE, "agent.pid")), "pid-filen ska tas bort när agenten avslutas");
  ok("gul: minnet, gul use och start av agenten med Gulnux kontext");

  // ---------------------------------------------------------------- ikonerna
  for (const s of ["off", "idle", "working", "attention"]) {
    assert.deepEqual([...statusIcon(s, 32).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  assert.notDeepEqual(statusIcon("working", 32, 0), statusIcon("working", 32, 4), "pricken ska snurra");
  const ico = appIco();
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 4);
  ok("ikonerna (PNG och ICO)");

  // ---------------------------------------------------------------- Python-apparna
  const { installPython, PYTHON_PACKAGES } = await import("../lib/setup.mjs");
  if (config.uvPath()) {
    await installPython();
    setup({ electron: process.execPath });
    const docs = path.join(HOME, "Documents");
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, "offert-tak.txt"), "Offert på nytt tak till sommarstugan, 85 000 kr.\n");
    assert.equal(run("gulsearch", ["index"]).status, 0);
    const hits = JSON.parse(run("gulsearch", ["search", "--json", "offerten", "om", "taket"]).stdout);
    assert.equal(hits.traffar[0].titel, "offert-tak.txt", JSON.stringify(hits).slice(0, 300));
    assert.match(run("gulsearch", ["search", "sommarstugan"]).stdout, /offert-tak\.txt/);
    const added = run("greed", ["add", "--glome", "x.com"]);
    assert.equal(added.status, 0, added.stderr);
    assert.match(run("greed", ["sources"]).stdout, /x\.com\s+glome/);
    const mcpAll = JSON.parse(fs.readFileSync(claudeArgs()[3], "utf8")).mcpServers;
    assert.deepEqual(Object.keys(mcpAll).sort(), ["gloffice", "glome", "greed", "gt", "gulsearch"]);
    ok(`Python-miljön (${PYTHON_PACKAGES.length} paket): sökningen hittar dokument, Greed och alla fem MCP-servrar`);
  } else {
    console.log("--   Python-apparna hoppades över (uv finns inte i PATH)");
  }

  console.log("\nAlla tester gick igenom.");
} finally {
  fs.rmSync(T, { recursive: true, force: true, maxRetries: 3 });
}
