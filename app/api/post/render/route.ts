import { NextResponse } from "next/server";
import {
  renderCover,
  renderInterior,
  type CoverData,
  type InteriorData,
} from "@/lib/render";

export const maxDuration = 120;
export const runtime = "nodejs";

interface RenderRequest {
  cover: CoverData;
  interiors: InteriorData[]; // 1–9 pages
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RenderRequest;

    if (!body.cover) {
      return NextResponse.json({ error: "cover required" }, { status: 400 });
    }
    if (
      !Array.isArray(body.interiors) ||
      body.interiors.length < 1 ||
      body.interiors.length > 9
    ) {
      return NextResponse.json(
        { error: "interiors must be 1–9 pages" },
        { status: 400 },
      );
    }

    const coverPng = await renderCover(body.cover);
    const interiorPngs = await Promise.all(
      body.interiors.map((i) => renderInterior(i)),
    );

    const pages = [coverPng, ...interiorPngs].map(
      (buf) => `data:image/png;base64,${buf.toString("base64")}`,
    );

    return NextResponse.json({ pages });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
