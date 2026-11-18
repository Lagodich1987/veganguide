// Дорисовывает картинки превью для новых страниц по отчёту сборки: node og_missing.mjs <папка сайта>
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const OUT = process.argv[2], here = path.dirname(fileURLToPath(import.meta.url));
const rep = JSON.parse(fs.readFileSync(path.join(OUT, "..", "build-report.json"), "utf8"));
const un = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&quot;/g, '"');
for (const p of rep.needOg) {
  const h = fs.readFileSync(path.join(OUT, p, "index.html"), "utf8");
  const eb = un(h.match(/id="bbch">([^<]*)</)[1]), t = un(h.match(/<h1[^>]*>([^<]*)</)[1]);
  const f = path.join(OUT, "og", p.replace(/^\/|\/$/g, "").replace(/\//g, "-") + ".jpg");
  execFileSync("node", [path.join(here, "og.mjs"), f, eb, t], { stdio: "inherit" });
  console.log("превью:", f, "|", eb, "|", t);
}
