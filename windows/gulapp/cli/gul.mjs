// gul – Gulapps ingång: startar din kodagent med Gulnux kontext och ditt minne (som gul på Gulnux)

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AGENTS, BASE, CONFIG, REPO, STATE, agentName, which, writeJson } from "../lib/config.mjs";
import { claudeArgs, prepareCodex } from "../lib/agent.mjs";

const USAGE = `gul [claude|codex] [args]   start an agent (default: your chosen one)
gul use <agent>             change the default agent
gul search <query>          search documents, memory and saved web pages
gul search save             save the page you have open in Glome to the search index
gul memory [term]           show what Gulnux remembers about you
gul save                    commit and push the changes in your personal repo
gul update                  fetch the latest Gulnux base (git pull)
gul gt                      Good Times: teach your computer your work in web apps
gul greed                   Greed: your self-curating feed`;

const args = process.argv.slice(2);

// Kör ett annat Gulapp-kommando (en .cmd-fil i PATH) och avsluta med dess kod
function run(name, rest, options = {}) {
  const r = spawnSync("cmd.exe", ["/d", "/c", name, ...rest], { stdio: "inherit", ...options });
  process.exit(r.status ?? 1);
}

function git(...a) {
  return spawnSync("git", ["-C", REPO, ...a], { encoding: "utf8" });
}

switch (args[0]) {
  case "use": {
    if (!AGENTS.includes(args[1])) {
      console.error(`gul use: choose ${AGENTS.join(" or ")}`);
      process.exit(1);
    }
    fs.mkdirSync(path.join(CONFIG, "gulnux"), { recursive: true });
    fs.writeFileSync(path.join(CONFIG, "gulnux", "agent"), args[1] + "\n");
    console.log(`Default agent: ${args[1]} (set agent in settings.nix to make it apply on all your computers)`);
    process.exit(0);
  }
  case "gt":
  case "greed":
    run(args[0], args.slice(1));
  case "search": {
    const q = args.slice(1);
    if (!q.length) {
      console.error("Usage: gul search <query> | save | status | read <id> | forget <id> | index");
      process.exit(1);
    }
    if (q[0] === "save") {
      const page = spawnSync("cmd.exe", ["/d", "/c", "glome-read", "--json"], { encoding: "utf8" });
      if (page.status !== 0) {
        process.stderr.write(page.stderr);
        process.exit(1);
      }
      run("gulsearch", ["save-page"], { input: page.stdout, stdio: ["pipe", "inherit", "inherit"] });
    }
    run("gulsearch", ["status", "read", "forget", "index"].includes(q[0]) ? q : ["search", ...q]);
  }
  case "memory": {
    const dir = path.join(REPO, "memory");
    if (!fs.existsSync(dir)) {
      console.error("Gulnux has no memory yet – connect your personal repo in Gulapp's settings first.");
      process.exit(1);
    }
    if (!args[1]) {
      process.stdout.write(fs.readFileSync(path.join(dir, "MEMORY.md"), "utf8"));
      process.exit(0);
    }
    const term = args.slice(1).join(" ").toLowerCase();
    const hits = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).flatMap((f) =>
      fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).filter((l) => l.toLowerCase().includes(term)).map((l) => `${f}: ${l}`));
    console.log(hits.length ? hits.join("\n") : `Gulnux doesn't remember anything about "${term}".`);
    process.exit(0);
  }
  case "save": {
    if (!fs.existsSync(path.join(REPO, ".git"))) {
      console.error(`gul save: no personal repo at ${REPO}`);
      process.exit(1);
    }
    if (git("status", "--porcelain").stdout.trim()) {
      git("add", "-A");
      const files = git("diff", "--cached", "--name-only").stdout.trim().split("\n");
      const msg = `Spara ändringar i ${files.slice(0, 3).join(", ")}${files.length > 3 ? ` och ${files.length - 3} till` : ""}`;
      const c = git("commit", "-q", "-m", msg);
      if (c.status !== 0) {
        console.error(`gul save: the commit failed\n${c.stderr}`);
        process.exit(1);
      }
      console.log(`Committed: ${msg}`);
    }
    const p = git("push", "-q");
    console.log(p.status === 0 ? "Pushed to GitHub." : `gul save: the push failed – try 'git -C ${REPO} push'\n${p.stderr}`);
    process.exit(p.status ?? 1);
  }
  case "update": {
    const r = spawnSync("git", ["-C", BASE, "pull", "--ff-only"], { stdio: "inherit" });
    if (r.status === 0) console.log("Gulnux is up to date. Restart Gulapp to use the new version.");
    process.exit(r.status ?? 1);
  }
  case "-h":
  case "--help":
  case "help":
    console.log(USAGE);
    process.exit(0);
}

// ---------------------------------------------------------------- starta agenten

let agent = agentName();
let rest = args;
if (AGENTS.includes(args[0])) [agent, ...rest] = args;

const exe = which(agent === "claude" ? "claude.exe" : "codex.cmd") || which(agent);
if (!exe) {
  console.error(agent === "claude"
    ? "gul: Claude Code is not installed – see https://claude.com/claude-code"
    : "gul: Codex is not installed – install it with: npm install -g @openai/codex");
  process.exit(1);
}

let agentArgs;
if (agent === "claude") {
  agentArgs = [...claudeArgs(), ...rest];
} else {
  const { skipped, agents } = prepareCodex();
  if (skipped) console.error(`gul: ${agents} is your own, so Gulnux context was not added to it.`);
  agentArgs = rest;
}

spawnSync("cmd.exe", ["/d", "/c", "gt", "sync"], { stdio: "ignore" }); // scheman från andra datorer

// Ikonen visar att agenten är igång så länge den här processen lever
const pidFile = path.join(STATE, "agent.pid");
writeJson(pidFile, { pid: process.pid, agent });
writeJson(path.join(STATE, "agent.json"), { state: "idle", text: "väntar på dig", time: Date.now() / 1000 });

// .cmd-program (codex från npm) går via cmd, med kommandoraden byggd här så att citattecknen blir rätt
const quote = (a) => (/[\s"&|<>^()%!]/.test(a) ? `"${a.replaceAll('"', '""')}"` : a);
const child = /\.(cmd|bat)$/i.test(exe)
  ? spawn("cmd.exe", ["/d", "/s", "/c", `"${[exe, ...agentArgs].map(quote).join(" ")}"`], { stdio: "inherit", windowsVerbatimArguments: true })
  : spawn(exe, agentArgs, { stdio: "inherit" });
child.on("exit", (code) => {
  fs.rmSync(pidFile, { force: true });
  process.exit(code ?? 0);
});
process.on("SIGINT", () => {}); // Ctrl+C hör till agenten
