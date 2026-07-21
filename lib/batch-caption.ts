import Anthropic from "@anthropic-ai/sdk";
import type { Property } from "./types";

const client = new Anthropic();

const SALE_AGREED_PROMPT = `You are the social media copywriter for Lang Town & Country, an estate agency in Plymouth, UK. Write a weekly Sale Agreed round-up post covering multiple properties.

BRAND VOICE
British English. Warm, celebratory, professional. Specific over generic.
Use emojis ONLY as bullet markers — one per property line, chosen by type:
🏠 flat/apartment  🏡 house with garden  🏘️ block/development  🌊 waterfront  🌲 near woodland or countryside

FACEBOOK / INSTAGRAM (longForm)
1. Opening: "Another great week for our sellers. Here's a look at [N] more homes we've recently agreed sales on:"
2. One line per property: {emoji} {address}: {N}-bed {type}, {1–2 key details from features/description}
3. Blank line, then: "Thinking of selling? Get a free valuation."
4. 📞 {phone}

X / TWITTER (xCaption)
Same structure but shorter bullet lines (address + 1 key detail only).
CTA: "Thinking of selling? Get a free valuation."
End with 📞 {phone}
Aim for under 280 chars total; with 4+ properties it may slightly exceed — be as concise as possible.

OUTPUT: Return ONLY valid JSON with no preamble:
{ "longForm": "...", "xCaption": "..." }`;

const REDUCED_PROMPT = `You are the social media copywriter for Lang Town & Country, an estate agency in Plymouth, UK. Write a Price Reduction round-up post covering multiple properties.

BRAND VOICE
British English. Frame reductions as opportunity, never desperation. Specific, benefit-led descriptions.
Use emojis ONLY as bullet markers — one per property line:
🏠 flat/apartment  🏡 house with garden  🌲 near woodland/nature  🌊 waterfront/coastal  🏘️ development

FACEBOOK / INSTAGRAM (longForm)
1. Opening: "Worth a second look: [N] homes with brand new price tags. 📉"  (use "two homes" / "three homes" etc. for N ≤ 3)
2. One bullet per property: {emoji} {address}: {1–2 sentences — lifestyle/feature appeal, drawn from description and features}
3. Blank line, then: "If one of these has been on your watchlist, now could be the perfect time to arrange a viewing."
4. 🔗 Langtownandcountry.com
5. 📞 {phone}
6. Hashtags on one line: #PlymouthProperty #JustReduced #LangTownAndCountry #HouseHunting

X / TWITTER (xCaption)
Header: "Price reductions 📉"
Shorter bullet lines per property (address + 1 key detail only).
🔗 Langtownandcountry.com
📞 {phone}
#PlymouthProperty #JustReduced #LangTownAndCountry
Aim for under 280 chars; with multiple properties be as concise as possible.

OUTPUT: Return ONLY valid JSON with no preamble:
{ "longForm": "...", "xCaption": "..." }`;

export interface BatchCaptionInput {
  mode: "sale-agreed" | "reduced";
  properties: Pick<Property, "shortAddress" | "bedrooms" | "bathrooms" | "features" | "description">[];
  phone: string;
}

export interface BatchCaptionResult {
  longForm: string;
  xCaption: string;
}

export async function generateBatchCaption(
  input: BatchCaptionInput,
): Promise<BatchCaptionResult> {
  const systemPrompt = input.mode === "sale-agreed" ? SALE_AGREED_PROMPT : REDUCED_PROMPT;

  const userPayload = JSON.stringify(
    {
      phone: input.phone,
      properties: input.properties.map((p) => ({
        shortAddress: p.shortAddress,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        features: p.features.slice(0, 8),
        description: p.description.slice(0, 600),
      })),
    },
    null,
    2,
  );

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1500,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Write the social media captions for this batch:\n\n${userPayload}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text in Claude response");

  const raw = textBlock.text.trim();
  const json = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "");

  let parsed: BatchCaptionResult;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Caption JSON parse failed: ${(e as Error).message}\n${raw}`);
  }

  return parsed;
}
