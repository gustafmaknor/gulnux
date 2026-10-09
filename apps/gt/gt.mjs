// gt – Good Times: teach your computer the work you do in your web apps.

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { GtError, STATE, listApps, loadApp, sessionFile } from "./lib/core.mjs";
import { captureSession } from "./lib/session.mjs";
import { describeTools, runTool } from "./lib/runner.mjs";
import { learn } from "./lib/learn.mjs";
import { listSchedules, schedule, sync, unschedule } from "./lib/schedule.mjs";

const USAGE = `gt – Good Times: teach your computer the work you do in your web apps

  gt                                  list learned apps
  gt learn [url]                      learn an app (default: the page open in Glome)
  gt tools <app>                      list an app's tools
  gt run <app> <tool> ['<json>']      run a tool, logged in as you
        --live                        run in your open Glome so you can watch
        --yes                         confirm a tool that changes data
        --notify                      send the result as a notification
  gt session <app>                    copy your current login from Glome
  gt schedule                         list scheduled tools
  gt schedule <app> <tool> <when> ['<json>'] [--yes]
                                      run a tool regularly, e.g. "Mon..Fri 08:00"
  gt unschedule <app> <tool>          stop running a tool regularly
  gt sync                             recreate schedules from your repo (new computer)
  gt mcp                              MCP server for the agents

Tip: the GT button in Glome starts \`gt learn\` for the page you are on.`;

function notify(title, body, urgent = false) {
  try {
    execFileSync("notify-send", ["-a", "Gulnux", ...(urgent ? ["-u", "critical"] : []), title, body], { stdio: "ignore" });
  } catch {
    // ingen notisdaemon – resultatet finns i loggen
  }
}

function logRun(app, tool, entry) {
  fs.mkdirSync(`${STATE}/logs`, { recursive: true });
  fs.appendFileSync(`${STATE}/logs/${app}-${tool}.jsonl`, JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n");
}

function parseArgs(argv) {
  const flags = new Set();
  const positional = [];
  let argsBase64;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--args-base64") argsBase64 = argv[++i];
    else if (argv[i].startsWith("--")) flags.add(argv[i].slice(2));
    else positional.push(argv[i]);
  }
  return { flags, positional, argsBase64 };
}

function json(text, what = "arguments") {
  if (text === undefined) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new GtError(`The ${what} must be JSON, e.g. '{"office": "Södermalm"}'`);
  }
}

async function main() {
  const [command = "apps", ...rest] = process.argv.slice(2);
  const { flags, positional, argsBase64 } = parseArgs(rest);

  switch (command) {
    case "apps": {
      const apps = listApps();
      if (!apps.length) {
        console.log("GT hasn't learned any apps yet. Open one in Glome and press the GT button, or run: gt learn <url>");
        return;
      }
      for (const app of apps) {
        const tools = await describeTools(app);
        const login = fs.existsSync(sessionFile(app)) ? "logged in" : "no login copied";
        console.log(`● ${app.name}  ${app.title}  (${tools.length} tools, ${login})`);
        console.log(`    ${app.startUrl}`);
      }
      return;
    }
    case "learn": {
      const { app, isNew, command: cmd } = await learn(positional[0], { window: !flags.has("here"), dryRun: flags.has("dry-run") });
      if (flags.has("dry-run")) console.log(JSON.stringify({ app: app.name, isNew, agent: cmd[0] }));
      else console.log(`${isNew ? "Learning" : "Continuing to learn"} ${app.title} – the agent opens in its own window.`);
      return;
    }
    case "tools": {
      const app = loadApp(positional[0]);
      const tools = await describeTools(app);
      if (!tools.length) console.log(`${app.title} has no tools yet – run: gt learn ${app.startUrl}`);
      for (const t of tools) {
        console.log(`● ${t.name}${t.writes ? "  (changes data)" : ""}\n    ${t.description}`);
        for (const [arg, spec] of Object.entries(t.args || {})) console.log(`      ${arg}: ${spec.description || spec.type || ""}`);
      }
      return;
    }
    case "run": {
      const [appName, toolName, argText] = positional;
      const app = loadApp(appName);
      const args = argsBase64 ? json(Buffer.from(argsBase64, "base64").toString("utf8")) : json(argText);
      try {
        const result = await runTool(app, toolName, args, { live: flags.has("live"), confirm: flags.has("yes") });
        logRun(app.name, toolName, { ok: true, summary: result.summary });
        if (flags.has("notify")) notify(`GT: ${app.title}`, result.summary);
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        logRun(app.name, toolName, { ok: false, error: e.message });
        if (flags.has("notify")) notify(`GT: ${toolName} failed`, e.message, true);
        throw e;
      }
      return;
    }
    case "session": {
      const app = loadApp(positional[0]);
      const s = await captureSession(app);
      console.log(`Copied the login for ${app.title} from Glome (${s.cookies} cookies, ${s.localStorage} localStorage values).`);
      return;
    }
    case "schedule": {
      if (!positional.length) {
        const schedules = listSchedules();
        if (!schedules.length) console.log("Nothing is scheduled.");
        for (const s of schedules) console.log(`● ${s.app} ${s.tool}  ${s.when}${s.writes ? "  (changes data)" : ""}`);
        return;
      }
      const [appName, toolName, when, argText] = positional;
      if (!when) throw new GtError('Usage: gt schedule <app> <tool> <when>, e.g. gt schedule myapp new-leads "Mon..Fri 08:00"');
      console.log(await schedule(loadApp(appName), toolName, when, json(argText), { allowWrites: flags.has("yes") }));
      return;
    }
    case "unschedule":
      console.log(unschedule(loadApp(positional[0]), positional[1]));
      return;
    case "sync":
      console.log(`Created ${sync()} schedules.`);
      return;
    case "mcp": {
      const { serve } = await import("./lib/mcp.mjs");
      serve();
      return;
    }
    case "help":
    case "-h":
    case "--help":
      console.log(USAGE);
      return;
    default:
      throw new GtError(`Unknown command "${command}" – see: gt help`);
  }
}

main().catch((e) => {
  console.error(e instanceof GtError ? `gt: ${e.message}` : e);
  process.exit(1);
});
