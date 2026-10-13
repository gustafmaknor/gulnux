// Det som skiljer Gulnux (Linux) och Gulapp (Windows): notiser, terminalfönster och hur gt
// startar sig självt. Resten av GT är samma kod på båda.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WINDOWS = process.platform === "win32";
const GT_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "gt.mjs");

// Kommandot som startar gt. På Gulnux den stabila sökvägen i systemprofilen, så att scheman
// fortsätter fungera efter uppdateringar; annars Node med gt.mjs (Gulapp, tester).
const SYSTEM_GT = "/run/current-system/sw/bin/gt";

export function gtCommand() {
  if (process.env.GT_BIN) return [process.env.GT_BIN];
  if (!WINDOWS && fs.existsSync(SYSTEM_GT)) return [SYSTEM_GT];
  return [process.execPath, GT_SCRIPT];
}

// Windows-notis via PowerShell. Titel och text går via miljövariabler, så inget behöver citeras.
const TOAST = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$t = $x.GetElementsByTagName('text')
[void]$t.Item(0).AppendChild($x.CreateTextNode($env:GULNUX_TITLE))
[void]$t.Item(1).AppendChild($x.CreateTextNode($env:GULNUX_BODY))
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
`;

export function notify(title, body, urgent = false) {
  try {
    if (WINDOWS) {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", TOAST], {
        env: { ...process.env, GULNUX_TITLE: title, GULNUX_BODY: body },
        stdio: "ignore",
        timeout: 20000,
      });
    } else {
      execFileSync("notify-send", ["-a", "Gulnux", ...(urgent ? ["-u", "critical"] : []), title, body], { stdio: "ignore" });
    }
  } catch {
    // ingen notistjänst – resultatet finns i loggen
  }
}

// Öppna ett eget terminalfönster som kör command i cwd: foot på Gulnux, Windows Terminal i Gulapp
export function openTerminal(title, cwd, command) {
  const [program, args] = WINDOWS
    // cmd /k gör att .cmd-program (t.ex. codex från npm) också går att starta, och att fönstret blir kvar
    ? ["wt.exe", ["-w", "gul", "new-tab", "--title", title, "-d", cwd, "cmd.exe", "/k", ...command]]
    : ["foot", ["--app-id", "gt-learn", "--title", title, "-D", cwd, ...command]];
  const child = spawn(program, args, { detached: true, stdio: "ignore" });
  child.unref();
}
