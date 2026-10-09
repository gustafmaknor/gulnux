// Greed – sidan. Allt innehåll från flödena sätts som text (aldrig som HTML), eftersom det
// kommer från andra webbplatser.

const $ = (s) => document.querySelector(s);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
}

function icon(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = path; // bara våra egna, fasta ikoner
  return svg;
}
const UP = '<path d="M7 10v11H3V10z"/><path d="M7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7"/>';
const DOWN = '<path d="M17 14V3h4v11z"/><path d="M17 14l-4 8a3 3 0 0 1-3-3v-4H4a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.4 3H17"/>';
const SAVE = '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>';

async function api(url, body) {
  const options = { headers: { "X-Greed": "1" } };
  if (body !== undefined) {
    options.method = "POST";
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function status(text, error = false) {
  $("#status").textContent = text;
  $("#status").classList.toggle("error", error);
}

function when(seconds) {
  const d = new Date(seconds * 1000);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return today ? `Idag ${time}` : `${d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "short" })} ${time}`;
}

// ------------------------------------------------------------------ flödet

function card(pick) {
  const vote = (value) => async () => {
    const next = pick.feedback === value ? 0 : value;
    await api("/api/feedback", { id: pick.id, value: next });
    pick.feedback = next;
    render();
  };
  const save = async () => {
    status((await api("/api/save", { id: pick.id })).message);
    pick.saved = true;
    render();
  };
  return el("article", { class: `card${pick.kind === "surprise" ? " surprise" : ""}` },
    el("div", { class: "meta" },
      pick.sources.map((s) => el("span", { class: "chip" }, s)),
      pick.kind === "surprise" ? el("span", { class: "chip surprise" }, "Utanför din profil") : null),
    el("h3", {}, pick.url.startsWith("http")
      ? el("a", { href: `/go/${pick.id}`, target: "_blank", rel: "noopener" }, pick.title)
      : pick.title),
    pick.summary ? el("p", { class: "summary" }, pick.summary) : null,
    pick.reason ? el("p", { class: "reason" }, pick.reason) : null,
    el("div", { class: "actions" },
      el("button", { class: pick.feedback === 1 ? "on" : "", onclick: vote(1), "aria-label": "Mer sånt här" }, icon(UP), "Mer"),
      el("button", { class: pick.feedback === -1 ? "on" : "", onclick: vote(-1), "aria-label": "Mindre sånt här" }, icon(DOWN), "Mindre"),
      el("button", { class: pick.saved ? "on" : "", onclick: save, "aria-label": "Spara i Gulnux sök" }, icon(SAVE), pick.saved ? "Sparad" : "Spara")));
}

let digests = [];

function render() {
  const root = $("#flode");
  if (!digests.length) {
    root.replaceChildren(el("p", { class: "empty" },
      "Inget urval än. Greed samlar in hela tiden och väljer ut morgon, lunch och kväll. ",
      "Skriv dina intressen under Intressen, eller tryck på Uppdatera nu."));
    return;
  }
  root.replaceChildren(...digests.map((d) => el("section", { class: "digest" },
    el("h2", {}, when(d.created)),
    d.note ? el("p", { class: "note" }, d.note) : null,
    d.picks.length ? d.picks.map(card) : el("p", { class: "empty" }, "Inget som var värt din tid den här gången."))));
}

async function loadFeed() {
  digests = (await api("/api/today")).digests;
  render();
}

// ------------------------------------------------------------------ källor

const KIND = { rss: "RSS", glome: "Det du ser i Glome", gt: "Aktiv läsning (Good Times)" };

async function loadSources() {
  const { sources } = await api("/api/sources");
  const rows = sources.map((s) => {
    const state = s.state || {};
    const detail = state.last_error
      ? el("div", { class: "detail error" }, `Fel: ${state.last_error}`)
      : el("div", { class: "detail" }, [KIND[s.type], s.url || s.site || `${s.app} ${s.tool}`,
        state.last_fetch ? `senast ${when(state.last_fetch).toLowerCase()}` : null].filter(Boolean).join(" · "));
    const toggle = async () => {
      await api("/api/sources/update", { id: s.id, enabled: !s.enabled });
      loadSources();
    };
    const remove = async () => {
      await api("/api/sources/remove", { id: s.id });
      loadSources();
    };
    return el("div", { class: "source" },
      el("div", { class: "info" }, el("div", { class: "name" }, s.title), detail),
      el("button", { onclick: toggle }, s.enabled ? "Pausa" : "Slå på"),
      el("button", { onclick: remove, "aria-label": `Ta bort ${s.title}` }, "Ta bort"));
  });
  const input = el("input", { id: "ny-kalla", type: "url", placeholder: "Adress till ett RSS-flöde" });
  const add = async () => {
    try {
      await api("/api/sources", { url: input.value.trim() });
      loadSources();
    } catch (e) {
      status(e.message, true);
    }
  };
  $("#kallor").replaceChildren(
    ...rows,
    el("label", { for: "ny-kalla", class: "hint" }, "Lägg till ett RSS-flöde (nyhetssajter, YouTube, Reddit, Mastodon, Bluesky …)"),
    el("div", { class: "add" }, input, el("button", { onclick: add }, "Lägg till")),
    el("p", { class: "hint" },
      "Aktiv läsning av t.ex. Facebook eller X: lär Good Times sajten och be om ett verktyg som läser ditt flöde, ",
      "och lägg sedan till det med greed add --gt <app> <verktyg>. Det sker på ditt eget ansvar."));
}

// ------------------------------------------------------------------ intressen

async function loadProfile() {
  const p = await api("/api/profile");
  $("#profil").replaceChildren(
    el("p", { class: "hint" }, "Greed väljer efter de här intressena och efter dina Mer/Mindre. ",
      "Ändra i ", el("code", {}, "memory/greed.md"), " i ditt personliga repo, eller be agenten: ",
      el("em", {}, "\"lägg till fastighetsmarknaden i Stockholm i mina Greed-intressen\"")),
    el("div", { class: "profile" }, p.text));
}

// ------------------------------------------------------------------ start

const loaders = { flode: loadFeed, kallor: loadSources, profil: loadProfile };

document.querySelectorAll("nav button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    for (const id of Object.keys(loaders)) $(`#${id}`).hidden = id !== b.dataset.tab;
    loaders[b.dataset.tab]().catch((e) => status(e.message, true));
  });
});

$("#refresh").addEventListener("click", async () => {
  status("Hämtar och låter agenten välja ut … det kan ta en minut.");
  try {
    const r = await api("/api/refresh", {});
    status(r.digest ? `Klart: ${r.digest.picks} valda av ${r.digest.candidates} kandidater.` : "Inget nytt att välja bland.");
    loadFeed();
  } catch (e) {
    status(e.message, true);
  }
});

loadFeed().catch((e) => status(e.message, true));
setInterval(() => !document.hidden && !$("#flode").hidden && loadFeed().catch(() => {}), 60000);
