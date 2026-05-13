import { NextResponse } from "next/server";
import { createDraft } from "@/lib/sendible";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { longCaption, xCaption, imageUrls } = (await req.json()) as {
      longCaption: string;
      xCaption: string;
      imageUrls: string[];
    };
    if (!longCaption || !xCaption || !imageUrls?.length) {
      return NextResponse.json(
        { error: "longCaption, xCaption, imageUrls required" },
        { status: 400 },
      );
    }
    const result = await createDraft({ longCaption, xCaption, imageUrls });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
