import { NextResponse } from "next/server";
import { generateCaptions } from "@/lib/captions";
import type { Property } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { property } = (await req.json()) as { property: Property };
    if (!property) {
      return NextResponse.json({ error: "property required" }, { status: 400 });
    }
    const captions = await generateCaptions(property);
    return NextResponse.json({ captions });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
