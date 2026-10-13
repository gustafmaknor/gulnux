// Glome i Gulapp: Microsoft Edge med en egen profil, fjärrstyrning för agenterna (CDP på
// 9222) och Gulnux tillägg – som glome.sh på Gulnux. Edge har ingen policy utan
// administratörsrättigheter, så startsidan skickas med när Glome startar och knapparna fästs
// i profilens inställningar.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CONFIG, EXTENSIONS, GLOME_PORT, GLOME_PROFILE, browserPath, readJson, startPage, writeJson } from "./config.mjs";

export const CDP = `http://127.0.0.1:${GLOME_PORT}`;

export async function reachable(url, timeout = 800) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return true;
  } catch {
    return false;
  }
}

export const glomeRunning = () => reachable(`${CDP}/json/version`);

// Sökknappen följer sökningens Glome-läge (off stänger av den), som på Gulnux
function extensionDirs() {
  const mode = readJson(path.join(CONFIG, "gulsearch", "config.json"), {}).glome || "manual";
  return Object.entries(EXTENSIONS)
    .filter(([name, e]) => fs.existsSync(e.dir) && !(name === "search" && mode === "off"))
    .map(([, e]) => e.dir);
}

// Fäst knapparna i verktygsfältet en gång per profil, och bara när Glome inte körs
function pinButtons() {
  const prefs = path.join(GLOME_PROFILE, "Default", "Preferences");
  const done = path.join(GLOME_PROFILE, ".gulnux-fasta-knappar");
  if (fs.existsSync(done)) return;
  // En ny profil får inställningen redan från början
  const p = fs.existsSync(prefs) ? readJson(prefs, null) : {};
  if (!p) return;
  const ids = Object.values(EXTENSIONS).map((e) => e.id);
  p.extensions = p.extensions || {};
  p.extensions.pinned_extensions = [...new Set([...(p.extensions.pinned_extensions || []), ...ids])];
  // Annars "migrerar" Edge fästa tillägg vid första starten och tömmer listan
  p.extensions.pinned_extension_migration = true;
  writeJson(prefs, p);
  fs.writeFileSync(done, "");
}

export async function openGlome(args = [], { wait = false } = {}) {
  const browser = browserPath();
  if (!browser) throw new Error("Glome needs Microsoft Edge, and it was not found");
  const running = await glomeRunning();
  if (!running) pinButtons();
  const dirs = extensionDirs();
  const urls = args.filter((a) => !a.startsWith("--"));
  const start = urls.length || running ? [] : [startPage(await reachable("http://127.0.0.1:9303/start"))];
  const child = spawn(browser, [
    `--user-data-dir=${GLOME_PROFILE}`,
    `--remote-debugging-port=${GLOME_PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    // Bara en --disable-features räknas. msImplicitSignin: Glome loggas inte in med datorns
    // Microsoft-konto av sig själv (och synkar då inte agentens surfande till jobbkontot).
    "--disable-features=DisableLoadExtensionCommandLineSwitch,msImplicitSignin",
    ...(dirs.length ? [`--load-extension=${dirs.join(",")}`] : []),
    ...args,
    ...start,
  ], { detached: true, stdio: "ignore" });
  child.unref();
  if (wait) {
    for (let i = 0; i < 50 && !(await glomeRunning()); i++) await new Promise((r) => setTimeout(r, 200));
  }
}
