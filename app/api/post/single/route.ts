import {
  renderSaleAgreed,
  renderReduced,
  type SaleAgreedData,
  type ReducedData,
} from "@/lib/render";

export const maxDuration = 120;
export const runtime = "nodejs";

interface SingleItem {
  type: "sale-agreed" | "reduced";
  data: SaleAgreedData | ReducedData;
}

interface SingleRequest {
  items: SingleItem[];
}

export async function POST(req: Request) {
  let body: SingleRequest;
  try {
    body = (await req.json()) as SingleRequest;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }) + "\n", {
      status: 400,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return new Response(JSON.stringify({ error: "items required" }) + "\n", {
      status: 400,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: Record<string, unknown>) {
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      }

      try {
        for (let i = 0; i < body.items.length; i++) {
          const item = body.items[i];
          let buf: Buffer;
          if (item.type === "sale-agreed") {
            buf = await renderSaleAgreed(item.data as SaleAgreedData);
          } else {
            buf = await renderReduced(item.data as ReducedData);
          }
          send({ index: i, page: `data:image/png;base64,${buf.toString("base64")}` });
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
