// Проверка сборки: node check.mjs <старый сайт> <новый сайт> [--visual]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const [OLD, NEW] = process.argv.slice(2);
const VISUAL = process.argv.includes("--visual");
const ORIGIN = "https://veganguide.help";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m) };

function walk(dir, base = "") {
  let r = [];
  for (const f of fs.readdirSync(dir)) {
    const s = path.join(dir, f);
    if (fs.statSync(s).isDirectory()) r = r.concat(walk(s, base + "/" + f));
    else if (f === "index.html") r.push(base + "/");
  }
  return r;
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
// сервер ведёт себя как GitHub Pages: файл, иначе 404.html со статусом 404
function serve(dir) {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split("?")[0]);
      let f = path.join(dir, u); if (u.endsWith("/")) f = path.join(f, "index.html");
      let code = 200;
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { f = path.join(dir, "404.html"); code = 404 }
      r.writeHead(code, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
      r.end(fs.readFileSync(f));
    }).listen(0, "127.0.0.1", () => res(srv));
  });
}

// ---------- статические проверки ----------
const routes = walk(NEW);
const sm = fs.readFileSync(path.join(NEW, "sitemap.xml"), "utf8");
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(ORIGIN, ""));
ok(new Set(locs).size === locs.length, "в sitemap повторы");
const canonOf = {}, seenTitle = {};
for (const p of routes) {
  const h = fs.readFileSync(path.join(NEW, p, "index.html"), "utf8");
  const c = (h.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
  const ou = (h.match(/<meta property="og:url" content="([^"]+)">/) || [])[1];
  ok(c && c === ou, p + ": canonical и og:url расходятся");
  canonOf[p] = (c || "").replace(ORIGIN, "");
  ok((h.match(/<h1[\s>]/g) || []).length === 1, p + ": H1 не один, а " + (h.match(/<h1[\s>]/g) || []).length);
  ok(/<meta name="description" content="[^"]{20,}">/.test(h), p + ": нет описания");
  const img = (h.match(/<meta property="og:image" content="([^"]+)">/) || [])[1];
  ok(img && fs.existsSync(path.join(NEW, img.replace(ORIGIN, ""))), p + ": нет картинки превью " + img);
  for (const m of h.matchAll(/href="(\/[^"#?]*)/g)) {
    const t = m[1];
    const f = t.endsWith("/") ? path.join(NEW, t, "index.html") : path.join(NEW, t);
    ok(fs.existsSync(f), p + ": битая ссылка " + t);
  }
  ok(!/href="#[a-z]/.test(h), p + ": остался #якорь в ссылке");
  if (canonOf[p] === p) { const t = h.match(/<title>([^<]*)/)[1]; ok(!seenTitle[t], p + ": title повторяет " + seenTitle[t]); seenTitle[t] = p }
}
for (const p of routes) ok(canonOf[canonOf[p]] === canonOf[p], p + ": canonical ведёт на неканоническую страницу");
for (const l of locs) ok(canonOf[l] === l, l + ": в sitemap, но canonical другой");
for (const p of routes) if (canonOf[p] === p) ok(locs.includes(p), p + ": нет в sitemap");
for (const p of walk(OLD)) ok(routes.includes(p), p + ": страница пропала");

// ---------- поведение в браузере ----------
const srv = await serve(NEW), B = "http://127.0.0.1:" + srv.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 800 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()) });
const canon = () => page.evaluate(() => document.querySelector('link[rel="canonical"]').href);
const loc = () => page.evaluate(() => location.pathname);

await page.goto(B + "/");
await page.click('a.chap[href="/train/"]'); ok(await loc() === "/train/", "клик по главе: " + await loc());
await page.click('a[href="/train/lifting/"]'); ok(await loc() === "/train/lifting/", "клик по теме");
ok((await page.title()).startsWith("Силовые как забота о себе · Тренировки"), "title новой страницы: " + await page.title());
ok(await canon() === ORIGIN + "/train/lifting/", "canonical новой страницы");
ok(await page.locator("#app h2", { hasText: /^Не про качалку$/ }).count() === 1, "заголовок без кавычек");
ok(await page.locator("#app", { hasText: "«качалку»" }).count() === 0, "кавычки остались");
ok(/2 из \d+/.test(await page.textContent("#app .eyebrow")), "счётчик тем");
await page.click(".pager a.next"); { const nx = await loc(); ok(nx === "/train/myths/" || nx === "/train/program/", "кнопка «Следующая»: " + nx); }
await page.click(".pager a:not(.next)"); ok(await loc() === "/train/lifting/", "кнопка «Предыдущая»");
await page.click("#bbback"); ok(await loc() === "/train/", "верхняя «Назад» → в главу: " + await loc());
await page.goBack(); await page.waitForTimeout(50); ok((await loc()).startsWith("/train/"), "назад в браузере");
// исследования: листание и перекрёстные ссылки
await page.goto(B + "/research/lifting/");
ok(await page.locator("#app h1").textContent() === "Силовые тренировки: что доказано", "h1 темы исследований");
ok(await page.locator('#app a[href="/train/lifting/"]').count() >= 1, "ссылка из исследований в главу");
await page.click(".pager a.next"); ok(await loc() === "/research/bones/", "листание исследований вперёд: " + await loc());
await page.click(".pager a:not(.next)"); ok(await loc() === "/research/lifting/", "листание исследований назад");
await page.click("#bbback"); ok(await loc() === "/research/", "«Назад» из темы → список тем: " + await loc());
// дубли: адрес открывается как раньше, canonical — на главу
for (const [u, c] of [["/taste/spices/", "/taste/"], ["/dishes/catbowl/", "/dishes/"], ["/author/", "/"], ["/res/feed/", "/res/"], ["/minds/insects/", "/minds/"], ["/taste/miso/", "/taste/miso/"], ["/dishes/burger/", "/dishes/burger/"]]) {
  await page.goto(B + u); await page.waitForTimeout(40);
  ok(await canon() === ORIGIN + c, u + ": canonical в браузере " + await canon());
  ok(await page.locator("#app").innerText().then((t) => t.length > 300), u + ": пусто");
}
await page.goto(B + "/taste/"); await page.click('#app a[href="/taste/spices/"]'); await page.waitForTimeout(60);
ok(await loc() === "/taste/spices/" && await canon() === ORIGIN + "/taste/", "переход к разделу «Вкуса» внутри сайта");
await page.goto(B + "/author/"); ok(await page.evaluate(() => document.getElementById("letter").open), "письмо автора не раскрыто");
// карточка: h1 и прежний заголовок вкладки
await page.goto(B + "/protein/tofu/");
ok(await page.locator("#app h1").textContent() === "Тофу", "h1 карточки");
ok(await page.title() === "Тофу · Белок · Гайд по веганскому питанию и жизни", "title карточки: " + await page.title());
// поиск
await page.click("#bbsearch"); await page.fill("#srq", "качалка"); await page.waitForTimeout(250);
ok(await page.locator('#srout a[href="#train-lifting"]').count() >= 1, "поиск не находит новую страницу");
await page.click('#srout a[href="#train-lifting"]'); ok(await loc() === "/train/lifting/", "переход из поиска: " + await loc());
await page.click("#bbsearch");
await page.fill("#srq", "тофу"); await page.waitForTimeout(250); ok(await page.locator("#srout a").count() > 3, "поиск по «тофу»");
// несуществующий адрес
const r404 = await page.goto(B + "/net-takoi-stranicy/"); ok(r404.status() === 404, "404"); ok(await page.locator("#app a.chap").count() > 5, "на 404 нет оглавления");
ok(!errs.length, "ошибки в консоли: " + errs.join(" | "));

// ---------- картинка «до/после» ----------
if (VISUAL) {
  const { PNG } = (() => { try { return require("pngjs") } catch { return {} } })();
  const so = await serve(OLD), BO = "http://127.0.0.1:" + so.address().port;
  const report = JSON.parse(fs.readFileSync(path.join(NEW, "..", "build-report.json"), "utf8"));
  const visText = (h) => h.slice(h.indexOf("<body")).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const expectDiff = new Set(report.bodyChanged.filter((p) => {
    const n = fs.readFileSync(path.join(NEW, p, "index.html"), "utf8");
    if (!n.includes('class="dhead"')) return true;
    const of = path.join(OLD, p, "index.html"); // карточка: ожидаем отличие, только если изменился сам текст
    return !fs.existsSync(of) || visText(fs.readFileSync(of, "utf8")) !== visText(n);
  }));
  let same = 0, diff = [];
  for (const w of [414, 1100]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of walk(OLD)) {
      if (w === 1100 && !/^\/(protein|carbs|fats|micro|taste|dishes)\/[^/]+\/$/.test(p)) continue;
      const ms = /^\/(dishes\/cat|taste\/(tastes|umami|meaty|marinades|spices|sauces|boosters)\/|res\/.|minds\/.|author)/.test(p) ? 700 : 40;
      await page.goto(BO + p); await page.waitForTimeout(ms); const a = await page.screenshot({ fullPage: true });
      await page.goto(B + p); await page.waitForTimeout(ms); const b = await page.screenshot({ fullPage: true });
      if (a.equals(b)) same++; else diff.push(p + "@" + w + (expectDiff.has(p) ? " (ожидаемо: текст менялся)" : " !!!"));
    }
  }
  so.close();
  console.log("одинаковых снимков:", same, "\nотличаются:", diff.join("\n  "));
  ok(!diff.some((d) => d.endsWith("!!!")), "вид страниц изменился там, где не должен");
}
await browser.close(); srv.close();
console.log("страниц:", routes.length, "· в sitemap:", locs.length);
console.log(fails.length ? "НЕ ПРОШЛО:\n- " + fails.join("\n- ") : "ВСЕ ПРОВЕРКИ ПРОШЛИ");
process.exit(fails.length ? 1 : 0);
