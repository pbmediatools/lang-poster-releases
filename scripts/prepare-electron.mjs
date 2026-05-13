// Run after `next build`. Next's standalone output omits public/ and
// .next/static/ — copy them so the embedded server can serve them.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const standalone = path.join(root, ".next/standalone");

if (!fs.existsSync(standalone)) {
  console.error(
    "[prepare-electron] .next/standalone missing — did `next build` run with output:'standalone'?",
  );
  process.exit(1);
}

const copies = [
  { src: path.join(root, "public"), dst: path.join(standalone, "public") },
  {
    src: path.join(root, ".next/static"),
    dst: path.join(standalone, ".next/static"),
  },
  // Poppins TTFs read at runtime by lib/text-render.ts
  { src: path.join(root, "fonts"), dst: path.join(standalone, "fonts") },
];

for (const { src, dst } of copies) {
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[prepare-electron] copied ${path.relative(root, src)} → ${path.relative(root, dst)}`);
}

console.log("[prepare-electron] done.");
