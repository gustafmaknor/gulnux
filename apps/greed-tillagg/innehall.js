// Greed i Glome: läser inläggen du faktiskt ser i flödet (minst 1,5 s på skärmen) och skickar
// dem till Greed på den här datorn. Inget annat läses och inget skickas någon annanstans.

const SITE = location.hostname.replace(/^www\./, "").replace(/^m\./, "").replace("twitter.com", "x.com");
const POSTS = {
  "x.com": 'article[data-testid="tweet"]',
  "facebook.com": 'div[role="article"]',
  "instagram.com": "article",
};
const TEXT = { "x.com": '[data-testid="tweetText"]' };
const AUTHOR = { "x.com": '[data-testid="User-Name"]', "facebook.com": "h2, h3, strong", "instagram.com": "header a" };
const PERMALINK = /\/status\/\d+|\/posts\/|\/permalink|story_fbid=|\/p\/[\w-]+|\/reel\/[\w-]+/;

const seen = new Set();
let queue = [];

function extract(el) {
  const text = ((TEXT[SITE] && el.querySelector(TEXT[SITE])) || el).innerText.trim().slice(0, 3000);
  if (text.length < 20) return null;
  const link = [...el.querySelectorAll("a[href]")].map((a) => a.href).find((h) => PERMALINK.test(h));
  const author = (AUTHOR[SITE] && el.querySelector(AUTHOR[SITE])?.innerText?.split("\n")[0]) || "";
  return { url: link || null, text, author: author.trim().slice(0, 200) };
}

function collect(el) {
  const post = extract(el);
  if (!post) return;
  const key = post.url || post.text.slice(0, 200);
  if (seen.has(key)) return;
  seen.add(key);
  queue.push(post);
}

const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) e.target.greedTimer = setTimeout(() => collect(e.target), 1500);
    else clearTimeout(e.target.greedTimer);
  }
}, { threshold: 0.6 });

function scan() {
  for (const el of document.querySelectorAll(POSTS[SITE] || "article")) {
    if (!el.greedObserved) {
      el.greedObserved = true;
      observer.observe(el);
    }
  }
}

new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
scan();

setInterval(() => {
  if (!queue.length) return;
  const posts = queue;
  queue = [];
  chrome.runtime.sendMessage({ site: SITE, posts });
}, 5000);
