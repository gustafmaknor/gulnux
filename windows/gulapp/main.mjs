// Gulapp – Gulnux för Windows. En ikon i aktivitetsfältet som visar vad agenten gör och
// samlar Glome, sökningen, Greed, Gloffice och Gul-agenten, och som håller sökningen och
// Greed igång i bakgrunden (det systemd gör på Gulnux).

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AGENTS, BIN, GULAPP, HOME, LOCAL_DIR, LOGS, REPO, STATE, agentName, readJson, repoAgent, saveSettings, settings } from "./lib/config.mjs";
import { commands } from "./lib/commands.mjs";
import { openGlome, reachable } from "./lib/glome.mjs";
import { startBridge } from "./lib/gtbridge.mjs";
import { appIco, statusIcon } from "./lib/icons.mjs";
import { checkSystem, clonePersonal, installPython, setup, writeAgentChoice, writeSearchConfig } from "./lib/setup.mjs";

// Electrons cache hör inte hemma bredvid settings.json i %APPDATA%\Gulapp
app.setPath("userData", path.join(LOCAL_DIR, "electron"));
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId("se.gulnux.gulapp");

// Barnprocesserna (tjänsterna, glome, gul) hittar Gulnux kommandon
process.env.PATH = `${BIN};${process.env.PATH}`;

let tray = null;
const windows = {};

// ---------------------------------------------------------------- bakgrundstjänster

const SERVICES = {
  gulsearch: { args: ["watch"], title: "Sökningen" },
  greed: { args: ["watch"], title: "Greed" },
};
const running = {};

function startService(name) {
  if (running[name] || !settings().services[name]) return;
  const cmd = commands()[name];
  if (!cmd) return; // Python-miljön saknas än
  fs.mkdirSync(LOGS, { recursive: true });
  const log = fs.openSync(path.join(LOGS, `${name}.log`), "a");
  const child = spawn(cmd.exe, [...cmd.args, ...SERVICES[name].args], {
    env: { ...process.env, ...cmd.env }, stdio: ["ignore", log, log], windowsHide: true,
  });
  running[name] = child;
  child.on("exit", (code) => {
    fs.closeSync(log);
    delete running[name];
    // Som Restart=on-failure: försök igen om en stund, om tjänsten fortfarande ska vara på
    if (!app.isQuitting && code !== 0) setTimeout(() => startService(name), 60_000);
  });
}

function stopService(name) {
  running[name]?.kill();
  delete running[name];
}

function syncServices() {
  for (const name of Object.keys(SERVICES)) {
    if (settings().services[name]) startService(name);
    else stopService(name);
  }
}

// ---------------------------------------------------------------- agenten

function agentPid() {
  const p = readJson(path.join(STATE, "agent.pid"), null);
  if (!p) return null;
  try {
    process.kill(p.pid, 0);
    return p.pid;
  } catch {
    return null;
  }
}

function agentState() {
  if (!agentPid()) return { state: "off", text: "är inte igång" };
  const s = readJson(path.join(STATE, "agent.json"), { state: "idle", text: "väntar på dig", time: 0 });
  // En arbetsstatus som inte uppdaterats på 10 minuter avbröts troligen
  if (s.state === "working" && Date.now() / 1000 - s.time > 600) return { state: "idle", text: "väntar på dig" };
  return s;
}

// Agenten körs i Windows Terminal, i ett eget fönster som heter gul
function openAgent() {
  if (agentPid()) {
    execFile("wt.exe", ["-w", "gul", "focus-tab", "-t", "0"], () => {});
    return;
  }
  const gul = path.join(BIN, "gul.cmd");
  execFile("wt.exe", ["-w", "gul", "new-tab", "--title", "Gul", "-d", HOME, "cmd.exe", "/k", gul], (err) => {
    if (err) spawn("cmd.exe", ["/c", "start", "Gul", "/d", HOME, "cmd.exe", "/k", gul], { detached: true, stdio: "ignore" }).unref();
  });
}

// ---------------------------------------------------------------- ikonen

const icons = {};
function icon(state, frame = 0) {
  const key = `${state}-${frame}`;
  icons[key] ||= nativeImage.createFromBuffer(statusIcon(state, 32, frame), { scaleFactor: 2 });
  return icons[key];
}

let last = { state: "", text: "" };
let frame = 0;
function updateTray() {
  const s = agentState();
  const name = agentName();
  if (s.state === "working") frame = (frame + 1) % 8;
  tray.setImage(icon(s.state, s.state === "working" ? frame : 0));
  if (s.state !== last.state || s.text !== last.text) {
    tray.setToolTip(`Gulapp – ${name} ${s.text}`.slice(0, 127));
    if (s.state === "attention" && last.state !== "attention") {
      const n = new Notification({ title: `${name} behöver dig`, body: "Klicka för att gå till agenten", icon: icon("attention") });
      n.on("click", openAgent);
      n.show();
    }
    last = s;
    buildMenu();
  }
}

function openGreed() {
  startService("greed");
  openGlome(["--app=http://127.0.0.1:9303/"]).catch(showError);
}

function openGloffice() {
  const cmd = commands().gloffice;
  if (!cmd) return showError(new Error("Gloffice behöver Python-miljön – installera den i inställningarna"));
  spawn(cmd.exe, cmd.args, { env: { ...process.env, ...cmd.env }, detached: true, stdio: "ignore", windowsHide: true }).unref();
}

function buildMenu() {
  const s = agentState();
  const name = agentName();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${name} ${s.text}`, enabled: false },
    { label: agentPid() ? "Gå till agenten" : "Starta agenten", click: openAgent },
    { type: "separator" },
    { label: "Glome", click: () => openGlome().catch(showError) },
    { label: "Sök …", click: () => openWindow("search") },
    { label: "Greed", click: openGreed },
    { label: "Gloffice", click: openGloffice },
    { type: "separator" },
    { label: "Inställningar", click: () => openWindow("settings") },
    { label: "Avsluta Gulapp", click: () => app.quit() },
  ]));
}

function showError(e) {
  new Notification({ title: "Gulapp", body: e.message }).show();
}

// ---------------------------------------------------------------- fönster

const SIZES = { settings: [560, 760], search: [720, 560] };

function openWindow(name) {
  if (windows[name] && !windows[name].isDestroyed()) {
    windows[name].show();
    windows[name].focus();
    return;
  }
  const [width, height] = SIZES[name];
  const w = new BrowserWindow({
    width, height, show: false, autoHideMenuBar: true, backgroundColor: "#F7F4EC",
    icon: icon("idle"), title: name === "settings" ? "Gulapp – inställningar" : "Gulapp – sök",
    webPreferences: { preload: path.join(GULAPP, "ui", "preload.cjs"), sandbox: true, contextIsolation: true },
  });
  w.loadFile(path.join(GULAPP, "ui", `${name}.html`));
  w.once("ready-to-show", () => w.show());
  // Länkar öppnas i Glome, inte i Gulapp
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) openGlome([url]).catch(showError);
    return { action: "deny" };
  });
  windows[name] = w;
}

function send(name, channel, data) {
  const w = windows[name];
  if (w && !w.isDestroyed()) w.webContents.send(channel, data);
}

function state() {
  return {
    settings: settings(),
    agent: agentName(),
    repoAgent: repoAgent(),
    agents: AGENTS,
    system: checkSystem(),
    services: Object.fromEntries(Object.keys(SERVICES).map((n) => [n, Boolean(running[n])])),
    repo: REPO,
    home: HOME,
    autostart: app.getLoginItemSettings().openAtLogin,
  };
}

ipcMain.handle("state", () => state());

ipcMain.handle("save", (_e, changes) => {
  const s = saveSettings(changes);
  if ("agent" in changes) writeAgentChoice(changes.agent);
  if ("documents" in changes || "glomePages" in changes) writeSearchConfig(s);
  if ("autostart" in changes) setAutostart(s.autostart);
  if ("services" in changes) syncServices();
  setup({ electron: process.execPath }); // GLOFFICE_DIR med mera i kommandona
  buildMenu();
  return state();
});

ipcMain.handle("choose-folder", async () => {
  const r = await dialog.showOpenDialog(windows.settings, { properties: ["openDirectory"], defaultPath: settings().documents });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("install-python", async () => {
  try {
    await installPython((line) => send("settings", "log", line));
    setup({ electron: process.execPath });
    syncServices();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle("clone", async (_e, github) => {
  try {
    await clonePersonal(github, (line) => send("settings", "log", line));
    writeSearchConfig();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

// Installationer som behöver användaren (inloggning, villkor) körs synligt i en terminal
const INSTALL = {
  uv: ["winget", "install", "--id", "astral-sh.uv", "-e", "--scope", "user"],
  node: ["winget", "install", "--id", "OpenJS.NodeJS.LTS", "-e"],
  claude: ["powershell", "-NoProfile", "-Command", "irm https://claude.ai/install.ps1 | iex"],
  codex: ["npm", "install", "-g", "@openai/codex"],
  git: ["winget", "install", "--id", "Git.Git", "-e"],
  ollama: ["winget", "install", "--id", "Ollama.Ollama", "-e"],
};
ipcMain.handle("install", (_e, what) => {
  const cmd = INSTALL[what];
  if (!cmd) return;
  execFile("wt.exe", ["-w", "gul", "new-tab", "--title", `Installerar ${what}`, "cmd.exe", "/k", ...cmd], () => {});
});

ipcMain.handle("search", (_e, query) => new Promise((resolve) => {
  const cmd = commands().gulsearch;
  if (!cmd) return resolve({ error: "Sökningen behöver Python-miljön – installera den i inställningarna" });
  execFile(cmd.exe, [...cmd.args, "search", "--json", ...String(query).split(/\s+/).filter(Boolean)],
    { env: { ...process.env, ...cmd.env }, encoding: "utf8", windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (err) return resolve({ error: (stderr || err.message).trim().split("\n").pop() });
      try {
        resolve({ ...JSON.parse(stdout), home: HOME });
      } catch {
        resolve({ error: "Sökningen svarade inte som väntat" });
      }
    });
}));

// Öppna en träff: webbsidor i Glome, Office-filer i Gloffice, annat med Windows
ipcMain.handle("open", (_e, hit) => {
  const target = String(hit.sokvag || "");
  if (/^https?:\/\//.test(target)) return openGlome([target]).catch(showError);
  if (!path.isAbsolute(target) || !fs.existsSync(target)) return;
  const cmd = commands().gloffice;
  if (cmd && /\.(docx|xlsx|pptx)$/i.test(target)) {
    spawn(cmd.exe, [...cmd.args, target], { env: { ...process.env, ...cmd.env }, detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    shell.openPath(target);
  }
});

ipcMain.handle("open-agent", () => openAgent());
ipcMain.handle("open-path", (_e, p) => shell.openPath(p));

// ---------------------------------------------------------------- start

function setAutostart(on) {
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: app.isPackaged ? [] : [GULAPP] });
}

// En genväg i Start-menyn, med Gulnux sol som ikon
function startMenuShortcut() {
  const ico = path.join(LOCAL_DIR, "gulapp.ico");
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(ico, appIco());
  const lnk = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Gulapp.lnk");
  shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? "replace" : "create", {
    target: process.execPath,
    args: app.isPackaged ? "" : `"${GULAPP}"`,
    description: "Gulnux för Windows",
    icon: ico,
    iconIndex: 0,
    appUserModelId: "se.gulnux.gulapp",
  });
}

app.on("second-instance", () => openWindow("settings"));
app.on("window-all-closed", () => {}); // Gulapp lever kvar i aktivitetsfältet
app.on("before-quit", () => {
  app.isQuitting = true;
  for (const name of Object.keys(running)) stopService(name);
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const first = !fs.existsSync(path.join(LOCAL_DIR, "bin"));
  try {
    setup({ electron: process.execPath });
    // Tester (GULAPP_DRY) rör inte Start-menyn eller autostarten
    if (!process.env.GULAPP_DRY) {
      startMenuShortcut();
      if (first) setAutostart(settings().autostart);
    }
  } catch (e) {
    showError(e);
  }
  tray = new Tray(icon("off"));
  tray.on("click", openAgent);
  buildMenu();
  updateTray();
  setInterval(updateTray, 700);
  syncServices();
  startBridge(() => commands()["gt-native-host"]); // GT-knappen när native messaging är avstängt
  // Första gången, eller när något viktigt saknas: visa inställningarna
  const sys = checkSystem();
  if (first || !sys.python || !(sys.claude || sys.codex) || process.argv.includes("--settings")) openWindow("settings");
  // Startsidan kommer från Greed – utan Greed fungerar den ändå som fil
  if (!(await reachable("http://127.0.0.1:9303/start"))) startService("greed");
  if (process.env.GULAPP_SHOT) screenshots(process.env.GULAPP_SHOT);
});

// Skärmdumpar till README:n: GULAPP_SHOT=<katalog> [GULAPP_SHOT_QUERY=<sökning>]
async function screenshots(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  openWindow("settings");
  openWindow("search");
  await wait(2500);
  if (process.env.GULAPP_SHOT_QUERY) {
    await windows.search.webContents.executeJavaScript(
      `document.getElementById("fraga").value = ${JSON.stringify(process.env.GULAPP_SHOT_QUERY)};
       document.getElementById("sok").requestSubmit();`);
    await wait(4000);
  }
  for (const name of ["settings", "search"]) {
    fs.writeFileSync(path.join(dir, `${name}.png`), (await windows[name].webContents.capturePage()).toPNG());
  }
  for (const s of ["off", "idle", "working", "attention"]) fs.writeFileSync(path.join(dir, `ikon-${s}.png`), statusIcon(s, 64, 1));
  app.quit();
}
