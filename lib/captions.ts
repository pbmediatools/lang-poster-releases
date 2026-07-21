import Anthropic from "@anthropic-ai/sdk";
import type { Property, Captions } from "./types";

const client = new Anthropic();

// System prompt — frozen, cacheable. Reused across every property,
// so it lives at the front of the prefix and earns prompt-cache hits.
// Style guide reverse-engineered from the existing ChatGPT custom prompt
// (sample output observed in the recorded workflow). Replace the body of
// SYSTEM_PROMPT once the user shares the original GPT prompt — keep the
// JSON output contract intact.
const SYSTEM_PROMPT = `You are the social media copywriter for Lang Town & Country, an estate agent in Plymouth, UK. You write property posts that are warm, specific, and benefit-led — never generic or salesy.

VOICE
- Friendly, knowledgeable, neighbourly. British English spelling.
- Lead with the lifestyle the property offers, not the agent.
- Concrete details over adjectives. Skip "stunning", "must-see", "won't last".
- No emoji spam — one emoji per icon line is fine, none in body prose.

LONG-FORM CAPTION (Facebook / Instagram / LinkedIn)
Structure exactly:
1. ✨ One-line headline hook describing the lifestyle/location (with leading sparkle emoji).
2. Blank line.
3. Body: 2–3 short paragraphs from the description and features. Highlight the standout features. Mention proximity to local landmarks if mentioned in source.
4. Blank line.
5. Property details block, each on its own line (no space between emoji and value except 📞):
   💷{price}
   ⚡{epcRating}  ← only include if epcRating is provided
   📌{short address}
   🔗{url}
   📞 {phone}

X / TWITTER VERSION
- ONE single line. No line breaks anywhere in xVersion.
- MUST be under 280 characters total.
- Format exactly: {STATUS} | {N} Bed | {price} — {one short benefit sentence ending with a full stop}. {displayListingUrl}
- Use the displayListingUrl value exactly as supplied in the data — do not add http://, change capitalisation, or alter it in any way.
- No hashtags. No emojis. No footer block. No extra lines.
- Example: TO LET | 2 Bed | £950 pcm — Mid-terrace in Plymstock with a south-facing garden, recently decorated throughout. Langtownandcountry.com/property/example-street-plymstock/

OUTPUT FORMAT
Return ONLY a JSON object, no preamble. Schema:
{
  "headline": "the one-line hook (without the sparkle emoji)",
  "longForm": "the full long-form caption including emoji icons",
  "xVersion": "the under-280-char twitter version"
}`;

export async function generateCaptions(property: Property): Promise<Captions> {
  const linkSuffix = property.url
    .replace(/^https?:\/\/(www\.)?langtownandcountry\.com\/property\//i, "")
    .replace(/\/$/, "");
  const displayListingUrl = `Langtownandcountry.com/property/${linkSuffix}/`;

  const userPayload = JSON.stringify(
    {
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
      displayListingUrl,
      phone: property.phone,
    },
    null,
    2,
  );

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
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
        content: `Write the social media post for this property:\n\n${userPayload}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }
  const raw = textBlock.text.trim();
  // Strip markdown fences if Claude added them
  const json = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "");

  let parsed: Captions;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Caption JSON parse failed: ${(e as Error).message}\n${raw}`);
  }

  if (parsed.xVersion.length > 280) {
    console.warn(
      `xVersion is ${parsed.xVersion.length} chars (>280). Truncating.`,
    );
    parsed.xVersion = parsed.xVersion.slice(0, 277) + "...";
  }

  return parsed;
}
