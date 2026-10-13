// Det gul gör innan agenten startar, som gul.sh på Gulnux: kontexten (systemkontexten,
// användarens minne och GT-apparna), MCP-servrarna och hooks för agentens status.
//
// Claude Code får allt som flaggor (--append-system-prompt-file, --mcp-config, --settings),
// så att ~/.claude bara gäller ens övriga Claude-arbete på datorn. Codex läser bara sin egen
// katalog, så där skrivs AGENTS.md och config.toml som på Gulnux – utan att skriva över
// något användaren har skrivit själv.

import fs from "node:fs";
import path from "node:path";
import { AGENT_DIR, BIN, HOME, REPO, STATE, readJson, writeJson } from "./config.mjs";
import { mcpServers } from "./commands.mjs";

export const CONTEXT = path.join(STATE, "AGENTS.md");
const MARK = "<!-- Skapad av Gulapp. Ändras den här raden skrivs filen inte över. -->";

export function buildContext() {
  const parts = [fs.readFileSync(path.join(AGENT_DIR, "AGENTS-windows.md"), "utf8")];
  const memory = path.join(REPO, "memory", "MEMORY.md");
  if (fs.existsSync(memory)) {
    parts.push(`\n---\n\n# Användarens minne\n\nFrån \`${path.join(REPO, "memory")}\`. Läs de enskilda minnesfilerna när de är relevanta.\n\n`
      + fs.readFileSync(memory, "utf8"));
  }
  const gtDir = path.join(REPO, "gt");
  const apps = fs.existsSync(gtDir)
    ? fs.readdirSync(gtDir).filter((d) => fs.existsSync(path.join(gtDir, d, "SKILL.md")))
    : [];
  if (apps.length) {
    parts.push("\n---\n\n# Good Times-appar\n\nAppar som GT har lärt sig. Läs appens SKILL.md när användaren vill göra något i den.\n\n"
      + apps.map((d) => `- ${readJson(path.join(gtDir, d, "app.json"), {}).title || d}: ${path.join(gtDir, d, "SKILL.md")}`).join("\n") + "\n");
  }
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(CONTEXT, parts.join(""));
  return CONTEXT;
}

// Hooks som berättar för Gulapps ikon vad agenten gör. Kommandot körs av Claude Codes skal
// (Git Bash eller cmd), så sökvägen skrivs med snedstreck framåt och inom citattecken.
const statusCommand = (arg) => `"${path.join(BIN, "gul-agent-status.cmd").replaceAll("\\", "/")}" ${arg}`;

export function claudeArgs() {
  const mcp = path.join(STATE, "claude-mcp.json");
  writeJson(mcp, { mcpServers: mcpServers() });
  const hook = (arg) => ({ hooks: [{ type: "command", command: statusCommand(arg) }] });
  const settingsFile = path.join(STATE, "claude-settings.json");
  writeJson(settingsFile, {
    hooks: {
      UserPromptSubmit: [hook("working")],
      PreToolUse: [{ matcher: "*", ...hook("tool") }],
      Stop: [hook("idle")],
      Notification: [hook("attention")],
    },
  });
  return ["--append-system-prompt-file", buildContext(), "--mcp-config", mcp, "--settings", settingsFile];
}

const toml = (s) => JSON.stringify(s); // TOML:s strängar med citattecken fungerar som JSON:s

export function prepareCodex() {
  const dir = path.join(HOME, ".codex");
  fs.mkdirSync(dir, { recursive: true });

  // AGENTS.md: skriv bara om filen saknas eller är Gulapps egen
  const agents = path.join(dir, "AGENTS.md");
  let skipped = false;
  if (!fs.existsSync(agents) || fs.readFileSync(agents, "utf8").startsWith(MARK)) {
    fs.writeFileSync(agents, `${MARK}\n\n${fs.readFileSync(buildContext(), "utf8")}`);
  } else {
    skipped = true;
  }

  // config.toml: lägg till det som saknas, ändra aldrig det som redan finns
  const conf = path.join(dir, "config.toml");
  let text = fs.existsSync(conf) ? fs.readFileSync(conf, "utf8") : "";
  if (!/^notify\s*=/m.test(text)) {
    // notify måste stå före första tabellen. Codex startar programmet direkt, så .cmd-filen går via cmd.
    text = `notify = ["cmd.exe", "/c", ${toml(path.join(BIN, "gul-agent-status.cmd"))}, "idle"]\n${text}`;
  }
  for (const [name, s] of Object.entries(mcpServers())) {
    if (new RegExp(`^\\[mcp_servers\\.${name}\\]`, "m").test(text)) continue;
    text += `\n[mcp_servers.${name}]\ncommand = ${toml(s.command)}\nargs = [${s.args.map(toml).join(", ")}]\n`;
    if (Object.keys(s.env).length) {
      text += `[mcp_servers.${name}.env]\n${Object.entries(s.env).map(([k, v]) => `${k} = ${toml(v)}`).join("\n")}\n`;
    }
  }
  fs.writeFileSync(conf, text);
  return { skipped, agents };
}
