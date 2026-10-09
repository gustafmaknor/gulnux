// Startar en lärsession: en agent i ett eget terminalfönster som lär sig appen i Glome
// tillsammans med användaren och skriver anteckningar, verktyg och SKILL.md.

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GtError, agentName, createApp, findAppByUrl, toolNames } from "./core.mjs";
import { captureSession, currentGlomePage } from "./session.mjs";

const PROMPTS = process.env.GT_PROMPTS || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "agent", "prompts");

function prompt(app, isNew, session) {
  const text = fs.readFileSync(path.join(PROMPTS, "gt-learn.md"), "utf8");
  const tools = toolNames(app);
  const intro = isNew
    ? "GT har inte sett appen förut, så du börjar från början."
    : `GT har lärt sig appen förut. Läs \`SKILL.md\` och \`notes/\` först och fortsätt därifrån. Verktyg som finns: ${tools.join(", ") || "inga än"}.`;
  return text
    .replaceAll("@TITLE@", app.title)
    .replaceAll("@URL@", app.startUrl)
    .replaceAll("@APP@", app.name)
    .replaceAll("@DIR@", app.dir)
    .replaceAll("@NEW@", intro)
    .replaceAll("@SESSION@", session);
}

export async function learn(url, { agent = agentName(), window = true, dryRun = false } = {}) {
  let title = "";
  if (!url) {
    const page = await currentGlomePage();
    url = page.url;
    title = page.title;
  }
  if (!/^https?:\/\//.test(url)) throw new GtError("Good Times can only learn web apps (http or https).");
  if (!["claude", "codex"].includes(agent)) throw new GtError(`Learning works with claude or codex so far (chosen agent: ${agent}).`);

  let app = findAppByUrl(url);
  const isNew = !app;
  if (!app) app = createApp(url, title);

  let session;
  try {
    const s = await captureSession(app);
    session = `${s.cookies} kakor och ${s.localStorage} localStorage-värden är kopierade, så \`gt run\` är inloggat.`;
  } catch (e) {
    session = `den kunde inte kopieras än (${e.message}). Be användaren logga in i Glome och kör sedan \`gt session ${app.name}\`.`;
  }

  const command = [agent, prompt(app, isNew, session)];
  if (dryRun) return { app, isNew, command };

  if (window) {
    const child = spawn("foot", ["--app-id", "gt-learn", "--title", `Good Times: ${app.title}`, "-D", app.dir, ...command], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } else {
    spawnSync(command[0], command.slice(1), { cwd: app.dir, stdio: "inherit" });
  }
  return { app, isNew, command };
}
