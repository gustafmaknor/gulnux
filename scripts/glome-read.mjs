// glome-read – skriver ut innehållet i en Glome-flik, så att det kan läsas eller skickas till en agent
//
//   glome-read            text från senast använda flik
//   glome-read 2          text från flik nummer 2 (se --list)
//   glome-read --html     rå HTML i stället för text
//   glome-read --list     lista öppna flikar
//   glome-read --json     url, titel och sidans huvudtext som JSON (används av gul search save)
//
//   glome-read | claude -p "sammanfatta"

const port = process.env.GLOME_PORT ?? "9222";
const args = process.argv.slice(2);

let targets;
try {
  targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
} catch {
  console.error("glome-read: Glome körs inte (starta den med `glome`)");
  process.exit(1);
}

// Hoppa över webbläsarens interna sidor (ny flik, inställningar, utvecklarverktyg)
const pages = targets.filter((t) => t.type === "page" && !/^(chrome|edge|devtools|chrome-extension):/.test(t.url));

if (args.includes("--list")) {
  pages.forEach((p, i) => console.log(`${i}\t${p.title}\t${p.url}`));
  process.exit(0);
}

const page = pages[Number(args.find((a) => /^\d+$/.test(a)) ?? 0)];
if (!page) {
  console.error("glome-read: hittade ingen sådan flik");
  process.exit(1);
}

const html = args.includes("--html");
const json = args.includes("--json");
// Med --json: sidans huvudinnehåll om den märker upp det, samma som Glome-tilläggets knapp
const expression = html
  ? "document.documentElement.outerHTML"
  : json
    ? '(document.querySelector("article") || document.querySelector("main") || document.body).innerText'
    : "document.body.innerText";

const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.onopen = () =>
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id !== 1) return;
  const value = msg.result?.result?.value ?? "";
  if (json) {
    console.log(JSON.stringify({ url: page.url, titel: page.title, text: value }));
  } else {
    if (!html) console.log(`# ${page.title}\n${page.url}\n`);
    console.log(value);
  }
  ws.close();
};
ws.onerror = () => {
  console.error("glome-read: kunde inte ansluta till fliken");
  process.exit(1);
};
