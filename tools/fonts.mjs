// Шрифты с самого сайта вместо Google Fonts. node tools/fonts.mjs <папка сайта>
// Скачивает с npm шрифты Fontsource (те же файлы, что раздаёт Google Fonts) строго заданных версий
// с проверкой контрольной суммы, кладёт нужные .woff2 в /fonts/ и меняет в <head> каждой страницы
// ссылку на Google Fonts на свой /fonts/fonts.css. Набор начертаний тот же, что запрашивался у Google:
// Unbounded 500 и 700; Literata 400 и 600, курсив 400 (с оптическим размером); Onest 400, 500, 600, 700.
// Каждое начертание — отдельное правило с одним весом, как у Google, чтобы вид страниц не изменился.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const DIR = process.argv[2];
if (!DIR) throw new Error("укажи папку сайта");
const GOOGLE = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*">\n/;

const PKGS = [
  { tgz: "https://registry.npmjs.org/@fontsource/unbounded/-/unbounded-5.3.0.tgz", sha512: "pPD6hsTnjoQRr6pCsqMHbHBfauB4LZygCNQEUJHu+CO2wzDFHqELEFSG7sTwo5Z5Gr4q3OK0fIILOXBJDv6lcw==" },
  { tgz: "https://registry.npmjs.org/@fontsource-variable/onest/-/onest-5.3.1.tgz", sha512: "xaaw6G4HDB2/RczsWLD/2bnib4ykmQlTlBUN3GOEOiyErilZukQWVJG95h9zwAy0i8KY+QzDa+COPfqhI72Acw==" },
  { tgz: "https://registry.npmjs.org/@fontsource-variable/literata/-/literata-5.3.0.tgz", sha512: "1Jw7xvOcoGyB83lxB2nG4bfNbqtX2/TTbdh9sHAOmU064SvmSdulDtA5RBu5JYWf64fdaKX7xU+z3GO1T2bCHA==" },
];
// откуда брать правила и какие веса из них сделать
const FACES = [
  { pkg: 0, css: "500.css", family: "Unbounded", weights: [500] },
  { pkg: 0, css: "700.css", family: "Unbounded", weights: [700] },
  { pkg: 1, css: "wght.css", family: "Onest", weights: [400, 500, 600, 700] },
  { pkg: 2, css: "opsz.css", family: "Literata", weights: [400, 600] },
  { pkg: 2, css: "opsz-italic.css", family: "Literata", weights: [400] },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fonts-"));
const dirs = [];
for (const [i, p] of PKGS.entries()) {
  const r = await fetch(p.tgz);
  if (!r.ok) throw new Error("не скачался " + p.tgz + ": " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (crypto.createHash("sha512").update(buf).digest("base64") !== p.sha512) throw new Error("контрольная сумма не совпала: " + p.tgz);
  const d = path.join(tmp, String(i));
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, "p.tgz"), buf);
  execFileSync("tar", ["-xzf", "p.tgz"], { cwd: d });
  dirs.push(path.join(d, "package"));
}

const out = path.join(DIR, "fonts");
fs.mkdirSync(out, { recursive: true });
let css = "", files = new Set();
for (const f of FACES) {
  const src = fs.readFileSync(path.join(dirs[f.pkg], f.css), "utf8");
  const blocks = [...src.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error("нет правил в " + f.css);
  for (const b of blocks) {
    const style = (b.match(/font-style:\s*(\w+)/) || [])[1];
    const woff2 = (b.match(/url\(\.\/files\/([^)]+\.woff2)\)/) || [])[1];
    const range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1];
    if (!style || !woff2 || !range) throw new Error("непонятное правило в " + f.css);
    const fmt = /woff2-variations/.test(b) ? "woff2-variations" : "woff2";
    files.add(path.join(dirs[f.pkg], "files", woff2));
    for (const w of f.weights)
      css += `@font-face{font-family:'${f.family}';font-style:${style};font-weight:${w};font-display:swap;src:url(/fonts/${woff2}) format('${fmt}');unicode-range:${range}}\n`;
  }
}
for (const f of files) fs.copyFileSync(f, path.join(out, path.basename(f)));
fs.writeFileSync(path.join(out, "fonts.css"), css);
const ver = crypto.createHash("sha256").update(css).digest("hex").slice(0, 8);
const tag = `<link rel="stylesheet" href="/fonts/fonts.css?v=${ver}">\n`;

function walk(d) {
  let r = [];
  for (const f of fs.readdirSync(d)) {
    const s = path.join(d, f);
    if (fs.statSync(s).isDirectory()) { if (f !== "og" && f !== "fonts") r = r.concat(walk(s)); }
    else if (f.endsWith(".html")) r.push(s);
  }
  return r;
}
let n = 0;
for (const f of walk(DIR)) {
  const h = fs.readFileSync(f, "utf8");
  if (!GOOGLE.test(h)) { if (/fonts\.googleapis\.com/.test(h)) throw new Error("ссылка на Google Fonts в неожиданном виде: " + f); continue; }
  fs.writeFileSync(f, h.replace(GOOGLE, tag));
  n++;
}
if (!n) throw new Error("не нашлось ни одной ссылки на Google Fonts");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("шрифты: файлов", files.size, "· правил", css.split("\n").length - 1, "· страниц", n);
