// Greed i Glome: skickar inläggen från innehållsskriptet till Greed-tjänsten och öppnar Greed
// när du trycker på knappen.

const GREED = "http://127.0.0.1:9303";

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab || !Array.isArray(message.posts)) return;
  fetch(`${GREED}/api/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ site: message.site, posts: message.posts }),
  }).catch(() => {
    // Greed-tjänsten är inte igång – inläggen hoppas över
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: `${GREED}/` });
});
