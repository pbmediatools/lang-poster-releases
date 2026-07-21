import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { svgText, fontFaceStyle } from "./text-render";

export const PAGE_W = 1080;
export const PAGE_H = 1350;

// ---------------------------------------------------------------------------
// Asset loaders — checked in both dev (cwd = project root) and
// standalone/Electron (cwd = .next/standalone, public one level up).
// ---------------------------------------------------------------------------

function loadAsset(filename: string): Buffer {
  const candidates = [
    path.join(process.cwd(), "public", filename),
    path.join(process.cwd(), "..", "public", filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c);
  }
  throw new Error(`Asset not found: ${filename} (tried: ${candidates.join(", ")})`);
}

// Scale the LTC logo (250×150 source) to the desired width.
async function scaledLogo(targetW: number): Promise<Buffer> {
  const targetH = Math.round((targetW / 250) * 150);
  return sharp(loadAsset("ltc-logo.png")).resize(targetW, targetH).png().toBuffer();
}

// Extract icon content from its full-size transparent PNG, then scale to targetH.
// Returns the resized buffer and its actual width.
async function extractIcon(filename: string, targetH: number): Promise<{ buf: Buffer; w: number }> {
  const { data, info } = await sharp(loadAsset(filename))
    .trim({ threshold: 0 })
    .toBuffer({ resolveWithObject: true });
  const w = Math.round(info.width * (targetH / info.height));
  const buf = await sharp(data).resize(w, targetH).png().toBuffer();
  return { buf, w };
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CoverData {
  shortAddress: string;
  status: string;
  bedrooms: number | null;
  bathrooms: number | null;
  office: string;
  phone: string;
  website: string;
  backgroundImageUrl: string | null;
}

export interface InteriorData {
  topImageUrl: string;
  bottomImageUrl?: string;
}

export interface SaleAgreedData {
  shortAddress: string;
  office: string;
  phone: string;
  website: string;
  backgroundImageUrl: string;
}

export interface ReducedData {
  shortAddress: string;
  price: string;
  backgroundImageUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LangPosterBot/1.0)" },
  });
  if (!r.ok) throw new Error(`Image fetch ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

type Anchor = "centre" | "bottom-right";

async function cropToFill(
  buf: Buffer,
  targetW: number,
  targetH: number,
  anchor: Anchor,
): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const srcW = meta.width ?? targetW;
  const srcH = meta.height ?? targetH;
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const scaledW = Math.max(targetW, Math.round(srcW * scale));
  const scaledH = Math.max(targetH, Math.round(srcH * scale));
  const excessX = scaledW - targetW;
  const excessY = scaledH - targetH;
  const cropX = anchor === "bottom-right" ? excessX : Math.round(excessX / 2);
  const cropY = anchor === "bottom-right" ? excessY : Math.round(excessY / 2);
  return sharp(buf)
    .resize(scaledW, scaledH)
    .extract({ left: cropX, top: cropY, width: targetW, height: targetH })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Cover layout constants
// ---------------------------------------------------------------------------

const COVER_LOGO_W    = 420;
const COVER_LOGO_H    = Math.round((COVER_LOGO_W / 250) * 150); // 252
const COVER_LOGO_TOP  = 60;
const COVER_LOGO_LEFT = Math.round((PAGE_W - COVER_LOGO_W) / 2); // 330

const COVER_ADDR_Y   = 500;  // address text baseline
const COVER_STATUS_Y = 640;  // status text baseline ("FOR SALE")

const COVER_ICON_H    = 98;  // display height for bed/bath icons (original reference size)
const COVER_ICON_Y    = 824; // vertical centre of icon row (from reference PNG)
const COVER_ICON_GAP  = 18;  // gap between icon right edge and "x2" label
const COVER_PAIR_GAP  = 113; // gap between the two [icon + x2] pairs (from reference PNG)
const COVER_COUNT_W   = 72;  // estimated px width of "x2" at COVER_COUNT_FONT
const COVER_COUNT_FONT = 60;

const COVER_FOOTER_Y = [1105, 1158, 1213]; // office / phone / website baselines

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

export async function renderCover(data: CoverData): Promise<Buffer> {
  let baseInput: Buffer;
  if (data.backgroundImageUrl) {
    const imgBuf = await fetchBuffer(data.backgroundImageUrl);
    baseInput = await cropToFill(imgBuf, PAGE_W, PAGE_H, "centre");
  } else {
    baseInput = await sharp({
      create: {
        width: PAGE_W,
        height: PAGE_H,
        channels: 3,
        background: { r: 173, g: 173, b: 173 },
      },
    })
      .png()
      .toBuffer();
  }

  const hasBed  = data.bedrooms  !== null && data.bedrooms  !== undefined;
  const hasBath = data.bathrooms !== null && data.bathrooms !== undefined;

  // Extract and scale icons from their full-size transparent PNGs
  const [bedIcon, bathIcon, logoBuf] = await Promise.all([
    hasBed  ? extractIcon("bed-icon.png",  COVER_ICON_H) : null,
    hasBath ? extractIcon("bath-icon.png", COVER_ICON_H) : null,
    scaledLogo(COVER_LOGO_W),
  ]);

  // Compute horizontal row layout and centre it on the canvas
  let rowW = 0;
  if (bedIcon)  rowW += bedIcon.w  + COVER_ICON_GAP + COVER_COUNT_W;
  if (bedIcon && bathIcon) rowW += COVER_PAIR_GAP;
  if (bathIcon) rowW += bathIcon.w + COVER_ICON_GAP + COVER_COUNT_W;

  let cur = Math.round((PAGE_W - rowW) / 2);
  const iconTop  = COVER_ICON_Y - Math.round(COVER_ICON_H / 2);
  const countY   = COVER_ICON_Y + 18;

  let bedIconLeft = 0, bedCountX = 0;
  if (bedIcon) {
    bedIconLeft = cur;
    bedCountX   = cur + bedIcon.w + COVER_ICON_GAP;
    cur        += bedIcon.w + COVER_ICON_GAP + COVER_COUNT_W + (bathIcon ? COVER_PAIR_GAP : 0);
  }
  let bathIconLeft = 0, bathCountX = 0;
  if (bathIcon) {
    bathIconLeft = cur;
    bathCountX   = cur + bathIcon.w + COVER_ICON_GAP;
  }

  const status = (data.status || "FOR SALE").toUpperCase();
  const dimOverlay = data.backgroundImageUrl
    ? `<rect width="${PAGE_W}" height="${PAGE_H}" fill="black" opacity="0.35"/>`
    : "";

  const coverSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
  ${fontFaceStyle(["light"])}
  ${dimOverlay}
  ${svgText(data.shortAddress, PAGE_W / 2, COVER_ADDR_Y, 46, { anchor: "middle" })}
  ${svgText(status, PAGE_W / 2, COVER_STATUS_Y, 130, { anchor: "middle" })}
  ${hasBed  && data.bedrooms  !== null ? svgText(`x${data.bedrooms}`,  bedCountX,  countY, COVER_COUNT_FONT, { weight: "light", anchor: "start" }) : ""}
  ${hasBath && data.bathrooms !== null ? svgText(`x${data.bathrooms}`, bathCountX, countY, COVER_COUNT_FONT, { weight: "light", anchor: "start" }) : ""}
  ${svgText(data.office,               PAGE_W / 2, COVER_FOOTER_Y[0], 40, { anchor: "middle" })}
  ${svgText(`Contact ${data.phone}`,   PAGE_W / 2, COVER_FOOTER_Y[1], 40, { anchor: "middle" })}
  ${svgText(data.website,              PAGE_W / 2, COVER_FOOTER_Y[2], 40, { anchor: "middle" })}
</svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(coverSvg), top: 0, left: 0 },
    ...(bedIcon  ? [{ input: bedIcon.buf,  top: iconTop, left: bedIconLeft  }] : []),
    ...(bathIcon ? [{ input: bathIcon.buf, top: iconTop, left: bathIconLeft }] : []),
    { input: logoBuf, top: COVER_LOGO_TOP, left: COVER_LOGO_LEFT },
  ];

  return sharp(baseInput).composite(composites).png().toBuffer();
}

export async function renderInterior(data: InteriorData): Promise<Buffer> {
  // Interior pages use the property photos only — no logo overlay
  // (the source photos already carry the LTC watermark).
  if (!data.bottomImageUrl) {
    const buf = await fetchBuffer(data.topImageUrl);
    const cropped = await cropToFill(buf, PAGE_W, PAGE_H, "bottom-right");
    return sharp(cropped).png().toBuffer();
  }

  const GAP = 16;
  const HALF_TOP = Math.floor((PAGE_H - GAP) / 2);
  const HALF_BOT = Math.ceil((PAGE_H - GAP) / 2);

  const [topBuf, bottomBuf] = await Promise.all([
    fetchBuffer(data.topImageUrl),
    fetchBuffer(data.bottomImageUrl),
  ]);

  const [top, bottom] = await Promise.all([
    cropToFill(topBuf, PAGE_W, HALF_TOP, "bottom-right"),
    cropToFill(bottomBuf, PAGE_W, HALF_BOT, "bottom-right"),
  ]);

  return sharp({
    create: {
      width: PAGE_W,
      height: PAGE_H,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: top, top: 0, left: 0 },
      { input: bottom, top: HALF_TOP + GAP, left: 0 },
    ])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Sale Agreed — same layout as cover but no bed/bath icons, status fixed
// ---------------------------------------------------------------------------

export async function renderSaleAgreed(data: SaleAgreedData): Promise<Buffer> {
  const imgBuf = await fetchBuffer(data.backgroundImageUrl);
  const bgBuf = await cropToFill(imgBuf, PAGE_W, PAGE_H, "centre");

  const dimSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">
  ${fontFaceStyle(["light"])}
  <rect width="${PAGE_W}" height="${PAGE_H}" fill="black" opacity="0.40"/>
  ${svgText(data.shortAddress, PAGE_W / 2, 570, 46, { anchor: "middle" })}
  ${svgText("SALE AGREED", PAGE_W / 2, 710, 120, { anchor: "middle" })}
  ${svgText(data.office, PAGE_W / 2, 1180, 40, { anchor: "middle" })}
  ${svgText(`Contact ${data.phone}`, PAGE_W / 2, 1235, 40, { anchor: "middle" })}
  ${svgText(data.website, PAGE_W / 2, 1290, 40, { anchor: "middle" })}
</svg>`;

  const [svgBuf, logoBuf] = await Promise.all([
    Promise.resolve(Buffer.from(dimSvg)),
    scaledLogo(COVER_LOGO_W),
  ]);

  return sharp(bgBuf)
    .composite([
      { input: svgBuf, top: 0, left: 0 },
      { input: logoBuf, top: COVER_LOGO_TOP, left: COVER_LOGO_LEFT },
    ])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Reduced — logo top-right, overlay band, JUST REDUCED + address + price,
// wave PNG across the bottom
// ---------------------------------------------------------------------------

const REDUCED_LOGO_W = 200;
const REDUCED_LOGO_TOP = 40;
const REDUCED_LOGO_LEFT = PAGE_W - REDUCED_LOGO_W - 40; // 840

// Overlay band sits from y=580 to y=890; text is left-aligned within it.
const OVERLAY_TOP = 580;
const OVERLAY_BOT = 890;
const TEXT_LEFT = 60;

const JR_Y    = OVERLAY_TOP + 90;   // JUST REDUCED baseline
const ADDR_Y  = OVERLAY_TOP + 170;  // address baseline
const PRICE_Y = OVERLAY_TOP + 255;  // price baseline

export async function renderReduced(data: ReducedData): Promise<Buffer> {
  const imgBuf = await fetchBuffer(data.backgroundImageUrl);
  const bgBuf = await cropToFill(imgBuf, PAGE_W, PAGE_H, "centre");

  // SVG 1 — dark overlay: parallelogram with diagonal right edge (doesn't span full width)
  const oTopRight = Math.round(PAGE_W * 0.82);  // right edge at top (886)
  const oBotRight = Math.round(PAGE_W * 0.70);  // right edge at bottom (756), leaning left to match italic
  const overlaySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">
  <polygon points="0,${OVERLAY_TOP} ${oTopRight},${OVERLAY_TOP} ${oBotRight},${OVERLAY_BOT} 0,${OVERLAY_BOT}" fill="black" opacity="0.55"/>
</svg>`;

  // SVG 2 — text; bold elements get an italic skew around their baseline
  const textSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">
  ${fontFaceStyle(["bold", "regular"])}
  <g transform="translate(0,${JR_Y}) skewX(-12) translate(0,-${JR_Y})">
    ${svgText("JUST REDUCED", TEXT_LEFT, JR_Y, 58, { weight: "bold", anchor: "start" })}
  </g>
  ${svgText(data.shortAddress, TEXT_LEFT, ADDR_Y, 50, { weight: "regular", anchor: "start" })}
  <g transform="translate(0,${PRICE_Y}) skewX(-12) translate(0,-${PRICE_Y})">
    ${svgText(data.price, TEXT_LEFT, PRICE_Y, 68, { weight: "bold", anchor: "start" })}
  </g>
</svg>`;

  const [overlayBuf, textBuf, logoBuf, waveBuf] = await Promise.all([
    Promise.resolve(Buffer.from(overlaySvg)),
    Promise.resolve(Buffer.from(textSvg)),
    scaledLogo(REDUCED_LOGO_W),
    Promise.resolve(loadAsset("wave.png")),
  ]);

  // Layer order: bg → grey band → wave (sits ON TOP of grey band) → text → logo
  return sharp(bgBuf)
    .composite([
      { input: overlayBuf, top: 0, left: 0 },
      { input: waveBuf, top: -50, left: 0 },
      { input: textBuf, top: 0, left: 0 },
      { input: logoBuf, top: REDUCED_LOGO_TOP, left: REDUCED_LOGO_LEFT },
    ])
    .png()
    .toBuffer();
}
