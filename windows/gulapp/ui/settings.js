// Gulapps inställningar. All text från systemet sätts som text, aldrig som HTML.

const $ = (id) => document.getElementById(id);
// ~ i stället för hemkatalogen
const kort = (p) => (s.home && p.toLowerCase().startsWith(s.home.toLowerCase()) ? "~" + p.slice(s.home.length) : p);
let s;

const KRAV = [
  { key: "edge", title: "Microsoft Edge", why: "Glome är Edge med en egen profil" },
  { key: "terminal", title: "Windows Terminal", why: "agenten körs i en terminal", install: null },
  { key: "claude", title: "Claude Code", why: "en av agenterna", install: "claude", optional: "codex" },
  { key: "codex", title: "Codex", why: "en av agenterna", install: "codex", optional: "claude" },
  { key: "node", title: "Node.js", why: "Good Times och Glomes MCP-server", install: "node" },
  { key: "uv", title: "uv", why: "installerar Python-miljön", install: "uv" },
  { key: "python", title: "Python-miljön", why: "sökningen, Greed och Gloffice", install: "python" },
  { key: "git", title: "Git", why: "det personliga repot", install: "git" },
  { key: "ollama", title: "Ollama (frivilligt)", why: "sökning på betydelse med bge-m3 – utan den söker Gulapp på ord", install: "ollama", optional: true },
];

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function log(line) {
  const pre = $("logg");
  pre.textContent += line + "\n";
  pre.scrollTop = pre.scrollHeight;
}

function render() {
  // Agent
  const agenter = $("agenter");
  agenter.replaceChildren(...s.agents.map((a) => {
    const input = el("input", { type: "radio", name: "agent", value: a, checked: a === s.agent });
    input.addEventListener("change", () => save({ agent: a }));
    return el("label", {}, input, a === "claude" ? "Claude Code" : "Codex", s.system[a] ? "" : " (inte installerad)");
  }));
  $("agent-info").textContent = s.repoAgent
    ? `settings.nix i ditt repo väljer ${s.repoAgent}. Valet här gäller bara den här datorn.`
    : "Agenten får Gulnux kontext, ditt minne och MCP-servrar för Glome, sökningen, Greed, Gloffice och GT.";

  // Dokument
  $("dokument").textContent = kort(s.settings.documents);
  $("glome-lage").value = s.settings.glomePages;

  // Repo
  $("repo-ja").hidden = !s.system.repo;
  $("repo-nej").hidden = Boolean(s.system.repo);
  $("repo").textContent = kort(s.repo);

  // Bakgrund
  for (const name of ["gulsearch", "greed"]) {
    $(`tjanst-${name}`).checked = s.settings.services[name];
    $(`kor-${name}`).textContent = s.services[name] ? "körs" : s.settings.services[name] ? "startar …" : "";
  }
  $("autostart").checked = s.autostart;

  // Krav
  $("krav").replaceChildren(...KRAV.map((k) => {
    const ok = Boolean(s.system[k.key]);
    const alt = typeof k.optional === "string" && s.system[k.optional];
    const punkt = el("span", { className: `punkt ${ok ? "ja" : k.optional && (alt || k.optional === true) ? "" : "nej"}` });
    const text = el("div", { className: "fyll" }, el("div", {}, k.title), el("div", { className: "liten" }, ok ? String(s.system[k.key]) : k.why));
    const row = el("div", { className: "rad" }, punkt, text);
    if (!ok && k.install) {
      const b = el("button", { textContent: "Installera" });
      b.addEventListener("click", () => install(k.install, b));
      row.append(b);
    }
    return row;
  }));
}

async function save(changes) {
  s = await window.gulapp.save(changes);
  render();
}

async function install(what, button) {
  button.disabled = true;
  if (what === "python") {
    if (!s.system.uv) {
      log("Installera uv först.");
    } else {
      log("Installerar Python-miljön (tar någon minut första gången) …");
      const r = await window.gulapp.installPython();
      log(r.ok ? "Klart." : `Fel: ${r.message}`);
    }
  } else {
    await window.gulapp.install(what);
    log(`Installationen av ${what} körs i en terminal. Listan uppdateras när du kommer tillbaka hit.`);
  }
  s = await window.gulapp.state();
  render();
}

$("starta").addEventListener("click", () => window.gulapp.openAgent());
$("byt-mapp").addEventListener("click", async () => {
  const dir = await window.gulapp.chooseFolder();
  if (dir) save({ documents: dir });
});
$("glome-lage").addEventListener("change", (e) => save({ glomePages: e.target.value }));
$("oppna-repo").addEventListener("click", () => window.gulapp.openPath(s.repo));
$("klona").addEventListener("click", async () => {
  $("klona").disabled = true;
  log("Klonar ditt personliga repo …");
  const r = await window.gulapp.clone($("github").value.trim());
  log(r.ok ? "Klart. Minnet och GT-apparna finns nu i Gulapp." : `Fel: ${r.message}`);
  $("klona").disabled = false;
  s = await window.gulapp.state();
  render();
});
for (const name of ["gulsearch", "greed"]) {
  $(`tjanst-${name}`).addEventListener("change", (e) => save({ services: { ...s.settings.services, [name]: e.target.checked } }));
}
$("autostart").addEventListener("change", (e) => save({ autostart: e.target.checked }));
window.gulapp.onLog(log);

// Uppdatera när fönstret får fokus igen (t.ex. efter en installation i terminalen)
window.addEventListener("focus", async () => {
  s = await window.gulapp.state();
  render();
});

window.gulapp.state().then((state) => {
  s = state;
  render();
});
