// Gloffice – webbgränssnitt. Pratar med den lokala servern (web.py) och laddar om
// automatiskt när filen ändras utanför, t.ex. när agenten i gul arbetar i den.

const $ = (selector) => document.querySelector(selector);
const view = $("#view");
const q = encodeURIComponent;

let current = null; // det öppna dokumentet, som /api/open returnerar det
let sheetIndex = 0;
let selected = null; // vald cell i kalkylarket: { r, c }
let queue = Promise.resolve(); // ändringar skickas en i taget, i ordning

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(url, body) {
  const options = { headers: { "X-Gloffice": "1" } };
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

// Skicka en ändring till servern. Returnerar ett löfte som blir klart när den är sparad.
function save(url, body) {
  const task = queue.then(async () => {
    try {
      const result = await api(url, { path: current.path, ...body });
      current.mtime = result.mtime;
      status("Sparat");
      return result;
    } catch (e) {
      status(e.message, true);
    }
  });
  queue = task;
  return task;
}

// ------------------------------------------------------------ filer

async function loadFiles() {
  const { dir, files } = await api("/api/files");
  $("#dir").textContent = dir;
  $("#files").replaceChildren(...files.map((f) => {
    const li = el("li", f.kind, f.name);
    li.title = f.path;
    li.classList.toggle("active", current?.path === f.path);
    li.onclick = () => (location.hash = q(f.path));
    return li;
  }));
}

async function open(path) {
  try {
    current = await api(`/api/open?path=${q(path)}`);
  } catch (e) {
    current = null;
    $("#toolbar").hidden = $("#formula").hidden = true;
    view.replaceChildren(el("p", "error", e.message));
    return;
  }
  sheetIndex = 0;
  selected = null;
  $("#toolbar").hidden = false;
  $("#title").textContent = current.name;
  status("");
  render();
  loadFiles();
}

async function reload() {
  const scroll = view.scrollTop;
  current = await api(`/api/open?path=${q(current.path)}`);
  render();
  view.scrollTop = scroll;
}

function render() {
  $("#formula").hidden = current.kind !== "spreadsheet";
  ({ document: renderDocument, spreadsheet: renderSpreadsheet, presentation: renderPresentation })[current.kind]();
}

// ------------------------------------------------------------ textdokument

function tagFor(style) {
  const heading = /(?:heading|rubrik)\s*(\d)/i.exec(style);
  if (heading) return `h${Math.min(Number(heading[1]), 6)}`;
  return /^(title|rubrik)$/i.test(style) ? "h1" : "p";
}

function renderDocument() {
  const page = el("article", "page");
  for (const block of current.blocks) {
    if (block.type === "table") {
      const table = el("table");
      for (const row of block.rows) {
        const tr = el("tr");
        tr.append(...row.map((text) => el("td", "", text)));
        table.append(tr);
      }
      page.append(table);
      continue;
    }
    const node = el(tagFor(block.style), "", block.text);
    if (/^title$/i.test(block.style)) node.classList.add("title");
    if (/list/i.test(block.style)) node.classList.add("list");
    node.contentEditable = "true";
    node.title = block.style;
    node.dataset.index = block.index;
    node.onblur = () => {
      if (node.textContent !== block.text) {
        block.text = node.textContent;
        save("/api/docx/paragraph", { index: block.index, text: block.text });
      }
    };
    node.onkeydown = async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        node.blur();
        await save("/api/docx/insert", { after: block.index, text: "" });
        await reload();
        focusParagraph(block.index + 1);
      } else if (e.key === "Backspace" && node.textContent === "" && block.index > 0) {
        e.preventDefault();
        await save("/api/docx/delete", { index: block.index });
        await reload();
        focusParagraph(block.index - 1);
      }
    };
    page.append(node);
  }
  if (!current.blocks.some((b) => b.type === "paragraph")) {
    const add = el("button", "", "+ Stycke");
    add.onclick = async () => {
      await save("/api/docx/insert", { text: "" });
      await reload();
      focusParagraph(0);
    };
    page.append(add);
  }
  view.replaceChildren(page);
}

function focusParagraph(index) {
  const node = view.querySelector(`[data-index="${index}"]`);
  if (!node) return;
  node.focus();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
}

// ------------------------------------------------------------ kalkylark

function columnName(n) {
  let name = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cellText(cell) {
  if (!cell) return "";
  if (cell.v === null || cell.v === undefined) return cell.f ?? "";
  return typeof cell.v === "number" ? cell.v.toLocaleString("sv-SE") : String(cell.v);
}

function renderSpreadsheet() {
  const sheet = current.sheets[sheetIndex] ?? current.sheets[0];
  const parts = [];

  if (current.sheets.length > 1) {
    const tabs = el("div", "tabs");
    current.sheets.forEach((s, i) => {
      const tab = el("button", i === sheetIndex ? "active" : "", s.name);
      tab.onclick = () => { sheetIndex = i; selected = null; render(); };
      tabs.append(tab);
    });
    parts.push(tabs);
  }

  // Visa alltid lite tomt utrymme att skriva i
  const rows = Math.max(sheet.rows.length + 5, 30);
  const cols = Math.max(sheet.rows[0]?.length ?? 0, 10) + 1;
  const table = el("table", "grid");
  const head = el("tr");
  head.append(el("th"));
  for (let c = 1; c <= cols; c++) head.append(el("th", "", columnName(c)));
  table.append(head);
  for (let r = 0; r < rows; r++) {
    const tr = el("tr");
    tr.append(el("th", "", r + 1));
    for (let c = 0; c < cols; c++) {
      const cell = sheet.rows[r]?.[c];
      const td = el("td", typeof cell?.v === "number" ? "number" : "", cellText(cell));
      if (selected?.r === r && selected?.c === c) td.classList.add("selected");
      td.onclick = () => select(r, c);
      td.ondblclick = () => $("#cellinput").focus();
      tr.append(td);
    }
    table.append(tr);
  }
  parts.push(table);
  if (sheet.max_row > sheet.rows.length) {
    parts.push(el("p", "note", `Visar ${sheet.rows.length} av ${sheet.max_row} rader.`));
  }
  view.replaceChildren(...parts);
}

function select(r, c) {
  selected = { r, c };
  const cell = current.sheets[sheetIndex].rows[r]?.[c];
  $("#cellref").textContent = `${columnName(c + 1)}${r + 1}`;
  $("#cellinput").value = cell?.f ?? (cell?.v ?? "");
  view.querySelectorAll("td.selected").forEach((td) => td.classList.remove("selected"));
  view.querySelectorAll("tr")[r + 1]?.children[c + 1]?.classList.add("selected");
}

$("#cellinput").onkeydown = async (e) => {
  if (!selected) return;
  if (e.key === "Escape") return select(selected.r, selected.c);
  if (e.key !== "Enter") return;
  const { r, c } = selected;
  await save("/api/sheet/cell", {
    sheet: current.sheets[sheetIndex].name,
    cell: `${columnName(c + 1)}${r + 1}`,
    value: $("#cellinput").value,
  });
  await reload();
  select(r + 1, c);
  $("#cellinput").focus();
};

// ------------------------------------------------------------ presentationer

function renderPresentation() {
  const parts = [];
  for (const slide of current.slides) {
    const card = el("section", "slide");
    card.append(el("span", "number", `${slide.number} · ${slide.layout}`));
    for (const shape of slide.shapes) {
      const node = el(shape.title ? "h2" : "div", "", shape.text);
      node.contentEditable = "true";
      node.title = shape.name;
      node.onblur = () => {
        if (node.innerText !== shape.text) {
          shape.text = node.innerText;
          save("/api/slide/text", { slide: slide.number, shape: shape.index, text: shape.text });
        }
      };
      card.append(node);
    }
    parts.push(card);
    if (slide.notes) parts.push(el("p", "notes", `Anteckningar: ${slide.notes}`));
  }
  const add = el("button", "add-slide", "+ Ny bild");
  add.onclick = async () => {
    await save("/api/slide/add", { title: "Ny bild" });
    await reload();
    view.scrollTop = view.scrollHeight;
  };
  parts.push(add);
  view.replaceChildren(...parts);
}

// ------------------------------------------------------------ verktygsfält och start

$("#undo").onclick = async () => {
  await save("/api/undo", {});
  await reload();
};
$("#pdf").onclick = () => window.open(`/api/export?format=pdf&path=${q(current.path)}`);
$("#download").onclick = () => (location.href = `/api/download?path=${q(current.path)}`);

document.querySelectorAll("[data-new]").forEach((button) => {
  button.onclick = async () => {
    const ext = button.dataset.new;
    const name = prompt(`Namn på den nya filen (.${ext})`);
    if (!name) return;
    try {
      const { path } = await api("/api/new", { path: name.endsWith(`.${ext}`) ? name : `${name}.${ext}` });
      location.hash = q(path);
    } catch (e) {
      alert(e.message);
    }
  };
});

window.onhashchange = () => location.hash.length > 1 && open(decodeURIComponent(location.hash.slice(1)));

// Ladda om när filen ändras utanför (t.ex. av agenten), men inte mitt i en redigering
setInterval(async () => {
  if (!current || document.hidden) return;
  if (view.contains(document.activeElement) || document.activeElement === $("#cellinput")) return;
  try {
    const { mtime } = await api(`/api/mtime?path=${q(current.path)}`);
    if (mtime !== current.mtime) {
      await reload();
      status("Uppdaterad");
    }
  } catch {
    // filen kan vara mitt i en skrivning – försök igen nästa varv
  }
}, 1500);
setInterval(() => !document.hidden && loadFiles().catch(() => {}), 5000);

loadFiles();
window.onhashchange();
