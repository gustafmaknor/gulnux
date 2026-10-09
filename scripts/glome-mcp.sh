# glome-mcp – MCP-server (stdio) som ger agenterna full kontroll över Glome
# via Chrome DevTools MCP. Startar Glome först om den inte redan körs.
# Inget får skrivas till stdout här – det är MCP-kanalen.

port="${GLOME_PORT:-9222}"
url="http://127.0.0.1:$port"
export CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1
export CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1

running() { curl -sf "$url/json/version" >/dev/null; }

if ! running && [ -n "${WAYLAND_DISPLAY:-}" ]; then
  setsid -f glome >/dev/null 2>&1
  for _ in $(seq 50); do
    running && break
    sleep 0.2
  done
fi

if running; then
  exec npx -y chrome-devtools-mcp@latest --browserUrl "$url" "$@"
fi

# Ingen grafisk session (t.ex. på en tty eller live-ISO:n): kör en egen osynlig Chromium
exec npx -y chrome-devtools-mcp@latest --executablePath "$(command -v chromium)" --headless --isolated "$@"
