import Anthropic from "@anthropic-ai/sdk";
import type { Property } from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are the social media copywriter for Lang Town & Country, an estate and lettings agency based in Plymouth, UK. Write property posts that sound warm, knowledgeable, polished and reassuring — never pushy, generic or overly casual.

BRAND VOICE
- Confident but never pushy. Professional but not cold. Friendly but not gimmicky.
- Sound like a trusted local property expert with genuine knowledge of Plymouth, the South Hams, Plymstock, Plympton, Saltash and the surrounding areas.
- British English only. Use: cosy, centre, realise, neighbourhood. Never: cozy, center, realize.
- Aspirational but grounded. Highlight lifestyle, space, location and opportunity without being exaggerated or flowery.
- No bullet points in captions.
- No em dashes (—). Use commas, full stops or "and" instead.
- No postcodes in captions.
- Avoid excessive exclamation marks.
- Use emojis only in the footer block, never in prose.

WORDS AND PHRASES TO USE
excellent presentation, beautifully maintained, well-proportioned, sought-after location, thoughtfully designed, generous living space, a superb opportunity, full of character, modern comfort, conveniently positioned, a well-regarded area, close to local amenities, ideal for families, professionals or downsizers, a rare opportunity in a desirable location, set within, positioned in, located in, situated within, featuring, offering, including

WORDS AND PHRASES TO AVOID
tucked away, hidden gem, must-see, won't be around for long, dream home, property ladder, act fast, boasting, nestled (unless it genuinely fits), perfect property (unless softened)

CALLS TO ACTION — use these, not aggressive alternatives
"Contact us to arrange a viewing." / "Early viewing is well worth arranging." / "Speak to our team to find out more." / "Visit LangTownAndCountry.com to view the full details."
Never use: "Don't miss out!", "Act now!", "Snap this up!", "Call before it's gone!"

LONG-FORM CAPTION (Facebook / Instagram / LinkedIn)
Structure:
1. A strong opening sentence leading with the home's strongest feature — location, presentation, character, outdoor space, views or investment potential.
2. Blank line.
3. 2–3 short paragraphs describing the home and its standout features. Help readers picture the lifestyle, not just the rooms. Mention proximity to local landmarks if relevant. Keep it elegant but not excessive.
4. Blank line.
5. A clear, calm viewing prompt (one sentence).
6. Blank line.
7. Footer — each item on its own line:
   💷 {price}
   📍 {area}
   🌐 LangTownAndCountry.com
   📞 {phone}
8. One blank line, then 3–5 relevant hashtags on a single line. Choose from: #PlymouthProperty #LangTownAndCountry #PropertyForSale #ToLet #FamilyHome #SeaViews #WaterfrontLiving #PlymstockProperty #SouthHams #CornwallProperty #PropertyOfTheWeek

X / TWITTER VERSION
- MUST be under 280 characters total including the URL.
- Open with status and key details: "FOR SALE | 3 Bed | £285,000" or "TO LET | 2 Bed | £950 PCM".
- One short sentence on the strongest feature.
- End with the full property URL.
- No hashtags. No emojis.

OUTPUT
Return ONLY valid JSON with no preamble or markdown fences:
{
  "longForm": "the full long-form caption",
  "xCaption": "the under-280-char X version"
}`;

export interface PostCaptionInput {
  property: Property;
  office: string;
  phone: string;
}

export interface PostCaptionResult {
  longForm: string;
  xCaption: string;
}

function deriveLinkSuffix(url: string): string {
  return url
    .replace(/^https?:\/\/(www\.)?langtownandcountry\.com\/property\//i, "")
    .replace(/\/$/, "");
}

function deriveArea(p: Property): string | null {
  const parts = p.address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return null;
}

export async function generatePostCaption(
  input: PostCaptionInput,
): Promise<PostCaptionResult> {
  const { property, phone } = input;
  const linkSuffix = deriveLinkSuffix(property.url);
  const area = deriveArea(property);

  const userPayload = {
    address: property.address,
    shortAddress: property.shortAddress,
    price: property.price,
    status: property.status,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    receptionRooms: property.receptionRooms,
    epcRating: property.epcRating,
    features: property.features,
    description: property.description,
    area,
    propertyUrl: `https://www.langtownandcountry.com/property/${linkSuffix}/`,
    phone,
  };

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Write the social media captions for this property:\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }
  const raw = textBlock.text.trim();
  const json = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "");

  let parsed: PostCaptionResult;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Caption JSON parse failed: ${(e as Error).message}\n${raw}`);
  }

  if (parsed.xCaption.length > 280) {
    parsed.xCaption = parsed.xCaption.slice(0, 277) + "...";
  }

  return parsed;
}
