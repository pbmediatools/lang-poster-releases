"use client";

import { useState } from "react";
import type { Property, Captions, CoverImage, DraftResult } from "@/lib/types";

type Stage = "idle" | "scrape" | "caption" | "canva" | "send" | "done";

export default function Home() {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [captions, setCaptions] = useState<Captions | null>(null);
  const [cover, setCover] = useState<CoverImage | null>(null);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [longEdit, setLongEdit] = useState("");
  const [xEdit, setXEdit] = useState("");

  async function callApi<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `${path} failed`);
    return data;
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setProperty(null);
    setCaptions(null);
    setCover(null);
    setDraft(null);
    try {
      setStage("scrape");
      const { property: p } = await callApi<{ property: Property }>(
        "/api/scrape",
        { url },
      );
      setProperty(p);

      setStage("caption");
      const { captions: c } = await callApi<{ captions: Captions }>(
        "/api/caption",
        { property: p },
      );
      setCaptions(c);
      setLongEdit(c.longForm);
      setXEdit(c.xVersion);

      setStage("canva");
      const { cover: cv } = await callApi<{ cover: CoverImage }>(
        "/api/canva",
        { property: p },
      );
      setCover(cv);
      setStage("idle");
    } catch (e) {
      setError((e as Error).message);
      setStage("idle");
    }
  }

  async function handlePush() {
    if (!property || !cover) return;
    setError(null);
    setStage("send");
    try {
      const imageUrls = [cover.url, ...property.imageUrls.slice(0, 3)];
      const { result } = await callApi<{ result: DraftResult }>(
        "/api/sendible",
        { longCaption: longEdit, xCaption: xEdit, imageUrls },
      );
      setDraft(result);
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
      setStage("idle");
    }
  }

  const busy = stage !== "idle" && stage !== "done";

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Lang Property Poster
          </h1>
          <p className="mt-1 text-slate-600">
            Paste a property URL → get a Sendible draft for review.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <a
            href="/post"
            className="text-sm font-medium text-slate-900 underline"
          >
            5-page post flow →
          </a>
          <a
            href="/setup"
            className="text-sm text-slate-500 underline hover:text-slate-900"
          >
            Sendible setup →
          </a>
        </div>
      </header>

      <form onSubmit={handleStart} className="mb-6 flex gap-2">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.langtownandcountry.com/property/..."
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? stageLabel(stage) : "Generate"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      {property && (
        <section className="mb-6 rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Scraped property</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Address</dt>
            <dd>{property.address}</dd>
            <dt className="text-slate-500">Price</dt>
            <dd>{property.price}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd>{property.status}</dd>
            <dt className="text-slate-500">Beds / Baths / Recpt</dt>
            <dd>
              {property.bedrooms ?? "?"} / {property.bathrooms ?? "?"} /{" "}
              {property.receptionRooms ?? "?"}
            </dd>
            <dt className="text-slate-500">Postcode</dt>
            <dd>{property.postcode}</dd>
            <dt className="text-slate-500">Photos</dt>
            <dd>{property.imageUrls.length}</dd>
          </dl>
          {property.features.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-sm text-slate-500">Features</div>
              <ul className="list-disc pl-5 text-sm">
                {property.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {captions && (
        <section className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">
              Long caption (FB / IG / LinkedIn)
            </h2>
            <textarea
              className="h-72 w-full rounded border border-slate-300 p-2 font-mono text-sm"
              value={longEdit}
              onChange={(e) => setLongEdit(e.target.value)}
            />
          </div>
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">
              X / Twitter ({xEdit.length}/280)
            </h2>
            <textarea
              className="h-72 w-full rounded border border-slate-300 p-2 font-mono text-sm"
              value={xEdit}
              onChange={(e) => setXEdit(e.target.value)}
              maxLength={280}
            />
          </div>
        </section>
      )}

      {cover && (
        <section className="mb-6 rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Generated cover (from Canva)</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.url}
            alt="cover"
            className="max-h-96 rounded border border-slate-200"
          />
        </section>
      )}

      {property && cover && captions && !draft && (
        <button
          onClick={handlePush}
          disabled={busy}
          className="rounded bg-lang-accent px-6 py-3 font-medium text-white disabled:opacity-50"
        >
          {stage === "send" ? "Pushing…" : "Push to Sendible as draft"}
        </button>
      )}

      {draft && draft.status === "draft" && (
        <div className="rounded border border-green-300 bg-green-50 p-4 text-green-900">
          Draft created in Sendible. ID: {draft.draftId}
          {draft.url && (
            <>
              {" — "}
              <a className="underline" href={draft.url} target="_blank">
                open in Sendible
              </a>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function stageLabel(s: Stage): string {
  switch (s) {
    case "scrape":
      return "Scraping…";
    case "caption":
      return "Generating captions…";
    case "canva":
      return "Building cover…";
    case "send":
      return "Pushing draft…";
    default:
      return "Working…";
  }
}
