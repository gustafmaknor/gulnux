// Good Times som MCP-server (stdio): låter alla agenter använda verktygen GT har byggt.

import readline from "node:readline";
import { listApps, loadApp } from "./core.mjs";
import { captureSession } from "./session.mjs";
import { describeTools, runTool } from "./runner.mjs";
import { learn } from "./learn.mjs";
import { listSchedules, schedule, unschedule } from "./schedule.mjs";

const INSTRUCTIONS = `Good Times (GT) has learned web apps the user works in and built tools that do the
user's tasks in them, logged in as the user. Use list_apps and list_tools to see what exists, and
run_tool to do the work. Tools marked writes: true change data in the app: ask the user first and
pass confirm: true only after they said yes. Each app also has a SKILL.md describing how it works.`;

const APP = { type: "string", description: "The app's name from list_apps" };
const TOOLS = {
  list_apps: {
    description: "List the web apps GT has learned, with their tools.",
    props: {},
    run: async () => Promise.all(listApps().map(async (a) => ({
      name: a.name, title: a.title, url: a.startUrl, skill: `${a.dir}/SKILL.md`,
      tools: (await describeTools(a)).map((t) => t.name),
    }))),
  },
  list_tools: {
    description: "List an app's tools with descriptions and arguments.",
    props: { app: APP },
    required: ["app"],
    run: ({ app }) => describeTools(loadApp(app)),
  },
  run_tool: {
    description: "Run one of an app's tools, logged in as the user. Returns a summary and data.",
    props: {
      app: APP,
      tool: { type: "string" },
      args: { type: "object", description: "Arguments as described by list_tools" },
      live: { type: "boolean", description: "Run in the user's open Glome instead of in the background" },
      confirm: { type: "boolean", description: "Required for tools that change data – only after the user approved" },
    },
    required: ["app", "tool"],
    run: ({ app, tool, args = {}, live = false, confirm = false }) => runTool(loadApp(app), tool, args, { live, confirm }),
  },
  refresh_session: {
    description: "Copy the user's current login for an app from Glome.",
    props: { app: APP },
    required: ["app"],
    run: async ({ app }) => {
      const a = loadApp(app);
      const s = await captureSession(a);
      return `Copied ${s.cookies} cookies and ${s.localStorage} localStorage values for ${a.title}`;
    },
  },
  learn: {
    description: "Open a learning session where GT learns a web app together with the user (in a new terminal window).",
    props: { url: { type: "string", description: "The app's address (default: the page open in Glome)" } },
    run: async ({ url } = {}) => {
      const { app, isNew } = await learn(url);
      return `${isNew ? "Started learning" : "Continued learning"} ${app.title} in a new window`;
    },
  },
  list_schedules: {
    description: "List tools that run on a schedule.",
    props: {},
    run: async () => listSchedules(),
  },
  schedule: {
    description: "Schedule a tool or an action: regularly (systemd OnCalendar, e.g. \"daily\", \"Mon..Fri 08:00\") or once (once: true, e.g. \"2026-10-30 09:00\"). The user gets a notification with the result. For tools that change data (writes: true), first tell the user exactly what will happen, when and with which values, and pass confirm: true only after they said yes. Check the returned next run time with the user.",
    props: {
      app: APP,
      tool: { type: "string" },
      when: { type: "string", description: "systemd OnCalendar expression" },
      args: { type: "object" },
      once: { type: "boolean", description: "Run once, then remove the schedule" },
      confirm: { type: "boolean", description: "Required for tools that change data – only after the user approved" },
    },
    required: ["app", "tool", "when"],
    run: ({ app, tool, when, args = {}, once = false, confirm = false }) => schedule(loadApp(app), tool, when, args, { once, confirm }),
  },
  unschedule: {
    description: "Remove a schedule, by its id from list_schedules (or the tool name if it has only one).",
    props: { app: APP, id: { type: "string" } },
    required: ["app", "id"],
    run: async ({ app, id }) => unschedule(loadApp(app), id),
  },
};

async function handle(msg) {
  const params = msg.params || {};
  switch (msg.method) {
    case "initialize":
      return { result: {
        protocolVersion: params.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "gt", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      } };
    case "ping":
      return { result: {} };
    case "tools/list":
      return { result: { tools: Object.entries(TOOLS).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: { type: "object", properties: t.props, required: t.required || [] },
      })) } };
    case "tools/call": {
      const tool = TOOLS[params.name];
      if (!tool) return { error: { code: -32602, message: `Unknown tool: ${params.name}` } };
      try {
        const out = await tool.run(params.arguments || {});
        const text = typeof out === "string" ? out : JSON.stringify(out, null, 1);
        return { result: { content: [{ type: "text", text }] } };
      } catch (e) {
        return { result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } };
      }
    }
    default:
      return "id" in msg ? { error: { code: -32601, message: `Unknown method: ${msg.method}` } } : null;
  }
}

export function serve() {
  // Verktygens loggning går till stderr; stdout är bara för MCP
  const lines = readline.createInterface({ input: process.stdin });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const reply = await handle(msg);
    if (reply && "id" in msg) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...reply }) + "\n");
  });
}
