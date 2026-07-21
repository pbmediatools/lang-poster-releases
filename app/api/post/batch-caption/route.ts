import { generateBatchCaption, type BatchCaptionInput } from "@/lib/batch-caption";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: BatchCaptionInput;
  try {
    body = (await req.json()) as BatchCaptionInput;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.mode || !Array.isArray(body.properties) || body.properties.length === 0) {
    return Response.json({ error: "mode and properties[] required" }, { status: 400 });
  }

  try {
    const result = await generateBatchCaption(body);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
