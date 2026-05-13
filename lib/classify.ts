import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type RoomLabel =
  | "kitchen"
  | "master_bedroom"
  | "bedroom"
  | "bathroom"
  | "lounge"
  | "dining"
  | "exterior"
  | "garden"
  | "view"
  | "hallway"
  | "floorplan"
  | "other";

export interface ClassifiedImage {
  url: string;
  label: RoomLabel;
  isHero: boolean;
  appeal: number; // 1-10
  note: string;
}

const SYSTEM = `You are classifying property listing photos for a UK estate agent.

For each image:
- label: one of kitchen, master_bedroom, bedroom, bathroom, lounge, dining, exterior, garden, view, hallway, floorplan, other
- isHero: true if this looks like a "hero shot" suitable for a cover (wide, well-lit, often the front of the house, kitchen-diner, or main living space) — at most one image per listing should be true
- appeal: 1-10 — how visually appealing/sharable this is (composition, lighting, staging). Floorplans/dark/blurry shots score low.
- note: short reason (under 12 words)

Return STRICT JSON: { "items": [{"label":..., "isHero":..., "appeal":..., "note":...}, ...] } in the SAME ORDER as the images provided. No markdown, no prose.`;

async function urlToBase64(
  url: string,
): Promise<{ data: string; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LangPosterBot/1.0)" },
  });
  if (!r.ok) throw new Error(`Image fetch ${r.status}: ${url}`);
  const ct = r.headers.get("content-type") || "image/jpeg";
  const media_type = (
    ct.includes("png")
      ? "image/png"
      : ct.includes("webp")
        ? "image/webp"
        : ct.includes("gif")
          ? "image/gif"
          : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  const buf = Buffer.from(await r.arrayBuffer());
  return { data: buf.toString("base64"), media_type };
}

export async function classifyImages(
  urls: string[],
): Promise<ClassifiedImage[]> {
  if (urls.length === 0) return [];

  const sources = await Promise.all(urls.map(urlToBase64));

  const content: Anthropic.ContentBlockParam[] = [];
  sources.forEach((s, i) => {
    content.push({
      type: "text",
      text: `Image ${i + 1}:`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: s.media_type, data: s.data },
    });
  });
  content.push({
    type: "text",
    text: `Classify all ${urls.length} images. Return strict JSON as specified.`,
  });

  const resp = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Strip any code fence just in case
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    items: Array<{
      label: RoomLabel;
      isHero: boolean;
      appeal: number;
      note: string;
    }>;
  };

  return parsed.items.map((item, i) => ({ url: urls[i], ...item }));
}

// Pick best 8 + hero. Required labels (kitchen, master_bedroom, bathroom, lounge,
// exterior) are prioritized; remainder fills with highest appeal.
export interface PickedImages {
  hero: ClassifiedImage | null;
  pages: ClassifiedImage[]; // 8 images for 4 interior pages
}

export function pickImages(items: ClassifiedImage[]): PickedImages {
  const usable = items.filter((i) => i.label !== "floorplan");
  const hero = usable.find((i) => i.isHero) ||
    usable.slice().sort((a, b) => b.appeal - a.appeal)[0] || null;

  const wantOrder: RoomLabel[] = [
    "kitchen",
    "master_bedroom",
    "lounge",
    "bathroom",
    "exterior",
    "garden",
    "view",
    "dining",
    "bedroom",
    "hallway",
    "other",
  ];

  const remaining = usable.filter((i) => i !== hero);
  const picked: ClassifiedImage[] = [];

  // First, take one of each required label (in priority order) if available
  for (const want of wantOrder) {
    if (picked.length >= 8) break;
    const candidate = remaining
      .filter((i) => !picked.includes(i) && i.label === want)
      .sort((a, b) => b.appeal - a.appeal)[0];
    if (candidate) picked.push(candidate);
  }

  // Then fill remaining slots with highest-appeal leftovers
  const leftovers = remaining
    .filter((i) => !picked.includes(i))
    .sort((a, b) => b.appeal - a.appeal);
  while (picked.length < 8 && leftovers.length > 0) {
    picked.push(leftovers.shift()!);
  }

  return { hero, pages: picked };
}
