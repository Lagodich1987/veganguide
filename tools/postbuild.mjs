// Всё, что делается с готовым сайтом при выкладке, по порядку. node tools/postbuild.mjs <папка сайта>
// Вызывается из .github/workflows/deploy.yml. Новые шаги добавляются сюда, файл выкладки трогать не нужно.
// Если любой шаг упадёт, выкладка не пройдёт и на сайте останется прежняя версия.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.argv[2];
if (!DIR) throw new Error("укажи папку сайта");
const here = path.dirname(fileURLToPath(import.meta.url));
for (const step of ["schema.mjs", "fonts.mjs"])
  execFileSync(process.execPath, [path.join(here, step), DIR], { stdio: "inherit" });
