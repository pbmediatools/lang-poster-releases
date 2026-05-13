"use client";

import JSZip from "jszip";
import { useMemo, useState } from "react";
import type { Property } from "@/lib/types";

const OFFICES = [
  { label: "Plymouth Office", phone: "01752 256000" },
  { label: "Waterside Office", phone: "01752 200909" },
  { label: "Plymstock Office", phone: "01752 456000" },
];

const STATUS_OPTIONS = ["FOR SALE", "TO LET", "LET AGREED", "SOLD"];

const MAX_TOTAL_IMAGES = 19; // 1 cover + 18 interior images (max 9 inside pages)

interface CoverEdit {
  shortAddress: string;
  status: string;
  bedrooms: number | null;
  bathrooms: number | null;
  office: string;
  phone: string;
  website: string;
  epcRating: string;
}

export default function PostPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<
    "" | "scraping" | "rendering" | "captioning"
  >("");
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [cover, setCover] = useState<CoverEdit | null>(null);
  // First url = cover, urls 1..N = interior images, paired into pages
  const [picks, setPicks] = useState<string[]>([]);
  const [renderedPages, setRenderedPages] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [copied, setCopied] = useState(false);
  // Thumbnail size in pixels (min column width). Drag the slider to resize.
  const [thumbSize, setThumbSize] = useState(180);

  const allImages = property?.imageUrls ?? [];

  const interiorPages = useMemo(() => {
    const interior = picks.slice(1); // drop cover
    const pages: {
      topImageUrl: string;
      bottomImageUrl?: string;
    }[] = [];
    for (let i = 0; i < interior.length; i += 2) {
      pages.push({
        topImageUrl: interior[i],
        bottomImageUrl: interior[i + 1],
      });
    }
    return pages;
  }, [picks]);

  const totalPages = picks.length === 0 ? 0 : 1 + interiorPages.length;
  const interiorCount = Math.max(0, picks.length - 1);
  const oddInterior = picks.length > 1 && interiorCount % 2 !== 0;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRenderedPages([]);
    setProperty(null);
    setCover(null);
    setPicks([]);
    setCaption("");
    setBusy("scraping");
    try {
      const r = await fetch("/api/post/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "scrape failed");

      const p: Property = data.property;
      setProperty(p);
      const detected = p.suggestedOffice ?? OFFICES[0];
      setCover({
        shortAddress: p.shortAddress,
        status: p.status ? p.status.toUpperCase() : "FOR SALE",
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        office: detected.label,
        phone: detected.phone,
        website: "www.langtownandcountry.com",
        epcRating: p.epcRating ?? "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function doRender() {
    if (!cover) return;
    if (picks.length === 0) {
      setError("Click photos to select them. The first one becomes the cover.");
      return;
    }
    setError(null);
    setBusy("rendering");
    try {
      const r = await fetch("/api/post/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cover: { ...cover, backgroundImageUrl: picks[0] ?? null },
          interiors: interiorPages,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "render failed");
      setRenderedPages(data.pages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function togglePick(imgUrl: string) {
    setPicks((prev) => {
      const idx = prev.indexOf(imgUrl);
      if (idx >= 0) {
        // Removing the cover is always fine.
        // Removing an interior image is only allowed if the result is even.
        if (idx > 0) {
          const newInteriorCount = prev.length - 1 - 1; // -1 for cover, -1 for this image
          if (newInteriorCount % 2 !== 0) return prev; // would leave an odd count — block
        }
        return prev.filter((u) => u !== imgUrl);
      }
      if (prev.length >= MAX_TOTAL_IMAGES) return prev;
      return [...prev, imgUrl];
    });
  }

  async function handleCaption() {
    if (!property || !cover) return;
    setError(null);
    setBusy("captioning");
    try {
      const r = await fetch("/api/post/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property: { ...property, epcRating: cover.epcRating || null },
          office: cover.office,
          phone: cover.phone,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "caption failed");
      setCaption(data.caption);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function copyCaption() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function downloadAll() {
    if (renderedPages.length === 0) return;
    const folderName = (cover?.shortAddress || "post")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    const zip = new JSZip();
    const folder = zip.folder(folderName)!;
    renderedPages.forEach((dataUrl, i) => {
      const base64 = dataUrl.split(",", 2)[1];
      folder.file(`page-${i + 1}.png`, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Property Post</h1>
          <p className="mt-1 text-slate-600">
            Paste a Lang property URL → first photo you click becomes the
            cover, the rest fill the inside pages.
          </p>
        </div>
        <span className="text-xs text-slate-400">v1.0.3</span>
        <a
          href="/"
          className="text-sm text-slate-500 underline hover:text-slate-900"
        >
          ← Sendible flow
        </a>
      </header>

      <form onSubmit={handleGenerate} className="mb-6 flex gap-2">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.langtownandcountry.com/property/..."
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          disabled={busy !== ""}
        />
        <button
          type="submit"
          disabled={busy !== ""}
          className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy === "scraping" ? "Loading…" : "Load listing"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      {property && cover && (
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          {/* LEFT: cover edit panel */}
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Cover details</h2>
            <div className="grid gap-3">
              <Field label="Short address">
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={cover.shortAddress}
                  onChange={(e) =>
                    setCover({ ...cover, shortAddress: e.target.value })
                  }
                />
              </Field>
              <Field label="Status">
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={cover.status}
                  onChange={(e) => setCover({ ...cover, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bedrooms">
                  <input
                    type="number"
                    className="w-full rounded border border-slate-300 px-2 py-1"
                    value={cover.bedrooms ?? ""}
                    onChange={(e) =>
                      setCover({
                        ...cover,
                        bedrooms: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </Field>
                <Field label="Bathrooms">
                  <input
                    type="number"
                    className="w-full rounded border border-slate-300 px-2 py-1"
                    value={cover.bathrooms ?? ""}
                    onChange={(e) =>
                      setCover({
                        ...cover,
                        bathrooms: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="Office">
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={cover.office}
                  onChange={(e) => {
                    const o = OFFICES.find((x) => x.label === e.target.value);
                    setCover({
                      ...cover,
                      office: e.target.value,
                      phone: o?.phone || cover.phone,
                    });
                  }}
                >
                  {OFFICES.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Phone">
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={cover.phone}
                  onChange={(e) => setCover({ ...cover, phone: e.target.value })}
                />
              </Field>
              <Field label="Website">
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={cover.website}
                  onChange={(e) =>
                    setCover({ ...cover, website: e.target.value })
                  }
                />
              </Field>
              <Field label="EPC rating (used in caption)">
                <input
                  maxLength={4}
                  placeholder="e.g. B"
                  className="w-full rounded border border-slate-300 px-2 py-1 uppercase"
                  value={cover.epcRating}
                  onChange={(e) =>
                    setCover({
                      ...cover,
                      epcRating: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
            </div>

            <div className="mt-5 rounded bg-slate-50 p-3 text-sm">
              <div className="mb-1 text-xs text-slate-500">
                Selection summary
              </div>
              <div>
                <strong>{picks.length}</strong>{" "}
                {picks.length === 1 ? "image" : "images"} selected →{" "}
                <strong>{totalPages}</strong>-page post
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {picks.length === 0
                  ? "Click photos on the right. First one is the cover."
                  : `Cover + ${interiorPages.length} inside ${
                      interiorPages.length === 1 ? "page" : "pages"
                    }. Photos crop to keep the LTC watermark visible.`}
              </div>
            </div>

            {oddInterior && (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Select <strong>1 more photo</strong> to complete the pair — each inside slide needs 2 images.
              </div>
            )}

            <button
              onClick={doRender}
              disabled={busy !== "" || picks.length === 0 || oddInterior}
              className="mt-5 w-full rounded bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              {busy === "rendering"
                ? "Rendering…"
                : `Render ${totalPages} ${totalPages === 1 ? "page" : "pages"}`}
            </button>
            {renderedPages.length > 0 && (
              <button
                onClick={downloadAll}
                className="mt-2 w-full rounded border border-slate-900 px-4 py-3 font-medium text-slate-900"
              >
                Download zip ({renderedPages.length} PNGs)
              </button>
            )}
          </section>

          {/* RIGHT: image grid + preview */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-4">
              <h2 className="font-semibold">
                Photos from listing ({allImages.length})
              </h2>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Size
                <input
                  type="range"
                  min={100}
                  max={360}
                  step={10}
                  value={thumbSize}
                  onChange={(e) => setThumbSize(Number(e.target.value))}
                  className="w-32 accent-slate-700"
                />
              </label>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              <strong>Click a photo</strong> to add/remove it from the post.
              The first one becomes the cover background. Interior photos are
              always in pairs (2 per slide). Up to {MAX_TOTAL_IMAGES} photos
              total.
            </p>

            <div
              className="mb-6 grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`,
              }}
            >
              {allImages.map((u) => {
                const idx = picks.indexOf(u);
                const selected = idx >= 0;
                const isCover = idx === 0;
                const orderLabel = isCover ? "COVER" : idx > 0 ? String(idx) : null;
                return (
                  <button
                    type="button"
                    key={u}
                    onClick={() => togglePick(u)}
                    className={`relative block w-full overflow-hidden rounded-md border-2 transition ${
                      selected
                        ? isCover
                          ? "border-amber-500 ring-2 ring-amber-200"
                          : "border-blue-500 ring-2 ring-blue-200"
                        : "border-transparent hover:border-slate-300"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                    />
                    {orderLabel && (
                      <span
                        className={`absolute left-1 top-1 flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold text-white shadow ${
                          isCover ? "bg-amber-500" : "bg-blue-600"
                        }`}
                      >
                        {orderLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <h2 className="mb-3 font-semibold">Preview</h2>
            {renderedPages.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {renderedPages.map((src, pageIdx) => (
                  <div
                    key={pageIdx}
                    className="overflow-hidden rounded border border-slate-200 bg-white"
                  >
                    <div className="bg-slate-50 px-2 py-1 text-xs text-slate-500">
                      Page {pageIdx + 1}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Page ${pageIdx + 1}`}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Pick photos above and click <strong>Render</strong>.
              </div>
            )}
          </section>
        </div>
      )}

      {property && cover && (
        <section className="mt-8 rounded border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Caption</h2>
              <p className="text-xs text-slate-500">
                Long-form post for Facebook / Instagram / LinkedIn. Uses
                Claude — costs roughly £0.01 per generation.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCaption}
                disabled={busy !== ""}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "captioning"
                  ? "Generating…"
                  : caption
                    ? "Regenerate"
                    : "Generate caption"}
              </button>
              {caption && (
                <button
                  onClick={copyCaption}
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
          </div>
          {caption ? (
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="h-96 w-full rounded border border-slate-300 p-3 font-mono text-sm leading-relaxed"
            />
          ) : (
            <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Click <strong>Generate caption</strong> to draft a post using
              the property details. You can edit before copying.
            </div>
          )}
          {!cover.epcRating && (
            <p className="mt-2 text-xs text-amber-700">
              Heads up: no EPC rating set — caption will omit that line. Add
              one in the cover panel above if you want it included.
            </p>
          )}
        </section>
      )}

    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
