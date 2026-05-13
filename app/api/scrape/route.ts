import { NextResponse } from "next/server";
import { scrapeProperty } from "@/lib/scraper";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
    const property = await scrapeProperty(url);
    return NextResponse.json({ property });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
