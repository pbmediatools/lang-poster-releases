import { NextResponse } from "next/server";
import { scrapeProperty } from "@/lib/scraper";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url: string };
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

    const property = await scrapeProperty(url);
    if (property.imageUrls.length < 2) {
      return NextResponse.json(
        { error: `Only ${property.imageUrls.length} images found on listing` },
        { status: 400 },
      );
    }

    return NextResponse.json({ property });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
