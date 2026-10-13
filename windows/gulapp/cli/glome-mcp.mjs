// glome-mcp – MCP-server (stdio) som ger agenterna full kontroll över Glome via Chrome
// DevTools MCP, som glome-mcp.sh på Gulnux. Startar Glome först om den inte redan körs.
// Inget får skrivas till stdout här – det är MCP-kanalen.

import { spawn } from "node:child_process";
import { CDP, glomeRunning, openGlome } from "../lib/glome.mjs";

if (!(await glomeRunning())) {
  try {
    await openGlome([], { wait: true });
  } catch (e) {
    console.error(`glome-mcp: ${e.message}`);
  }
}

// npx är en .cmd-fil på Windows och måste startas via cmd
const child = spawn("cmd.exe", ["/d", "/s", "/c", "npx", "-y", "chrome-devtools-mcp@latest", "--browserUrl", CDP, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1", CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1" },
  windowsHide: true,
});
child.on("exit", (code) => process.exit(code ?? 1));
