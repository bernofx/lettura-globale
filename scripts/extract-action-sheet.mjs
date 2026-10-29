// Mechanical export of five independent panels produced by ImageGen, no visual retouching.
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.resolve("wrangler/package.json"));
const sharp = createRequire(require.resolve("miniflare"))("sharp");
const [sheet, subject, divider] = process.argv.slice(2);
if (!sheet || !["coniglio", "cavallo", "panda", "scimmia"].includes(subject)) throw new Error("Usage: node scripts/extract-action-sheet.mjs /absolute/sheet.png subject [row-divider]");
const metadata = await sharp(sheet).metadata();
const split = divider ? Number(divider) : Math.floor(metadata.height / 2);
const width = Math.floor(metadata.width / 3);
if (!Number.isInteger(split) || split <= 4 || split >= metadata.height - 4) throw new Error("Invalid divider");
for (const [index, verb] of ["mangia", "dorme", "corre", "salta", "gioca"].entries()) {
  const top = index < 3 ? 2 : split + 2;
  await sharp(sheet).extract({ left: (index % 3) * width + 2, top, width: width - 4, height: (index < 3 ? split : metadata.height - split) - 4 })
    .webp({ quality: 85 }).toFile(resolve(`public/images/actions/${subject}-${verb}.webp`));
}
console.log(`Exported five action images: ${subject}`);
