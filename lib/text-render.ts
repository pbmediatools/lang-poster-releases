// Render text as SVG <path> elements using bundled Poppins fonts.
// Sharp's SVG renderer goes through libvips/pango which only sees system
// fonts, so we convert text to outlines via opentype.js to guarantee Poppins.

import { parse, type Font } from "opentype.js";
import path from "node:path";
import fs from "node:fs";

let _light: Font | null = null;
let _regular: Font | null = null;
let _boldItalic: Font | null = null;

function fontPath(file: string): string {
  // In dev: <project>/fonts/<file>. In packaged Electron, the standalone
  // server runs with cwd at .next/standalone, so fonts/ is relative to that
  // (we copy them in via prepare-electron). Try both.
  const candidates = [
    path.join(process.cwd(), "fonts", file),
    path.join(process.cwd(), "..", "fonts", file),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Font not found: ${file} (tried ${candidates.join(", ")})`);
}

function loadFont(file: string): Font {
  const buf = fs.readFileSync(fontPath(file));
  // opentype.parse expects an ArrayBuffer
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parse(ab as ArrayBuffer);
}

function lightFont(): Font {
  if (!_light) _light = loadFont("Poppins-Light.ttf");
  return _light;
}
function regularFont(): Font {
  if (!_regular) _regular = loadFont("Poppins-Regular.ttf");
  return _regular;
}
function boldItalicFont(): Font {
  if (!_boldItalic) _boldItalic = loadFont("Poppins-BoldItalic.ttf");
  return _boldItalic;
}

export type Weight = "light" | "regular" | "bold-italic";
export type Anchor = "start" | "middle" | "end";

interface TextOpts {
  weight?: Weight;
  anchor?: Anchor;
  fill?: string;
}

// opentype.js (1.3.5) emits literal "NaN" tokens in path data for some
// Poppins glyph combinations (e.g. "Plymouth Of…"), which makes Sharp's
// SVG parser bail mid-path. Walk the path command by command and drop any
// command whose args contain NaN — those few corrupted curves disappear,
// but the rest of the glyph contour still renders.
const ARGS_PER_CMD: Record<string, number> = {
  M: 2, m: 2, L: 2, l: 2, H: 1, h: 1, V: 1, v: 1,
  C: 6, c: 6, S: 4, s: 4, Q: 4, q: 4, T: 2, t: 2,
  A: 7, a: 7, Z: 0, z: 0,
};

function sanitizePath(d: string): string {
  if (!d.includes("NaN")) return d;
  // Tokenize: command letters and numeric tokens
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+(?:\.\d+)?|NaN/g);
  if (!tokens) return d;

  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (!(cmd in ARGS_PER_CMD)) {
      // Stray number — skip
      i++;
      continue;
    }
    const argCount = ARGS_PER_CMD[cmd];
    const args = tokens.slice(i + 1, i + 1 + argCount);
    const broken = args.some((t) => t === "NaN");
    if (!broken) {
      out.push(cmd, ...args);
    }
    i += 1 + argCount;
  }
  return out.join(" ");
}

// Returns one or more SVG <path> elements for the given text.
// Renders each character individually so a bad glyph (NaN path data) only
// affects that character rather than corrupting the entire string.
export function svgText(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  opts: TextOpts = {},
): string {
  const { weight = "light", anchor = "start", fill = "white" } = opts;
  const font = weight === "regular" ? regularFont() : weight === "bold-italic" ? boldItalicFont() : lightFont();
  const renderOpts = { kerning: false } as const;

  // Compute starting x accounting for text anchor
  const totalAdvance = font.getAdvanceWidth(text, fontSize, renderOpts);
  let curX = x;
  if (anchor === "middle") curX = x - totalAdvance / 2;
  else if (anchor === "end") curX = x - totalAdvance;

  const parts: string[] = [];
  for (const char of text) {
    const raw = font.getPath(char, curX, y, fontSize, renderOpts).toPathData(2);
    const d = sanitizePath(raw);
    if (d.trim()) parts.push(`<path d="${d}" fill="${fill}"/>`);
    curX += font.getAdvanceWidth(char, fontSize, renderOpts);
  }
  return parts.join("");
}
