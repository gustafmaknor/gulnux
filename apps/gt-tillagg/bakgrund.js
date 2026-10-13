// Good Times i Glome: knappen startar en lärsession för appen du är i. Märket visar om GT
// redan kan appen. Tillägget pratar bara med GT på den här datorn: med native messaging, och
// i Gulapp på jobbdatorer där det är avstängt av en policy via Gulapps brygga på port 9304.

const VARD = "se.gulnux.gt";
const BRYGGA = "http://127.0.0.1:9304/gt";

async function fraga(meddelande) {
  try {
    return await chrome.runtime.sendNativeMessage(VARD, meddelande);
  } catch (e) {
    try {
      const svar = await fetch(BRYGGA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meddelande) });
      if (svar.ok) return await svar.json();
    } catch {
      // ingen Gulapp heller
    }
    throw e;
  }
}

function markera(tabId, text, titel) {
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#F5C518" });
  chrome.action.setBadgeTextColor?.({ tabId, color: "#1F1D18" });
  if (titel) chrome.action.setTitle({ tabId, title: titel });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!/^https?:/.test(tab.url || "")) {
    markera(tab.id, "", "Good Times can only learn web apps");
    return;
  }
  try {
    const svar = await fraga({ action: "learn", url: tab.url, title: tab.title });
    markera(tab.id, svar.ok ? "GT" : "!", svar.message);
  } catch (e) {
    markera(tab.id, "!", `Could not reach Good Times: ${e.message}`);
  }
});

// Visa på varje sida om GT redan kan appen
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !/^https?:/.test(tab.url || "")) return;
  try {
    const svar = await fraga({ action: "status", url: tab.url });
    markera(tabId, svar.known ? "GT" : "", svar.message);
  } catch {
    // GT är inte installerat – knappen fungerar ändå som en vanlig knapp
  }
});
