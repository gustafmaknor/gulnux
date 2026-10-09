// Schemalägger verktyg med systemd-timers på användarnivå. Schemat sparas också i app.json,
// så att `gt sync` kan återskapa det på en ny dator.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CONFIG, GtError, listApps, saveApp } from "./core.mjs";
import { loadTool } from "./runner.mjs";

const UNITS = process.env.GT_SYSTEMD_DIR || path.join(CONFIG, "systemd", "user");
const GT = process.env.GT_BIN || "/run/current-system/sw/bin/gt";

function systemctl(...args) {
  if (process.env.GT_DRY) return;
  execFileSync("systemctl", ["--user", ...args], { stdio: "ignore" });
}

const unitName = (app, tool) => `gt-${app.name}-${tool}`;

function writeUnits(app, entry, writes) {
  const unit = unitName(app, entry.tool);
  const args = Buffer.from(JSON.stringify(entry.args || {})).toString("base64");
  fs.mkdirSync(UNITS, { recursive: true });
  fs.writeFileSync(path.join(UNITS, `${unit}.service`), `[Unit]
Description=Good Times: ${app.title} – ${entry.tool}

[Service]
Type=oneshot
ExecStart=${GT} run ${app.name} ${entry.tool} --args-base64 ${args} --notify${writes ? " --yes" : ""}
Environment=PATH=/run/current-system/sw/bin
`);
  fs.writeFileSync(path.join(UNITS, `${unit}.timer`), `[Unit]
Description=Good Times: ${app.title} – ${entry.tool} (${entry.when})

[Timer]
OnCalendar=${entry.when}
Persistent=true

[Install]
WantedBy=timers.target
`);
  return unit;
}

export async function schedule(app, toolName, when, args = {}, { allowWrites = false } = {}) {
  const tool = await loadTool(app, toolName);
  if (tool.meta.writes && !allowWrites) {
    throw new GtError(`${toolName} changes data in ${app.title}. Only schedule it if the user wants that, with --yes.`);
  }
  if (!/^[\w\s:*,./~-]+$/.test(when)) throw new GtError(`"${when}" is not a valid time (examples: daily, "Mon..Fri 08:00")`);
  const entry = { tool: toolName, when, args, writes: Boolean(tool.meta.writes) };
  app.schedules = [...app.schedules.filter((s) => s.tool !== toolName), entry];
  saveApp(app);
  const unit = writeUnits(app, entry, entry.writes);
  systemctl("daemon-reload");
  systemctl("enable", "--now", `${unit}.timer`);
  return `${app.title}: ${toolName} runs ${when}`;
}

export function unschedule(app, toolName) {
  const unit = unitName(app, toolName);
  try {
    systemctl("disable", "--now", `${unit}.timer`);
  } catch {
    // fanns inte – fortsätt och städa
  }
  for (const ext of ["service", "timer"]) fs.rmSync(path.join(UNITS, `${unit}.${ext}`), { force: true });
  app.schedules = app.schedules.filter((s) => s.tool !== toolName);
  saveApp(app);
  systemctl("daemon-reload");
  return `${app.title}: ${toolName} is no longer scheduled`;
}

// Skapar timers för alla scheman i app.json som saknas här (t.ex. på en ny dator)
export function sync() {
  let created = 0;
  for (const app of listApps()) {
    for (const entry of app.schedules) {
      if (fs.existsSync(path.join(UNITS, `${unitName(app, entry.tool)}.timer`))) continue;
      const unit = writeUnits(app, entry, entry.writes);
      systemctl("daemon-reload");
      systemctl("enable", "--now", `${unit}.timer`);
      created++;
    }
  }
  return created;
}

export function listSchedules() {
  return listApps().flatMap((app) => app.schedules.map((s) => ({ app: app.name, title: app.title, ...s })));
}
