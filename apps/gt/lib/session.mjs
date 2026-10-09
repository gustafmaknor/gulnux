// Delar inloggningen mellan Glome och GT: appens kakor och localStorage hämtas från Glome
// via DevTools-protokollet och sparas som en Playwright storageState, bara läsbar för användaren.

import fs from "node:fs";
import path from "node:path";
import { GLOME, GtError, sessionFile } from "./core.mjs";

// Kör några CDP-anrop i tur och ordning och returnerar deras resultat
export function cdp(wsUrl, calls) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const results = [];
    let i = 0;
    const next = () => {
      if (i === calls.length) {
        ws.close();
        resolve(results);
      } else {
        ws.send(JSON.stringify({ id: i + 1, ...calls[i] }));
      }
    };
    ws.onopen = next;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== i + 1) return;
      if (msg.error) {
        ws.close();
        reject(new GtError(`Glome: ${msg.error.message}`));
        return;
      }
      results.push(msg.result);
      i++;
      next();
    };
    ws.onerror = () => reject(new GtError("Could not talk to Glome"));
  });
}

async function glome(pathname) {
  try {
    return await (await fetch(`${GLOME}${pathname}`)).json();
  } catch {
    throw new GtError("Glome is not running – open the app in Glome and log in first.");
  }
}

export async function glomePages() {
  const targets = await glome("/json/list");
  return targets.filter((t) => t.type === "page" && /^https?:/.test(t.url));
}

export async function currentGlomePage() {
  const [page] = await glomePages();
  if (!page) throw new GtError("No web page is open in Glome – open the app you want GT to learn.");
  return page;
}

function matchesDomain(cookieDomain, domains) {
  const d = cookieDomain.replace(/^\./, "").toLowerCase();
  return domains.some((x) => d === x || d.endsWith(`.${x}`));
}

function toPlaywright(c) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.session || c.expires === undefined ? -1 : c.expires,
    httpOnly: Boolean(c.httpOnly),
    secure: Boolean(c.secure),
    sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "Lax",
  };
}

export async function captureSession(app) {
  const version = await glome("/json/version");
  const [{ cookies }] = await cdp(version.webSocketDebuggerUrl, [{ method: "Storage.getCookies" }]);
  const kept = cookies.filter((c) => matchesDomain(c.domain, app.domains)).map(toPlaywright);

  // localStorage finns bara i en öppen flik för appen; många appar har sin token där
  const pages = await glomePages();
  const origins = [];
  for (const origin of app.origins) {
    const page = pages.find((p) => p.url.startsWith(`${origin}/`) || p.url === origin);
    if (!page) continue;
    const [{ result }] = await cdp(page.webSocketDebuggerUrl, [{
      method: "Runtime.evaluate",
      params: { expression: "JSON.stringify(Object.entries(localStorage))", returnByValue: true },
    }]);
    const entries = JSON.parse(result.value || "[]");
    origins.push({ origin, localStorage: entries.map(([name, value]) => ({ name, value })) });
  }

  if (!kept.length && !origins.some((o) => o.localStorage.length)) {
    throw new GtError(`Found no login for ${app.title} in Glome – open it in Glome and log in first.`);
  }

  const file = sessionFile(app);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ cookies: kept, origins }), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return { cookies: kept.length, localStorage: origins.reduce((n, o) => n + o.localStorage.length, 0) };
}
