// Schemalägger verktyg och handlingar med systemd-timers på användarnivå. Varje schema har
// ett eget id, så samma verktyg kan schemaläggas flera gånger med olika värden. Ett schema
// med once körs en gång och tar sedan bort sig självt. Scheman sparas i app.json, så att
// `gt sync` kan återskapa dem på en ny dator.

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

// Kontrollera tidsuttrycket med systemd och returnera nästa körning ("tor 2026-10-30 09:00:00 CET")
function nextRun(when) {
  if (!/^[\w\s:*,./~-]+$/.test(when)) throw new GtError(`"${when}" is not a valid time (examples: daily, "Mon..Fri 08:00", "2026-10-30 09:00")`);
  if (process.env.GT_DRY) return null;
  let out;
  try {
    out = execFileSync("systemd-analyze", ["calendar", when], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new GtError(`"${when}" is not a valid time (examples: daily, "Mon..Fri 08:00", "2026-10-30 09:00")`);
  }
  const next = /Next elapse:\s*(.+)/.exec(out)?.[1]?.trim();
  if (!next || next === "never") throw new GtError(`"${when}" never happens again – pick a time in the future`);
  return next;
}

const unitName = (app, id) => `gt-${app.name}-${id}`;

function newId(app, tool) {
  const taken = new Set(app.schedules.map((s) => s.id));
  for (let n = 1; ; n++) {
    const id = n === 1 ? tool : `${tool}-${n}`;
    if (!taken.has(id)) return id;
  }
}

function writeUnits(app, entry) {
  const unit = unitName(app, entry.id);
  const args = Buffer.from(JSON.stringify(entry.args || {})).toString("base64");
  const confirm = entry.writes ? " --yes" : "";
  // En engångshandling tar bort sitt schema först när den har lyckats
  const cleanup = entry.once ? `ExecStartPost=${GT} unschedule ${app.name} ${entry.id}\n` : "";
  fs.mkdirSync(UNITS, { recursive: true });
  fs.writeFileSync(path.join(UNITS, `${unit}.service`), `[Unit]
Description=Good Times: ${app.title} – ${entry.tool}${entry.writes ? " (changes data)" : ""}

[Service]
Type=oneshot
ExecStart=${GT} run ${app.name} ${entry.tool} --args-base64 ${args} --notify${confirm}
${cleanup}Environment=PATH=/run/current-system/sw/bin
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

function enable(unit) {
  systemctl("daemon-reload");
  systemctl("enable", "--now", `${unit}.timer`);
}

// confirm: användaren har godkänt att ett verktyg som ändrar data körs utan att hen är med
export async function schedule(app, toolName, when, args = {}, { confirm = false, once = false } = {}) {
  const tool = await loadTool(app, toolName);
  if (tool.meta.writes && !confirm) {
    throw new GtError(`${toolName} changes data in ${app.title}. Only schedule it after the user approved exactly what, when and with which values (--yes, MCP: confirm: true).`);
  }
  const next = nextRun(when);
  const entry = {
    id: newId(app, toolName),
    tool: toolName,
    when,
    args,
    writes: Boolean(tool.meta.writes),
    once,
    created: new Date().toISOString(),
  };
  app.schedules = [...app.schedules, entry];
  saveApp(app);
  enable(writeUnits(app, entry));
  return { ...entry, next, message: `${app.title}: ${toolName} ${once ? "runs once" : "runs"} ${when}${next ? ` – next: ${next}` : ""} (id ${entry.id})` };
}

export function unschedule(app, id) {
  // Ett verktygsnamn räcker när verktyget bara har ett schema
  let entry = app.schedules.find((s) => s.id === id);
  if (!entry) {
    const matches = app.schedules.filter((s) => s.tool === id);
    if (matches.length > 1) throw new GtError(`${id} has ${matches.length} schedules – name one: ${matches.map((s) => s.id).join(", ")}`);
    [entry] = matches;
  }
  if (!entry) throw new GtError(`${app.title} has no schedule called "${id}" – see: gt schedule`);
  const unit = unitName(app, entry.id);
  try {
    systemctl("disable", "--now", `${unit}.timer`);
  } catch {
    // fanns inte – fortsätt och städa
  }
  for (const ext of ["service", "timer"]) fs.rmSync(path.join(UNITS, `${unit}.${ext}`), { force: true });
  app.schedules = app.schedules.filter((s) => s.id !== entry.id);
  saveApp(app);
  systemctl("daemon-reload");
  return `${app.title}: ${entry.tool} (${entry.id}) is no longer scheduled`;
}

// Skapar timers för alla scheman i app.json som saknas här (t.ex. på en ny dator)
export function sync() {
  let created = 0;
  for (const app of listApps()) {
    for (const entry of app.schedules) {
      if (!entry.id) entry.id = entry.tool; // scheman från före id:n
      if (fs.existsSync(path.join(UNITS, `${unitName(app, entry.id)}.timer`))) continue;
      enable(writeUnits(app, entry));
      created++;
    }
    saveApp(app);
  }
  return created;
}

export function listSchedules() {
  return listApps().flatMap((app) => app.schedules.map((s) => ({ app: app.name, title: app.title, ...s })));
}
