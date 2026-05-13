import { NextResponse } from "next/server";
import { generateCover } from "@/lib/canva";
import type { Property } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { property } = (await req.json()) as { property: Property };
    if (!property) {
      return NextResponse.json({ error: "property required" }, { status: 400 });
    }
    const cover = await generateCover(property);
    return NextResponse.json({ cover });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
