import type { Property, CoverImage } from "./types";

const CANVA_API = "https://api.canva.com/rest/v1";

function token(): string {
  const t = process.env.CANVA_ACCESS_TOKEN;
  if (!t) throw new Error("CANVA_ACCESS_TOKEN not set");
  return t;
}

async function pollJob<T>(
  url: string,
  pickResult: (j: { status: string; [k: string]: unknown }) => T | null,
  timeoutMs = 60_000,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!r.ok) throw new Error(`Poll ${url} failed: ${r.status}`);
    const body = await r.json();
    const job = body.job ?? body;
    if (job.status === "success") {
      const result = pickResult(job);
      if (result) return result;
      throw new Error("Job success but no result extracted");
    }
    if (job.status === "failed") {
      throw new Error(`Canva job failed: ${JSON.stringify(job.error)}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Canva job timed out");
}

async function uploadAsset(
  imageBytes: Buffer,
  name: string,
): Promise<string> {
  const nameB64 = Buffer.from(name).toString("base64");
  const r = await fetch(`${CANVA_API}/asset-uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/octet-stream",
      "Asset-Upload-Metadata": JSON.stringify({ name_base64: nameB64 }),
    },
    body: new Uint8Array(imageBytes),
  });
  if (!r.ok) throw new Error(`Asset upload failed: ${r.status} ${await r.text()}`);
  const { job } = await r.json();

  return await pollJob<string>(
    `${CANVA_API}/asset-uploads/${job.id}`,
    (j) => {
      const asset = (j as { asset?: { id?: string } }).asset;
      return asset?.id ?? null;
    },
  );
}

async function downloadImage(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Image fetch failed: ${url} ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function generateCover(property: Property): Promise<CoverImage> {
  const templateId = process.env.CANVA_BRAND_TEMPLATE_ID;
  if (!templateId) throw new Error("CANVA_BRAND_TEMPLATE_ID not set");

  // 1. Upload the first property photo as the cover hero.
  if (!property.imageUrls[0]) throw new Error("No property images to use");
  const imgBytes = await downloadImage(property.imageUrls[0]);
  const assetId = await uploadAsset(
    imgBytes,
    `${property.shortAddress.slice(0, 40)} cover`,
  );

  // 2. Build the autofill data map.
  // PLACEHOLDER FIELD NAMES — must match the brand template's dataset.
  // Open the template in Canva, set up the Data autofill app, and use the
  // exact field names you defined there. Adjust this object to match.
  const data: Record<
    string,
    { type: "text"; text: string } | { type: "image"; asset_id: string }
  > = {
    address: { type: "text", text: property.shortAddress },
    status: { type: "text", text: property.status || "TO LET" },
    bedrooms: {
      type: "text",
      text: property.bedrooms != null ? `x${property.bedrooms}` : "",
    },
    bathrooms: {
      type: "text",
      text: property.bathrooms != null ? `x${property.bathrooms}` : "",
    },
    phone: { type: "text", text: property.phone },
    hero_image: { type: "image", asset_id: assetId },
  };

  // 3. Create the autofill job.
  const autofillRes = await fetch(`${CANVA_API}/autofills`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      brand_template_id: templateId,
      title: `${property.shortAddress} - ${property.status || "TO LET"}`,
      data,
    }),
  });
  if (!autofillRes.ok) {
    throw new Error(
      `Autofill failed: ${autofillRes.status} ${await autofillRes.text()}`,
    );
  }
  const autofillJob = (await autofillRes.json()).job;

  const designId = await pollJob<string>(
    `${CANVA_API}/autofills/${autofillJob.id}`,
    (j) => {
      const result = (j as { result?: { design?: { id?: string } } }).result;
      return result?.design?.id ?? null;
    },
  );

  // 4. Export the design as PNG.
  const exportRes = await fetch(`${CANVA_API}/exports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      design_id: designId,
      format: { type: "png" },
    }),
  });
  if (!exportRes.ok) {
    throw new Error(
      `Export failed: ${exportRes.status} ${await exportRes.text()}`,
    );
  }
  const exportJob = (await exportRes.json()).job;

  const downloadUrl = await pollJob<string>(
    `${CANVA_API}/exports/${exportJob.id}`,
    (j) => {
      const urls = (j as { urls?: string[] }).urls;
      return urls?.[0] ?? null;
    },
  );

  return { url: downloadUrl, designId };
}
