import Anthropic from "@anthropic-ai/sdk";
import type { Property } from "./types";

const client = new Anthropic();

// User's exact style guide. Frozen + cacheable.
const SYSTEM_PROMPT = `You are the social media copywriter for Lang Town & Country, an estate agent in Plymouth, UK. Write a social media caption for a property using the details provided.

STYLE AND TONE
- Professional but conversational, never overly salesy
- Confident, calm, and lifestyle-led
- Natural and human (avoid generic or AI-sounding phrases)
- Focus on key highlights only, not every detail
- Written in UK English

STRUCTURE
1. Open straight into 1 or 2 short paragraphs describing the property, focusing on standout features, lifestyle, and location. Do NOT write a headline or title sentence at the top of the caption.
2. Keep sentences flowing. Do not use bullet points.
3. Do not over-describe every room. Aim to create interest and encourage clicks.
4. Avoid overused phrases like "tucked away".
5. Do NOT use em dashes anywhere in the caption. Use commas, full stops, or "and" instead.

End the caption with this footer block, each line on its own line, in this exact order:
💷 {price}
📊 EPC Rating: {epcRating}
📍 {area}
🌐 LangTownAndCountry.com/{linkSuffix}
📞 {phone}

If epcRating is null or unknown, omit the EPC line entirely (do not write "EPC Rating: null"). If area is null, use the postcode area instead.

After the footer, add up to 5 relevant hashtags on a single line. Examples to draw from: #PlymouthProperty #PropertyForSale #LangTownAndCountry #DreamHome #PropertyOfTheWeek #FamilyHome #SeaViews. Pick whichever fit, max 5.

ADDITIONAL NOTES
- Highlight what makes the property appealing to a buyer (space, light, location, garden, views, character, etc.)
- Keep it concise but engaging
- Each caption should feel unique, even for similar properties
- Do not repeat the price, address, or phone number in the body if they appear in the footer

OUTPUT
Return only the final caption text, ready to paste into Facebook/Instagram/LinkedIn. No preamble, no JSON, no markdown fences.`;

export interface PostCaptionInput {
  property: Property;
  office: string;
  phone: string;
}

function deriveLinkSuffix(url: string): string {
  // e.g. https://www.langtownandcountry.com/property/st-michaels-lodge/ → "st-michaels-lodge"
  return url
    .replace(/^https?:\/\/(www\.)?langtownandcountry\.com\/property\//i, "")
    .replace(/\/$/, "");
}

function deriveArea(p: Property): string | null {
  // Take the last comma-separated segment of the address, e.g.
  // "St Michaels Lodge, Devonport Road, Stoke" → "Stoke"
  const parts = p.address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return null;
}

export async function generatePostCaption(
  input: PostCaptionInput,
): Promise<string> {
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
    postcode: property.postcode,
    epcRating: property.epcRating,
    features: property.features,
    description: property.description,
    area,
    linkSuffix,
    phone,
  };

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1200,
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
        content: `Write the caption for this property:\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }
  return textBlock.text.trim();
}
