// Картинка превью для соцсетей: node og.mjs <out.jpg> "<надпись сверху>" "<заголовок>"
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const [out, eyebrow, title] = process.argv.slice(2);
const P = JSON.parse(process.env.OG_PARAMS || "{}");
const o = Object.assign({ eb: 28, ebls: 0.08, ebw: 500, t: 84, tw: 700, tlh: 1.1, f: 30, g1: 25, g2: 39, tls: -0.01 }, P);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0}body{width:1200px;height:630px;background:#2E6C3D;color:#F6F6EE;font-family:"Inter",sans-serif;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;padding:0 90px 3px}
.e{font-size:${o.eb}px;font-weight:${o.ebw};letter-spacing:${o.ebls}em;text-transform:uppercase;opacity:.82;line-height:1}
.t{font-size:${o.t}px;font-weight:${o.tw};line-height:${o.tlh};letter-spacing:${o.tls}em;margin:${o.g1}px 0 ${o.g2}px;text-wrap:balance}
.f{font-size:${o.f}px;opacity:.82;line-height:1}
</style><div class="e">${esc(eyebrow)}</div><div class="t">${esc(title)}</div><div class="f">Гайд по веганскому питанию и жизни · veganguide.help</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.screenshot({ path: out, type: "jpeg", quality: 88 });
await b.close();
