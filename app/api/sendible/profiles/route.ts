import { NextResponse } from "next/server";
import { listProfiles } from "@/lib/sendible";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await listProfiles();
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
