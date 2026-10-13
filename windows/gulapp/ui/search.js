// Gulapps sökfönster: samma sökning som gul search. Träffarna sätts som text, aldrig som HTML.

const $ = (id) => document.getElementById(id);
const KALLOR = { documents: "Dokument", memory: "Minne", glome: "Webbsida" };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Markera sökorden i utdraget utan innerHTML
function markerat(text, ord) {
  const p = el("div", "utdrag");
  if (!ord.length) {
    p.textContent = text;
    return p;
  }
  const re = new RegExp(`(${ord.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  for (const del of text.split(re)) {
    p.append(re.test(del) ? el("mark", "", del) : document.createTextNode(del));
    re.lastIndex = 0;
  }
  return p;
}

// ~ i stället för hemkatalogen, som i Gloffice
let home = "";
const kort = (p) => (home && p.toLowerCase().startsWith(home.toLowerCase()) ? "~" + p.slice(home.length) : p);

function plats(hit) {
  if (hit.kalla === "glome") {
    try {
      const u = new URL(hit.sokvag);
      return u.host + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      return hit.sokvag;
    }
  }
  return kort(hit.sokvag);
}

$("sok").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fraga = $("fraga").value.trim();
  if (!fraga) return;
  $("info").textContent = "Söker …";
  $("traffar").replaceChildren();
  const r = await window.gulapp.search(fraga);
  if (r.error) {
    $("info").textContent = r.error;
    $("info").className = "liten fel";
    return;
  }
  $("info").className = "liten";
  home = r.home || "";
  const n = r.traffar.length;
  $("info").textContent = n ? `${n} ${n === 1 ? "träff" : "träffar"}${r.lage === "fulltext" ? " · bara ordsökning (ollama är inte igång)" : ""}` : `Inga träffar för "${fraga}".`;
  $("traffar").replaceChildren(...r.traffar.map((hit) => {
    const li = el("li");
    li.tabIndex = 0;
    li.append(
      el("span", "meta", `${hit.traff === "betydelse" ? "liknande · " : ""}${KALLOR[hit.kalla] || hit.kalla} · ${hit.andrad}`),
      el("div", "titel", hit.titel),
      el("div", "plats", plats(hit)),
      markerat(hit.utdrag, r.ord || []),
    );
    const open = () => window.gulapp.open(hit);
    li.addEventListener("click", open);
    li.addEventListener("keydown", (k) => k.key === "Enter" && open());
    return li;
  }));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.close();
});
