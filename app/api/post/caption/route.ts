import { NextResponse } from "next/server";
import { generatePostCaption } from "@/lib/post-caption";
import type { Property } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { property, office, phone } = (await req.json()) as {
      property: Property;
      office: string;
      phone: string;
    };
    if (!property) {
      return NextResponse.json({ error: "property required" }, { status: 400 });
    }
    const caption = await generatePostCaption({ property, office, phone });
    return NextResponse.json({ caption });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
