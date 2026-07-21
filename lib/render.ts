import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { svgText } from "./text-render";

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

// Bed and bath icons are already 1080×1350 — composite them at full size.
function loadBedIcon(): Buffer {
  return loadAsset("bed-icon.png");
}
function loadBathIcon(): Buffer {
  return loadAsset("bath-icon.png");
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
// Cover SVG overlay (text only — logo, bed, bath all composited as real PNGs)
// ---------------------------------------------------------------------------

async function buildCoverSvg(data: CoverData): Promise<string> {
  const status = (data.status || "FOR SALE").toUpperCase();

  const dimOverlay = data.backgroundImageUrl
    ? `<rect width="${PAGE_W}" height="${PAGE_H}" fill="black" opacity="0.35"/>`
    : "";

  const address = svgText(data.shortAddress, PAGE_W / 2, 570, 46, {
    anchor: "middle",
  });
  const statusText = svgText(status, PAGE_W / 2, 700, 130, {
    anchor: "middle",
  });

  // Count labels sit to the right of each icon PNG's visual content.
  // Icons are 240×240px centred at (330,824) and (655,824):
  //   Bed  icon: x 210–450, y 704–944
  //   Bath icon: x 535–775, y 704–944
  // Text baseline 20px below icon centre: 824 + 20 = 844.
  const countY = 844;

  const bedCount =
    data.bedrooms !== null && data.bedrooms !== undefined
      ? svgText(`x${data.bedrooms}`, 458, countY, 56, { weight: "light", anchor: "start" })
      : "";

  const bathCount =
    data.bathrooms !== null && data.bathrooms !== undefined
      ? svgText(`x${data.bathrooms}`, 783, countY, 56, { weight: "light", anchor: "start" })
      : "";

  const office = svgText(data.office, PAGE_W / 2, 1180, 40, {
    anchor: "middle",
  });
  const phoneLine = svgText(`Contact ${data.phone}`, PAGE_W / 2, 1235, 40, {
    anchor: "middle",
  });
  const website = svgText(data.website, PAGE_W / 2, 1290, 40, {
    anchor: "middle",
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
  ${dimOverlay}
  ${address}
  ${statusText}
  ${bedCount}
  ${bathCount}
  ${office}
  ${phoneLine}
  ${website}
</svg>`;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

// Logo sits centred at the top of the cover.
const COVER_LOGO_W = 420;
const COVER_LOGO_H = Math.round((COVER_LOGO_W / 250) * 150); // 252
const COVER_LOGO_TOP = 60;
const COVER_LOGO_LEFT = Math.round((PAGE_W - COVER_LOGO_W) / 2); // 330

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

  const [svg, logoBuf] = await Promise.all([
    buildCoverSvg(data),
    scaledLogo(COVER_LOGO_W),
  ]);

  const bedIconBuf = loadBedIcon();   // already 1080×1350, composite at (0,0)
  const bathIconBuf = loadBathIcon(); // same

  return sharp(baseInput)
    .composite([
      { input: Buffer.from(svg), top: 0, left: 0 },                    // dim + text
      { input: bedIconBuf, top: 0, left: 0 },                          // bed icon PNG
      { input: bathIconBuf, top: 0, left: 0 },                         // bath icon PNG
      { input: logoBuf, top: COVER_LOGO_TOP, left: COVER_LOGO_LEFT },  // real logo
    ])
    .png()
    .toBuffer();
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

export async function renderReduced(data: ReducedData): Promise<Buffer> {
  const imgBuf = await fetchBuffer(data.backgroundImageUrl);
  const bgBuf = await cropToFill(imgBuf, PAGE_W, PAGE_H, "centre");

  const overlaySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">
  <rect x="0" y="${OVERLAY_TOP}" width="${PAGE_W}" height="${OVERLAY_BOT - OVERLAY_TOP}" fill="black" opacity="0.55"/>
  ${svgText("JUST REDUCED", TEXT_LEFT, OVERLAY_TOP + 95, 72, { weight: "bold-italic", anchor: "start" })}
  ${svgText(data.shortAddress, TEXT_LEFT, OVERLAY_TOP + 175, 52, { weight: "light", anchor: "start" })}
  ${svgText(data.price, TEXT_LEFT, OVERLAY_TOP + 265, 70, { weight: "bold-italic", anchor: "start" })}
</svg>`;

  const [svgBuf, logoBuf, waveBuf] = await Promise.all([
    Promise.resolve(Buffer.from(overlaySvg)),
    scaledLogo(REDUCED_LOGO_W),
    Promise.resolve(loadAsset("wave.png")),
  ]);

  // Wave goes first so text SVG renders on top of it
  return sharp(bgBuf)
    .composite([
      { input: waveBuf, top: 0, left: 0 },
      { input: svgBuf, top: 0, left: 0 },
      { input: logoBuf, top: REDUCED_LOGO_TOP, left: REDUCED_LOGO_LEFT },
    ])
    .png()
    .toBuffer();
}
