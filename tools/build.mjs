// Сборка сайта veganguide.help из исходника гайда (один HTML-файл черновика).
// node build.mjs <исходник.html> <старый сайт (распакованный site.zip)> <куда собрать>
// Что делает: выносит стили и скрипт, переводит адреса с #якорей на /пути/,
// рендерит каждую страницу в готовый HTML, ставит canonical, собирает sitemap.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const [SRC, OLD, OUT] = process.argv.slice(2);
const ORIGIN = "https://veganguide.help";
const SITE = "Гайд по веганскому питанию и жизни";
const TODAY = new Date().toISOString().slice(0, 10);

// Адреса, которые открывают главу целиком (фильтр или прокрутка к разделу):
// главным для поисковика считается адрес самой главы.
const TASTE_SECTIONS = ["tastes", "umami", "meaty", "marinades", "spices", "sauces", "boosters"];
function canon(p) {
  let m = p.match(/^\/(res|minds)\/[^/]+\/$/) || p.match(/^\/(dishes)\/cat[^/]*\/$/);
  if (!m) { const t = p.match(/^\/(taste)\/([^/]+)\/$/); if (t && TASTE_SECTIONS.includes(t[2])) m = t; }
  if (m) return "/" + m[1] + "/";
  if (p === "/author/" || p === "/404.html") return "/";
  return p;
}

// ---------- 1. исходник → app.css + app.js ----------
const src = fs.readFileSync(SRC, "utf8");
const styles = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)];
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (styles.length !== 2 || scripts.length !== 1) throw new Error("неожиданная структура исходника");
const css = styles[1][1];
let js = scripts[0][1];

function once(a, b) {
  const n = js.split(a).length - 1;
  if (n !== 1) throw new Error(`замена должна встретиться 1 раз, а встретилась ${n}: ${a.slice(0, 70)}`);
  js = js.replace(a, () => b);
}
once('  var h=(location.hash||"").slice(1);', '  var h=(P2H()||"").slice(1);');
once('window.addEventListener("hashchange",function(){setTimeout(upd,50)});', 'window.addEventListener("vg:nav",function(){setTimeout(upd,50)});');
once('  var key=location.hash||"#";', '  var key=P2H()||"#";');
once("\n  show();\n", '\n  show();LINKS();META();window.dispatchEvent(new Event("vg:nav"));\n');
once('  location.hash=t==="#"?"":t;', "  NAV(t);");
once('window.addEventListener("hashchange",closeS);', 'window.addEventListener("vg:nav",closeS);');
once('window.addEventListener("hashchange",go);',
  'window.addEventListener("popstate",function(){backing=true;go()});\n' +
  'document.addEventListener("click",function(e){if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;var a=e.target.closest?e.target.closest("a"):null;if(!a||a.target==="_blank")return;var h=a.getAttribute("href")||"";if(h.charAt(0)==="#"){e.preventDefault();NAV(h)}else if(h.charAt(0)==="/"&&h.charAt(1)!=="/"){e.preventDefault();if(h!==location.pathname)history.pushState(null,"",h);go()}});');
if (/location\.hash|hashchange/.test(js)) throw new Error("в скрипте остались обращения к #якорям");

const PREFIX = `
function P2H(){var p=location.pathname.replace(/^\\/+|\\/+$/g,"");if(!p||p==="index.html"||p==="404.html")return "";var s=p.split("/");return "#"+s[0]+(s[1]?"-"+s.slice(1).join("-"):"")}
function H2P(h){h=(h||"").replace(/^#/,"");if(!h)return "/";var k=h.indexOf("-");return k<0?"/"+h+"/":"/"+h.slice(0,k)+"/"+h.slice(k+1)+"/"}
function NAV(h,repl){var p=H2P(h);if(p!==location.pathname){history[repl?"replaceState":"pushState"](null,"",p)}go()}
function CANON(p){var m=p.match(/^\\/(res|minds)\\/[^\\/]+\\/$/)||p.match(/^\\/(dishes)\\/cat[^\\/]*\\/$/)||p.match(/^\\/(taste)\\/(?:${TASTE_SECTIONS.join("|")})\\/$/);return m?"/"+m[1]+"/":(p==="/404.html"||p==="/author/"?"/":p)}
function META(){var p=location.pathname,m=p.match(/^\\/(res|minds)\\/[^\\/]+\\/$/),c="https://veganguide.help"+CANON(p);var l=document.querySelector('link[rel="canonical"]');if(l)l.setAttribute("href",c);var o=document.querySelector('meta[property="og:url"]');if(o)o.setAttribute("content",c);var rm=p.match(/^\\/([a-z]+)\\/([^\\/]+)\\/$/),h1=document.querySelector("#app h1")||document.querySelector("#app .dhead h2")||document.querySelector("#app h2");if(rm&&!m&&h1&&!(rm[1]==="dishes"&&rm[2].indexOf("cat")===0)){var cn=document.title.split(" · ")[0],hd=h1.textContent.trim();document.title=hd+(cn&&cn!==hd&&rm[1]!=="research"&&cn.indexOf("Гайд")!==0?" · "+cn:"")+" · Гайд по веганскому питанию и жизни"}var t=document.querySelector('meta[property="og:title"]');if(t)t.setAttribute("content",document.title)}
function LINKS(){var as=document.querySelectorAll('a[href^="#"]');for(var i=0;i<as.length;i++){as[i].setAttribute("href",H2P(as[i].getAttribute("href")))}}
`;
js = PREFIX + js;
const VER = crypto.createHash("sha256").update(css).update(js).digest("hex").slice(0, 8);

// ---------- 2. каркас папки ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OLD)) {
  const s = path.join(OLD, f);
  if (fs.statSync(s).isDirectory()) { if (f === "og") fs.cpSync(s, path.join(OUT, f), { recursive: true }); continue; }
  if (/\.(html|xml)$/.test(f) || f === "app.js" || f === "app.css") continue;
  fs.copyFileSync(s, path.join(OUT, f));
}
fs.writeFileSync(path.join(OUT, "app.css"), css);
fs.writeFileSync(path.join(OUT, "app.js"), js);

const oldShell = fs.readFileSync(path.join(OLD, "404.html"), "utf8");
const reVer = /(\/app\.(?:css|js)\?v=)[0-9a-f]+/g;
const shell = oldShell.replace(reVer, "$1" + VER);
fs.writeFileSync(path.join(OUT, "404.html"), shell);

// ---------- 3. локальный сервер ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".xml": "text/xml", ".txt": "text/plain" };
function serve(dir, fallback) {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split("?")[0]);
      let f = path.join(dir, u);
      if (u.endsWith("/")) f = path.join(f, "index.html");
      if (fallback || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        if (path.extname(u)) { if (!fs.existsSync(f)) { r.writeHead(404); return r.end() } }
        else f = path.join(dir, "404.html");
      }
      r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
      r.end(fs.readFileSync(f));
    }).listen(0, "127.0.0.1", () => res(srv));
  });
}

// ---------- 4. рендер страниц ----------
const srv = await serve(OUT, true);
const BASE = "http://127.0.0.1:" + srv.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 800 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function render(p) {
  await page.goto(BASE + p, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("app").children.length > 0);
  await page.waitForTimeout(30);
  return page.evaluate(() => ({
    title: document.title,
    desc: (document.querySelector("#app .lead") || document.querySelector("#app .dtag") || { textContent: "" }).textContent.trim(),
    h1: [...document.querySelectorAll("#app h1")].map((e) => e.textContent.trim()),
    body: ["header.bookbar", "#srch", "#chap"].map((s) => document.querySelector(s).outerHTML).join("\n"),
    links: [...document.querySelectorAll("#app a[href^='/'], header a[href^='/']")].map((a) => a.getAttribute("href")),
  }));
}

function walk(dir, base = "") {
  let r = [];
  for (const f of fs.readdirSync(dir)) {
    const s = path.join(dir, f);
    if (fs.statSync(s).isDirectory()) r = r.concat(walk(s, base + "/" + f));
    else if (f === "index.html") r.push((base || "") + "/");
  }
  return r;
}
const oldRoutes = new Set(walk(OLD).filter((r) => !r.startsWith("/og/")));
const queue = ["/", ...oldRoutes], seen = new Set(), pages = {};
while (queue.length) {
  const p = queue.shift();
  if (seen.has(p)) continue;
  seen.add(p);
  if (!/^\/([a-z0-9-]+\/){0,2}$/.test(p)) throw new Error("странный адрес: " + p);
  const r = await render(p);
  pages[p] = r;
  for (const l of r.links) if (!seen.has(l)) queue.push(l);
}
await browser.close();
srv.close();
if (errors.length) throw new Error("ошибки скрипта на страницах:\n" + errors.join("\n"));

// ---------- 5. HTML каждой страницы ----------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const slug = (p) => p.replace(/^\/|\/$/g, "").replace(/\//g, "-");
function headOf(html) { return html.slice(0, html.indexOf("<body>")); }
function setMeta(head, re, val) { if (!re.test(head)) throw new Error("нет тега " + re); return head.replace(re, (_, a, b) => a + val + b); }

const report = { created: [], bodyChanged: [], titleChanged: [], removed: [], h1less: [] };
for (const p of Object.keys(pages).sort()) {
  const r = pages[p];
  const oldFile = path.join(OLD, p, "index.html");
  const isNew = !fs.existsSync(oldFile);
  let head;
  if (!isNew) head = headOf(fs.readFileSync(oldFile, "utf8"));
  else {
    // новая страница берёт шапку у соседки по главе
    const sib = Object.keys(pages).find((q) => q !== p && q.startsWith("/" + p.split("/")[1] + "/") && q.split("/").length === p.split("/").length && fs.existsSync(path.join(OLD, q, "index.html")) && canon(q) === q);
    head = headOf(fs.readFileSync(path.join(OLD, sib, "index.html"), "utf8"));
    if (!r.desc) throw new Error("у новой страницы нет описания: " + p);
    head = setMeta(head, /(<meta name="description" content=")[^"]*(">)/, esc(r.desc));
    head = setMeta(head, /(<meta property="og:description" content=")[^"]*(">)/, esc(r.desc));
    head = setMeta(head, /(<meta property="og:image" content=")[^"]*(">)/, `${ORIGIN}/og/${slug(p)}.jpg`);
    head = setMeta(head, /(<meta name="twitter:image" content=")[^"]*(">)/, `${ORIGIN}/og/${slug(p)}.jpg`);
    report.created.push(p);
  }
  const oldTitle = (head.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!isNew && oldTitle !== esc(r.title)) report.titleChanged.push([p, oldTitle, r.title]);
  head = setMeta(head, /(<title>)[^<]*(<\/title>)/, esc(r.title));
  head = setMeta(head, /(<meta property="og:title" content=")[^"]*(">)/, esc(r.title));
  head = setMeta(head, /(<link rel="canonical" href=")[^"]*(">)/, ORIGIN + canon(p));
  head = setMeta(head, /(<meta property="og:url" content=")[^"]*(">)/, ORIGIN + canon(p));
  head = head.replace(reVer, "$1" + VER);
  const html = head + "<body>\n" + r.body + `\n<script src="/app.js?v=${VER}"></script>\n</body>\n</html>\n`;
  if (!isNew) {
    const old = fs.readFileSync(oldFile, "utf8");
    const ob = old.slice(old.indexOf("<body>"), old.indexOf("<script src=")).replace(/^<body>\n|\n$/g, "");
    if (ob !== r.body) report.bodyChanged.push(p);
  }
  if (!r.h1.length) report.h1less.push(p);
  fs.mkdirSync(path.join(OUT, p), { recursive: true });
  fs.writeFileSync(path.join(OUT, p, "index.html"), html);
}
for (const p of oldRoutes) if (!pages[p]) report.removed.push(p);

// ---------- 6. sitemap ----------
const inMap = Object.keys(pages).filter((p) => canon(p) === p);
inMap.sort((a, b) => (a.split("/").length - b.split("/").length) || (a < b ? -1 : 1));
// lastmod: дата сборки только у новых страниц и у тех, где изменился текст или заголовок;
// остальные сохраняют прежнюю дату из старого sitemap, чтобы поисковик видел честные даты
const oldMod = {};
const oldMapFile = path.join(OLD, "sitemap.xml");
if (fs.existsSync(oldMapFile))
  for (const m of fs.readFileSync(oldMapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)) oldMod[m[1].replace(ORIGIN, "")] = m[2];
const touched = new Set([...report.created, ...report.bodyChanged, ...report.titleChanged.map((t) => t[0])]);
const lastmod = (p) => (!touched.has(p) && oldMod[p]) || TODAY;
fs.writeFileSync(path.join(OUT, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  inMap.map((p) => `<url><loc>${ORIGIN}${p}</loc><lastmod>${lastmod(p)}</lastmod></url>`).join("\n") + "\n</urlset>\n");

report.version = VER; report.pages = Object.keys(pages).length; report.sitemap = inMap.length;
report.lastmodToday = inMap.filter((p) => lastmod(p) === TODAY).length;
report.needOg = Object.keys(pages).filter((p) => p !== "/" && canon(p) === p && !fs.existsSync(path.join(OUT, "og", slug(p) + ".jpg")));
fs.writeFileSync(path.join(OUT, "..", "build-report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, bodyChanged: report.bodyChanged.length, h1less: report.h1less.length }, null, 1));
