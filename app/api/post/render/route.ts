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

// Stream pages one-by-one as NDJSON to avoid a single huge JSON payload.
// Each line is a JSON object: { page: "data:image/png;base64,..." } or { error: "..." }
export async function POST(req: Request) {
  let body: RenderRequest;
  try {
    body = (await req.json()) as RenderRequest;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }) + "\n", {
      status: 400,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  if (!body.cover) {
    return new Response(JSON.stringify({ error: "cover required" }) + "\n", {
      status: 400,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }
  if (
    !Array.isArray(body.interiors) ||
    body.interiors.length < 1 ||
    body.interiors.length > 9
  ) {
    return new Response(
      JSON.stringify({ error: "interiors must be 1–9 pages" }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: Record<string, string>) {
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      }

      try {
        // Render cover
        const coverBuf = await renderCover(body.cover);
        send({ page: `data:image/png;base64,${coverBuf.toString("base64")}` });

        // Render interiors sequentially so memory stays bounded
        for (const interior of body.interiors) {
          const buf = await renderInterior(interior);
          send({ page: `data:image/png;base64,${buf.toString("base64")}` });
        }
      } catch (e) {
        send({ error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
