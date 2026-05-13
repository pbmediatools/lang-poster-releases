import * as cheerio from "cheerio";
import type { Property } from "./types";

const PHONE = "01752 201010";

// Departments / branches as listed on langtownandcountry.com/contact/
export const OFFICES = {
  plymouth: { label: "Plymouth Office", phone: "01752 256000" },
  waterside: { label: "Waterside Office", phone: "01752 200909" },
  plymstock: { label: "Plymstock Office", phone: "01752 456000" },
} as const;

// Best-effort office routing from address + postcode. The property page
// itself doesn't expose the assigned branch, and "Book a Viewing" always
// links to the central Plymouth form, so this is heuristic. User can
// override in the UI.
function suggestOffice(opts: {
  postcode: string;
  address: string;
}): { label: string; phone: string } {
  const pc = opts.postcode.toUpperCase().replace(/\s+/g, "");
  const addr = opts.address.toLowerCase();

  // Plymstock — its own branch, postcode area PL9
  if (/^PL9/.test(pc)) return OFFICES.plymstock;

  // Waterside team — handles waterfront / city-centre coastal stock
  const watersideKeywords = [
    "hoe",
    "barbican",
    "stonehouse",
    "cattedown",
    "waterside",
    "millbay",
    "royal william yard",
    "sutton harbour",
  ];
  if (watersideKeywords.some((k) => addr.includes(k))) return OFFICES.waterside;

  return OFFICES.plymouth;
}

export async function scrapeProperty(url: string): Promise<Property> {
  if (!/^https?:\/\/(www\.)?langtownandcountry\.com\/property\//i.test(url)) {
    throw new Error("Not a langtownandcountry.com property URL");
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LangPosterBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const text = (sel: string) => $(sel).first().text().trim();

  const title =
    text("h1") || text("h2") || $("title").text().split("|")[0].trim();
  const address = title;
  const shortAddress = address.split(",")[0].trim();

  const bodyText = $("body").text().replace(/\s+/g, " ");

  const priceMatch = bodyText.match(
    /£\s?[\d,]+(?:\s?(?:PCM|pcm|Per Calendar Month|per month))?/i,
  );
  const price = priceMatch ? priceMatch[0].replace(/\s+/g, " ").trim() : "";

  const postcodeMatch = bodyText.match(
    /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/,
  );
  const postcode = postcodeMatch ? postcodeMatch[1] : "";

  const num = (re: RegExp): number | null => {
    const m = bodyText.match(re);
    return m ? parseInt(m[1], 10) : null;
  };
  const bedrooms = num(/(\d+)\s*Bedroom/i);
  const bathrooms = num(/(\d+)\s*Bathroom/i);
  const receptionRooms = num(/(\d+)\s*Reception/i);

  const status = /To Let|For Sale|Let Agreed|Sold/i.exec(bodyText)?.[0] || "";

  // EPC rating — typically appears as "EPC Rating: B", "EPC: B", "EPC B" etc.
  const epcMatch = bodyText.match(/EPC[^A-Za-z0-9]{0,8}(?:Rating[^A-Za-z0-9]{0,4})?([A-G])\b/i);
  const epcRating = epcMatch ? epcMatch[1].toUpperCase() : null;

  // Features list — find a UL near a "Features" heading
  const features: string[] = [];
  $("h1,h2,h3,h4,strong").each((_, el) => {
    const t = $(el).text().trim().toLowerCase();
    if (t === "features" || t === "key features") {
      const ul = $(el).nextAll("ul").first();
      ul.find("li").each((_, li) => {
        const t = $(li).text().trim();
        if (t) features.push(t);
      });
    }
  });
  if (features.length === 0) {
    // Fallback: any UL with short bullet items
    $("ul").each((_, ul) => {
      const items = $(ul)
        .find("li")
        .map((_, li) => $(li).text().trim())
        .get()
        .filter((t) => t.length > 0 && t.length < 100);
      if (
        items.length >= 4 &&
        items.length <= 12 &&
        features.length === 0 &&
        items.some((i) => /bed|bath|kitchen|garden|location|floor/i.test(i))
      ) {
        features.push(...items);
      }
    });
  }

  // Description: collect all <p> with substantial text
  const paragraphs: string[] = [];
  $("p").each((_, p) => {
    const t = $(p).text().trim();
    if (t.length > 80 && !/cookie|privacy|terms|©/i.test(t)) {
      paragraphs.push(t);
    }
  });
  const description = paragraphs.slice(0, 6).join("\n\n");

  // Images — gallery photos. Lang's listings have moved between hosts over
  // time (alto4-alto-media → loopcrm.b-cdn.net), so match either, and pull
  // from raw HTML too in case images are lazy-loaded into JSON props.
  const imageUrls = new Set<string>();
  const isPropertyImage = (u: string) =>
    /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) &&
    !/floorplan/i.test(u) &&
    (
      /loopcrm\.b-cdn\.net\/propertyimages\//i.test(u) ||
      /alto4-alto-media\.s3\.amazonaws\.com.*\/Photo\//i.test(u)
    );

  $("img").each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src") || "";
    if (isPropertyImage(src)) imageUrls.add(src);
  });
  $('meta[property="og:image"]').each((_, m) => {
    const c = $(m).attr("content");
    if (c && isPropertyImage(c)) imageUrls.add(c);
  });
  // Fallback: scan raw HTML for any matching URL (covers JSON props in __NEXT_DATA__)
  const urlRe = /https?:\/\/[^"'\s)<>]+\.(?:jpg|jpeg|png|webp)/gi;
  for (const m of html.matchAll(urlRe)) {
    if (isPropertyImage(m[0])) imageUrls.add(m[0]);
  }

  return {
    url,
    title,
    address,
    shortAddress,
    price,
    status,
    postcode,
    bedrooms,
    bathrooms,
    receptionRooms,
    features,
    description,
    imageUrls: Array.from(imageUrls).slice(0, 100),
    phone: PHONE,
    epcRating,
    suggestedOffice: suggestOffice({ postcode, address }),
  };
}
