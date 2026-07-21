// Render text as SVG <text> elements using embedded Poppins fonts via @font-face.
// Sharp's SVG renderer (librsvg) supports @font-face with data URIs, which
// avoids the opentype.js NaN glyph corruption seen in Poppins-Regular and
// Poppins-Light for certain characters (e.g. 'g', 'C', 'o', 's', 'e', 'w').

import path from "node:path";
import fs from "node:fs";

export type Weight = "light" | "regular" | "bold";
export type Anchor = "start" | "middle" | "end";

interface TextOpts {
  weight?: Weight;
  anchor?: Anchor;
  fill?: string;
}

const WEIGHT_NUM: Record<Weight, number> = { light: 300, regular: 400, bold: 700 };
const FONT_FILE: Record<Weight, string> = {
  light: "Poppins-Light.ttf",
  regular: "Poppins-Regular.ttf",
  bold: "Poppins-Bold.ttf",
};

function fontFilePath(file: string): string {
  const candidates = [
    path.join(process.cwd(), "fonts", file),
    path.join(process.cwd(), "..", "fonts", file),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Font not found: ${file} (tried ${candidates.join(", ")})`);
}

const _b64Cache = new Map<Weight, string>();

function fontB64(weight: Weight): string {
  if (_b64Cache.has(weight)) return _b64Cache.get(weight)!;
  const b64 = fs.readFileSync(fontFilePath(FONT_FILE[weight])).toString("base64");
  _b64Cache.set(weight, b64);
  return b64;
}

// Returns a <defs><style> block embedding @font-face for the requested weights.
// Include this once per SVG, then use <text> elements with font-family="Poppins".
export function fontFaceStyle(weights: Weight[]): string {
  const faces = weights
    .map(
      (w) =>
        `@font-face{font-family:'Poppins';font-weight:${WEIGHT_NUM[w]};src:url('data:font/truetype;base64,${fontB64(w)}');}`,
    )
    .join("");
  return `<defs><style>${faces}</style></defs>`;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Returns a SVG <text> element rendered with the embedded Poppins font.
export function svgText(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  opts: TextOpts = {},
): string {
  const { weight = "light", anchor = "start", fill = "white" } = opts;
  return `<text x="${x}" y="${y}" font-family="Poppins" font-weight="${WEIGHT_NUM[weight]}" font-size="${fontSize}" fill="${fill}" text-anchor="${anchor}">${escXml(text)}</text>`;
}
