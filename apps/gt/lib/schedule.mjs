// Schemalägger verktyg och handlingar: med systemd-timers på användarnivå på Gulnux och med
// Windows Schemaläggaren i Gulapp. Varje schema har ett eget id, så samma verktyg kan
// schemaläggas flera gånger med olika värden. Ett schema med once körs en gång och tar sedan
// bort sig självt. Scheman sparas i app.json, så att `gt sync` kan återskapa dem på en ny dator.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CONFIG, DATA, GtError, listApps, saveApp } from "./core.mjs";
import { WINDOWS, gtCommand } from "./platform.mjs";
import { loadTool } from "./runner.mjs";

const EXAMPLES = 'examples: daily, "Mon..Fri 08:00", "2026-10-30 09:00"';
const unitName = (app, id) => `gt-${app.name}-${id}`;
const quoted = (parts) => parts.map((p) => (/[\s"]/.test(p) ? `"${p}"` : p)).join(" ");

function gtArgs(app, entry) {
  const args = Buffer.from(JSON.stringify(entry.args || {})).toString("base64");
  return ["run", app.name, entry.tool, "--args-base64", args, "--notify", ...(entry.writes ? ["--yes"] : [])];
}

// ------------------------------------------------------------------ Gulnux: systemd

const UNITS = process.env.GT_SYSTEMD_DIR || path.join(CONFIG, "systemd", "user");

const systemd = {
  systemctl(...args) {
    if (process.env.GT_DRY) return;
    execFileSync("systemctl", ["--user", ...args], { stdio: "ignore" });
  },

  // Kontrollera tidsuttrycket och returnera nästa körning ("tor 2026-10-30 09:00:00 CET")
  check(when) {
    if (!/^[\w\s:*,./~-]+$/.test(when)) throw new GtError(`"${when}" is not a valid time (${EXAMPLES})`);
    if (process.env.GT_DRY) return null;
    let out;
    try {
      out = execFileSync("systemd-analyze", ["calendar", when], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      throw new GtError(`"${when}" is not a valid time (${EXAMPLES})`);
    }
    const next = /Next elapse:\s*(.+)/.exec(out)?.[1]?.trim();
    if (!next || next === "never") throw new GtError(`"${when}" never happens again – pick a time in the future`);
    return next;
  },

  exists: (app, entry) => fs.existsSync(path.join(UNITS, `${unitName(app, entry.id)}.timer`)),

  install(app, entry) {
    const unit = unitName(app, entry.id);
    const gt = quoted(gtCommand());
    // En engångshandling tar bort sitt schema först när den har lyckats
    const cleanup = entry.once ? `ExecStartPost=${gt} unschedule ${app.name} ${entry.id}\n` : "";
    fs.mkdirSync(UNITS, { recursive: true });
    fs.writeFileSync(path.join(UNITS, `${unit}.service`), `[Unit]
Description=Good Times: ${app.title} – ${entry.tool}${entry.writes ? " (changes data)" : ""}

[Service]
Type=oneshot
ExecStart=${gt} ${gtArgs(app, entry).join(" ")}
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
    this.systemctl("daemon-reload");
    this.systemctl("enable", "--now", `${unit}.timer`);
  },

  remove(app, entry) {
    const unit = unitName(app, entry.id);
    try {
      this.systemctl("disable", "--now", `${unit}.timer`);
    } catch {
      // fanns inte – fortsätt och städa
    }
    for (const ext of ["service", "timer"]) fs.rmSync(path.join(UNITS, `${unit}.${ext}`), { force: true });
    this.systemctl("daemon-reload");
  },
};

// ------------------------------------------------------------------ Gulapp: Windows Schemaläggaren

const TASKS = path.join(DATA, "schedules");
const DAYS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const ORDER = Object.keys(DAYS);

// Samma tidsuttryck som på Gulnux, i den delmängd Schemaläggaren kan uttrycka
function parseWhen(when) {
  const w = when.trim();
  const time = (h, m) => `${h.padStart(2, "0")}:${m}`;
  let m;
  if (/^daily$/i.test(w)) return { kind: "daily", at: "00:00" };
  if (/^weekly$/i.test(w)) return { kind: "weekly", days: ["Monday"], at: "00:00" };
  if (/^hourly$/i.test(w)) return { kind: "hourly" };
  if ((m = /^(?:\*-\*-\*\s+)?(\d{1,2}):(\d{2})(?::00)?$/.exec(w))) return { kind: "daily", at: time(m[1], m[2]) };
  if ((m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(w))) {
    return { kind: "once", at: `${m[1]} ${m[2] ? time(m[2], m[3]) : "00:00"}` };
  }
  if ((m = /^([A-Za-z.,]+)\s+(\d{1,2}):(\d{2})$/.exec(w))) {
    const days = new Set();
    for (const part of m[1].toLowerCase().split(",")) {
      const [from, to] = part.split("..").map((d) => d.slice(0, 3));
      if (!(from in DAYS) || (to && !(to in DAYS))) return null;
      const [a, b] = [ORDER.indexOf(from), ORDER.indexOf(to || from)];
      for (let i = a; ; i = (i + 1) % 7) {
        days.add(DAYS[ORDER[i]]);
        if (i === b) break;
      }
    }
    return { kind: "weekly", days: [...days], at: time(m[2], m[3]) };
  }
  return null;
}

const REGISTER = `
$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c "' + $env:GT_CMD + '"')
$at = [datetime]::ParseExact($env:GT_AT, $env:GT_FORMAT, [Globalization.CultureInfo]::InvariantCulture)
switch ($env:GT_KIND) {
  'once'   { $trigger = New-ScheduledTaskTrigger -Once -At $at }
  'daily'  { $trigger = New-ScheduledTaskTrigger -Daily -At $at }
  'weekly' { $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek ($env:GT_DAYS -split ',') -At $at }
  'hourly' { $trigger = New-ScheduledTaskTrigger -Once -At $at -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650) }
}
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $env:GT_NAME -TaskPath '\\Gulnux\\' -Action $action -Trigger $trigger -Settings $settings -Description $env:GT_DESC -Force | Out-Null
$next = (Get-ScheduledTaskInfo -TaskName $env:GT_NAME -TaskPath '\\Gulnux\\').NextRunTime
if ($next) { $next.ToString('yyyy-MM-dd HH:mm') }
`;

function powershell(script, env) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const windows = {
  check(when) {
    const trigger = parseWhen(when);
    if (!trigger) {
      throw new GtError(`"${when}" is not a valid time in Gulapp (daily, hourly, weekly, "08:00", "Mon..Fri 08:00", "Mon,Wed 17:30", "2026-10-30 09:00")`);
    }
    if (trigger.kind === "once" && new Date(trigger.at.replace(" ", "T")) <= new Date()) {
      throw new GtError(`"${when}" never happens again – pick a time in the future`);
    }
    return null; // nästa körning kommer från Schemaläggaren när uppgiften registreras
  },

  exists: (app, entry) => fs.existsSync(path.join(TASKS, `${unitName(app, entry.id)}.cmd`)),

  install(app, entry) {
    const name = unitName(app, entry.id);
    // Ett .cmd-kommando (Gulapps gt.cmd) måste anropas med call, annars körs inte raden efter
    const command = gtCommand();
    const gt = (/\.(cmd|bat)$/i.test(command[0]) ? "call " : "") + quoted(command);
    fs.mkdirSync(TASKS, { recursive: true });
    const cmd = path.join(TASKS, `${name}.cmd`);
    // En engångshandling tar bort sitt schema först när den har lyckats
    fs.writeFileSync(cmd, [
      "@echo off",
      `${gt} ${gtArgs(app, entry).join(" ")}`,
      ...(entry.once ? [`if not errorlevel 1 ${gt} unschedule ${app.name} ${entry.id}`] : []),
      "",
    ].join("\r\n"));
    if (process.env.GT_DRY) return null;
    const trigger = parseWhen(entry.when);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const at = trigger.kind === "once" ? trigger.at
      : trigger.kind === "hourly" ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
        : trigger.at;
    try {
      return powershell(REGISTER, {
        GT_NAME: name,
        GT_CMD: cmd,
        GT_KIND: trigger.kind,
        GT_AT: at,
        GT_FORMAT: at.includes("-") ? "yyyy-MM-dd HH:mm" : "HH:mm",
        GT_DAYS: (trigger.days || []).join(","),
        GT_DESC: `Good Times: ${app.title} – ${entry.tool} (${entry.when})${entry.writes ? " – changes data" : ""}`,
      }) || null;
    } catch (e) {
      throw new GtError(`Windows Task Scheduler refused the schedule: ${(e.stderr || e.message).trim().split("\n")[0]}`);
    }
  },

  remove(app, entry) {
    const name = unitName(app, entry.id);
    if (!process.env.GT_DRY) {
      try {
        powershell("Unregister-ScheduledTask -TaskName $env:GT_NAME -TaskPath '\\Gulnux\\' -Confirm:$false", { GT_NAME: name });
      } catch {
        // fanns inte – fortsätt och städa
      }
    }
    fs.rmSync(path.join(TASKS, `${name}.cmd`), { force: true });
  },
};

const backend = WINDOWS ? windows : systemd;

// ------------------------------------------------------------------ gemensamt

function newId(app, tool) {
  const taken = new Set(app.schedules.map((s) => s.id));
  for (let n = 1; ; n++) {
    const id = n === 1 ? tool : `${tool}-${n}`;
    if (!taken.has(id)) return id;
  }
}

// confirm: användaren har godkänt att ett verktyg som ändrar data körs utan att hen är med
export async function schedule(app, toolName, when, args = {}, { confirm = false, once = false } = {}) {
  const tool = await loadTool(app, toolName);
  if (tool.meta.writes && !confirm) {
    throw new GtError(`${toolName} changes data in ${app.title}. Only schedule it after the user approved exactly what, when and with which values (--yes, MCP: confirm: true).`);
  }
  let next = backend.check(when);
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
  next = backend.install(app, entry) || next;
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
  backend.remove(app, entry);
  app.schedules = app.schedules.filter((s) => s.id !== entry.id);
  saveApp(app);
  return `${app.title}: ${entry.tool} (${entry.id}) is no longer scheduled`;
}

// Skapar timers för alla scheman i app.json som saknas här (t.ex. på en ny dator)
export function sync() {
  let created = 0;
  for (const app of listApps()) {
    for (const entry of app.schedules) {
      if (!entry.id) entry.id = entry.tool; // scheman från före id:n
      if (backend.exists(app, entry)) continue;
      backend.install(app, entry);
      created++;
    }
    saveApp(app);
  }
  return created;
}

export function listSchedules() {
  return listApps().flatMap((app) => app.schedules.map((s) => ({ app: app.name, title: app.title, ...s })));
}

export { parseWhen };
