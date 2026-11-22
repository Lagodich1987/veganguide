// Свои заголовки и описания для поиска у отдельных страниц. node tools/overrides.mjs <папка сайта>
// Список — в tools/seo-overrides.json: адрес → title и description.
// Меняет только <head> этих страниц (title, og:title, description, og:description) и кладёт /seo.js,
// который держит тот же title после работы скрипта сайта. Текст и вид страниц не меняются.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = process.argv[2];
if (!DIR) throw new Error("укажи папку сайта");
const here = path.dirname(fileURLToPath(import.meta.url));
const MAP = JSON.parse(fs.readFileSync(path.join(here, "seo-overrides.json"), "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function set(h, re, val, file) {
  if (!re.test(h)) throw new Error(file + ": нет тега " + re);
  return h.replace(re, (_, a, b) => a + val + b);
}

// 1. head у страниц из списка
for (const [p, o] of Object.entries(MAP)) {
  if (!o.title || !o.description) throw new Error(p + ": нужны title и description");
  const f = path.join(DIR, p, "index.html");
  if (!fs.existsSync(f)) throw new Error("нет страницы " + p);
  let h = fs.readFileSync(f, "utf8");
  if (!h.includes(`<link rel="canonical" href="https://veganguide.help${p}">`)) throw new Error(p + ": canonical не на себя");
  h = set(h, /(<title>)[^<]*(<\/title>)/, esc(o.title), f);
  h = set(h, /(<meta property="og:title" content=")[^"]*(">)/, esc(o.title), f);
  h = set(h, /(<meta name="description" content=")[^"]*(">)/, esc(o.description), f);
  h = set(h, /(<meta property="og:description" content=")[^"]*(">)/, esc(o.description), f);
  fs.writeFileSync(f, h);
}

// 2. /seo.js: после каждого перехода внутри сайта ставит тот же title, что в коде страницы
const titles = Object.fromEntries(Object.entries(MAP).map(([p, o]) => [p, o.title]));
const js = `(function(){var T=${JSON.stringify(titles)};function f(){var t=T[location.pathname];if(!t)return;document.title=t;var o=document.querySelector('meta[property="og:title"]');if(o)o.setAttribute("content",t)}window.addEventListener("vg:nav",f);f()})();\n`;
fs.writeFileSync(path.join(DIR, "seo.js"), js);
const ver = crypto.createHash("sha256").update(js).digest("hex").slice(0, 8);
const re = /(<script src="\/app\.js\?v=[0-9a-f]+"><\/script>\n)/;
let n = 0;
(function walk(d) {
  for (const x of fs.readdirSync(d)) {
    const s = path.join(d, x);
    if (fs.statSync(s).isDirectory()) { if (x !== "og" && x !== "fonts") walk(s); continue; }
    if (!x.endsWith(".html")) continue;
    let h = fs.readFileSync(s, "utf8").replace(/<script src="\/seo\.js\?v=[0-9a-f]+"><\/script>\n/g, "");
    if (!re.test(h)) throw new Error("нет app.js в " + s);
    fs.writeFileSync(s, h.replace(re, `$1<script src="/seo.js?v=${ver}"></script>\n`));
    n++;
  }
})(DIR);
console.log("свои заголовки:", Object.keys(MAP).length, "· seo.js на страницах:", n);
