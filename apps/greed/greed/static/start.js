// Glomes startsida. Serveras av Greed (http://127.0.0.1:9303/start) och visar då dagens val;
// som lokal fil (om Greed inte körs) visas bara klocka, sökning och genvägar.
// Allt innehåll från flödet sätts som text, aldrig som HTML.

const $ = (s) => document.querySelector(s);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

let fornamn = "";

function tick() {
  const nu = new Date();
  $("#klocka").textContent = nu.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const h = nu.getHours();
  const hej = h < 5 ? "God natt" : h < 10 ? "God morgon" : h < 18 ? "God dag" : "God kväll";
  const datum = nu.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  $("#halsning").textContent = `${hej}${fornamn ? `, ${fornamn}` : ""} – ${datum}`;
}

// En adress öppnas direkt, allt annat blir en webbsökning
$("#sok").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#fraga").value.trim();
  if (!q) return;
  const adress = /^[a-z][a-z0-9+.-]*:\/\//i.test(q) ? q
    : /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(q) || /^localhost(:\d+)?(\/\S*)?$/.test(q) ? `https://${q}`
    : `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  location.href = adress;
});

async function hamta() {
  if (location.protocol !== "http:") return;
  let data;
  try {
    data = await (await fetch("/api/start", { headers: { "X-Greed": "1" } })).json();
  } catch {
    return;
  }
  fornamn = data.name || "";
  tick();

  for (const app of data.apps || []) {
    $("#genvagar").append(el("a", { href: app.url },
      el("span", { class: "ikon app", "data-bokstav": app.title.slice(0, 1).toUpperCase() }), app.title));
  }

  if (data.picks?.length) {
    $("#val").replaceChildren(...data.picks.map((p) => el("li", {},
      el("a", { class: "titel", href: `/go/${p.id}` }, p.title),
      el("div", { class: "om" }, el("b", {}, p.sources.join(", ")), p.reason ? ` – ${p.reason}` : ""))));
    $("#vart").hidden = false;
  }
}

tick();
setInterval(tick, 15000);
hamta();
