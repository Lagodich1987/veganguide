// Разметка для поисковиков (schema.org, JSON-LD) на готовом сайте.
// node tools/schema.mjs <папка сайта>
// Запускается при выкладке (.github/workflows/deploy.yml) после распаковки site.zip.
// Меняет только <head>: вставляет один <script type="application/ld+json">. Текст и вид страниц не трогает.
// Разметка есть только у страниц из sitemap.xml (у служебных адресов-дублей её нет).
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2];
if (!DIR) throw new Error("укажи папку сайта");
const ORIGIN = "https://veganguide.help";
const SITE_ID = ORIGIN + "/#website";
const AUTHOR = {
  "@type": "Person",
  "@id": ORIGIN + "/#author",
  name: "Лёша Лагодич",
  jobTitle: "Тренер по силовой и кондиционной подготовке",
  description: "Веган с 2021 года",
  sameAs: ["https://www.instagram.com/britvalagodich"],
};
// главы, которые целиком одна статья (остальные главы — оглавление своих страниц)
const ARTICLE_CHAPTERS = ["res", "minds"];

const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const file = (p) => path.join(DIR, p, "index.html");
function read(p) {
  const h = fs.readFileSync(file(p), "utf8");
  const head = h.slice(0, h.indexOf("</head>"));
  const get = (re) => { const m = head.match(re); return m ? decode(m[1]) : "" };
  const h1 = (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  return {
    html: h, title: get(/<title>([^<]*)<\/title>/), desc: get(/<meta name="description" content="([^"]*)"/),
    canonical: get(/<link rel="canonical" href="([^"]+)"/), image: get(/<meta property="og:image" content="([^"]+)"/),
    h1: h1 ? decode(h1) : "",
  };
}

const sm = fs.readFileSync(path.join(DIR, "sitemap.xml"), "utf8");
const pages = [...sm.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)]
  .map((m) => ({ p: m[1].replace(ORIGIN, ""), lastmod: m[2] }));
if (!pages.length) throw new Error("sitemap пустой");
const home = read("/");
const chapterName = {};

let done = 0;
for (const { p, lastmod } of pages) {
  const d = read(p);
  if (d.canonical !== ORIGIN + p) throw new Error(p + ": canonical не совпадает с адресом из sitemap");
  if (!d.h1 || !d.title) throw new Error(p + ": нет H1 или title");
  const url = ORIGIN + p;
  const seg = p.split("/").filter(Boolean);
  let graph;
  if (!seg.length) {
    graph = [
      { "@type": "WebSite", "@id": SITE_ID, url, name: d.h1, description: d.desc, inLanguage: "ru", author: { "@id": AUTHOR["@id"] }, publisher: { "@id": AUTHOR["@id"] } },
      AUTHOR,
    ];
  } else {
    const ch = "/" + seg[0] + "/";
    if (!chapterName[ch]) chapterName[ch] = read(ch).h1;
    const crumbs = [{ name: home.h1, item: ORIGIN + "/" }, { name: chapterName[ch], item: ORIGIN + ch }];
    if (seg.length > 1) crumbs.push({ name: d.h1, item: url });
    const isArticle = seg.length > 1 || ARTICLE_CHAPTERS.includes(seg[0]);
    const main = {
      "@type": isArticle ? "Article" : "CollectionPage",
      "@id": url + "#page", url, mainEntityOfPage: url,
      [isArticle ? "headline" : "name"]: d.h1.length > 110 ? d.h1.slice(0, 109) + "…" : d.h1,
      description: d.desc, inLanguage: "ru", isPartOf: { "@id": SITE_ID },
      author: AUTHOR, publisher: AUTHOR,
    };
    if (d.image) main.image = d.image;
    if (lastmod) main.dateModified = lastmod;
    graph = [main, {
      "@type": "BreadcrumbList", "@id": url + "#breadcrumbs",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
    }];
  }
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  const tag = `<script type="application/ld+json">${json}</script>\n`;
  const clean = d.html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, "");
  const at = clean.indexOf("</head>");
  fs.writeFileSync(file(p), clean.slice(0, at) + tag + clean.slice(at));
  done++;
}
console.log("разметка добавлена на страниц:", done);
