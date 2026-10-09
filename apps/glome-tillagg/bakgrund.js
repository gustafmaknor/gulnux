// Gulnux sök i Glome: knappen sparar sidan du läser i sökindexet. Med inställningen
// "auto" sparas varje sida du öppnar (utom undantagna, t.ex. bank och e-post).
// Sidorna skickas bara till Gulnux egen tjänst på den här datorn.

const TJANST = "http://127.0.0.1:9301";

function hamtaSida(tabId) {
  return chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        // Huvudinnehållet om sidan märker upp det, annars hela sidan
        const el = document.querySelector("article") || document.querySelector("main") || document.body;
        return { url: location.href, titel: document.title, text: (el?.innerText || "").slice(0, 500000) };
      },
    })
    .then(([resultat]) => resultat.result);
}

async function spara(tabId, lage) {
  const sida = await hamtaSida(tabId);
  const svar = await fetch(`${TJANST}/api/glome/spara`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sida, lage }),
  });
  if (!svar.ok) throw new Error(`Gulnux search answered ${svar.status}`);
  return svar.json();
}

function markera(tabId, text, farg, titel) {
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: farg });
  if (titel) chrome.action.setTitle({ tabId, title: titel });
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const resultat = await spara(tab.id, "manual");
    if (resultat.sparad) markera(tab.id, "✓", "#98971a", "Saved to Gulnux search");
    else markera(tab.id, "–", "#a89984", `Not saved: ${resultat.orsak}`);
  } catch (e) {
    markera(tab.id, "!", "#cc241d", `Could not save: ${e.message}`);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !/^https?:/.test(tab.url || "")) return;
  try {
    const { lage } = await (await fetch(`${TJANST}/api/glome`, { method: "POST" })).json();
    if (lage !== "auto") return;
    const resultat = await spara(tabId, "auto");
    if (resultat.sparad) markera(tabId, "✓", "#98971a", "Saved automatically to Gulnux search");
  } catch {
    // tjänsten är inte igång eller sidan gick inte att läsa – försök inte igen
  }
});
