"use client";

import JSZip from "jszip";
import { useMemo, useState, useEffect } from "react";
import type { Property } from "@/lib/types";

const OFFICES = [
  { label: "Plymouth Office", phone: "01752 256000" },
  { label: "Waterside Office", phone: "01752 200909" },
  { label: "Plymstock Office", phone: "01752 456000" },
];

const STATUS_OPTIONS = ["FOR SALE", "TO LET", "LET AGREED", "SOLD"];

const MAX_TOTAL_IMAGES = 19;

type AppMode = "new-listing" | "sale-agreed" | "reduced";

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

interface SingleItem {
  url: string;
  property: Property;
  selectedImageUrl: string;
  shortAddress: string;
  office: string;
  phone: string;
  website: string;
  price: string;
}

export default function PostPage() {
  const [mode, setMode] = useState<AppMode>("new-listing");

  // ---- New Listing state ----
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<
    "" | "scraping" | "rendering" | "captioning" | "scraping-multi" | "rendering-multi"
  >("");
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [cover, setCover] = useState<CoverEdit | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [renderedPages, setRenderedPages] = useState<string[]>([]);
  const [captions, setCaptions] = useState<{ longForm: string; xCaption: string } | null>(null);
  const [captionTab, setCaptionTab] = useState<"social" | "x">("social");
  const [copied, setCopied] = useState(false);
  const [thumbSize, setThumbSize] = useState(180);

  // ---- Sale Agreed / Reduced state ----
  const [singleRawUrls, setSingleRawUrls] = useState("");
  const [singleItems, setSingleItems] = useState<SingleItem[]>([]);
  const [singleRendered, setSingleRendered] = useState<string[]>([]);
  const [singleScrapeProgress, setSingleScrapeProgress] = useState<{ done: number; total: number } | null>(null);

  // ---- Settings / updates ----
  const [showSettings, setShowSettings] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "uptodate" | "available" | "downloaded" | "error"
  >("idle");
  const [updateInfo, setUpdateInfo] = useState<{ version?: string; message?: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setMaskedKey(d.maskedKey || ""))
      .catch(() => {});
  }, []);

  function switchMode(m: AppMode) {
    setMode(m);
    setError(null);
  }

  async function saveApiKey() {
    setKeyStatus("saving");
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMaskedKey(`${newKey.slice(0, 12)}${"•".repeat(20)}`);
      setNewKey("");
      setKeyStatus("saved");
      setTimeout(() => setKeyStatus("idle"), 2000);
    } catch {
      setKeyStatus("error");
      setTimeout(() => setKeyStatus("idle"), 3000);
    }
  }

  async function checkForUpdates() {
    setUpdateStatus("checking");
    setUpdateInfo(null);
    try {
      const api = (
        window as unknown as {
          electronAPI?: {
            checkForUpdates: () => Promise<{
              status: string;
              version?: string;
              message?: string;
            }>;
          };
        }
      ).electronAPI;
      if (!api) {
        setUpdateStatus("idle");
        return;
      }
      const result = await api.checkForUpdates();
      setUpdateStatus(result.status as typeof updateStatus);
      setUpdateInfo({ version: result.version, message: result.message });
    } catch {
      setUpdateStatus("error");
      setUpdateInfo({ message: "Could not check for updates" });
    }
  }

  const isElectron =
    typeof window !== "undefined" &&
    !!(window as unknown as { electronAPI?: unknown }).electronAPI;

  // ---- New Listing logic ----
  const allImages = property?.imageUrls ?? [];

  const interiorPages = useMemo(() => {
    const interior = picks.slice(1);
    const pages: { topImageUrl: string; bottomImageUrl?: string }[] = [];
    for (let i = 0; i < interior.length; i += 2) {
      pages.push({ topImageUrl: interior[i], bottomImageUrl: interior[i + 1] });
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
    setCaptions(null);
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
    setRenderedPages([]);
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

      if (!r.ok || !r.body) {
        const text = await r.text();
        let msg = "render failed";
        try { msg = JSON.parse(text).error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const pages: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line) as { page?: string; error?: string };
          if (obj.error) throw new Error(obj.error);
          if (obj.page) {
            pages.push(obj.page);
            setRenderedPages([...pages]);
          }
        }
      }
      if (buffer.trim()) {
        const obj = JSON.parse(buffer) as { page?: string; error?: string };
        if (obj.error) throw new Error(obj.error);
        if (obj.page) {
          pages.push(obj.page);
          setRenderedPages([...pages]);
        }
      }
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
        if (idx > 0) {
          const newInteriorCount = prev.length - 1 - 1;
          if (newInteriorCount % 2 !== 0) return prev;
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
      setCaptions({ longForm: data.longForm, xCaption: data.xCaption });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function copyCaption() {
    if (!captions) return;
    const text = captionTab === "social" ? captions.longForm : captions.xCaption;
    try {
      await navigator.clipboard.writeText(text);
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

  // ---- Sale Agreed / Reduced logic ----
  async function handleScrapeSingle(e: React.FormEvent) {
    e.preventDefault();
    const urls = singleRawUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    setError(null);
    setSingleItems([]);
    setSingleRendered([]);
    setSingleScrapeProgress({ done: 0, total: urls.length });
    setBusy("scraping-multi");
    try {
      const results: SingleItem[] = [];
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        const r = await fetch("/api/post/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: u }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(`${u}: ${data.error || "scrape failed"}`);
        const p: Property = data.property;
        const det = p.suggestedOffice ?? OFFICES[0];
        results.push({
          url: u,
          property: p,
          selectedImageUrl: p.imageUrls[0] ?? "",
          shortAddress: p.shortAddress,
          office: det.label,
          phone: det.phone,
          website: "www.langtownandcountry.com",
          price: p.price,
        });
        setSingleScrapeProgress({ done: i + 1, total: urls.length });
      }
      setSingleItems(results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      setSingleScrapeProgress(null);
    }
  }

  async function handleRenderSingle() {
    if (singleItems.length === 0) return;
    setError(null);
    setSingleRendered(new Array(singleItems.length).fill(""));
    setBusy("rendering-multi");
    try {
      const items = singleItems.map((item) => ({
        type: mode,
        data:
          mode === "sale-agreed"
            ? {
                shortAddress: item.shortAddress,
                office: item.office,
                phone: item.phone,
                website: item.website,
                backgroundImageUrl: item.selectedImageUrl,
              }
            : {
                shortAddress: item.shortAddress,
                price: item.price,
                backgroundImageUrl: item.selectedImageUrl,
              },
      }));

      const r = await fetch("/api/post/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!r.ok || !r.body) {
        const text = await r.text();
        let msg = "render failed";
        try { msg = JSON.parse(text).error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const pages: string[] = new Array(singleItems.length).fill("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line) as { index?: number; page?: string; error?: string };
          if (obj.error) throw new Error(obj.error);
          if (typeof obj.index === "number" && obj.page) {
            pages[obj.index] = obj.page;
            setSingleRendered([...pages]);
          }
        }
      }
      if (buffer.trim()) {
        const obj = JSON.parse(buffer) as { index?: number; page?: string; error?: string };
        if (obj.error) throw new Error(obj.error);
        if (typeof obj.index === "number" && obj.page) {
          pages[obj.index] = obj.page;
          setSingleRendered([...pages]);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function downloadSingleZip() {
    const hasAny = singleRendered.some(Boolean);
    if (!hasAny) return;
    const label = mode === "sale-agreed" ? "sale-agreed" : "reduced";
    const zip = new JSZip();
    const folder = zip.folder(label)!;
    singleItems.forEach((item, i) => {
      if (singleRendered[i]) {
        const base64 = singleRendered[i].split(",", 2)[1];
        const slug = item.shortAddress
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase();
        folder.file(`${i + 1}-${slug}.png`, base64, { base64: true });
      }
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${label}-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  const anyBusy = busy !== "";
  const singleRenderedCount = singleRendered.filter(Boolean).length;

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lang Property Poster</h1>
          <p className="mt-1 text-slate-600">
            Create polished property social media images in seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">Settings</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Anthropic API Key
              </label>
              {maskedKey && (
                <p className="mb-2 font-mono text-sm text-slate-500">{maskedKey}</p>
              )}
              <input
                type="password"
                placeholder="sk-ant-..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
            {keyStatus === "error" && (
              <p className="mb-3 text-sm text-red-600">Invalid key — must start with sk-ant-</p>
            )}
            {keyStatus === "saved" && (
              <p className="mb-3 text-sm text-green-600">✓ Key saved successfully</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveApiKey}
                disabled={!newKey || keyStatus === "saving"}
                className="flex-1 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {keyStatus === "saving" ? "Saving…" : "Save key"}
              </button>
            </div>

            {isElectron && (
              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="mb-2 text-sm font-medium text-slate-700">Updates</div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={checkForUpdates}
                    disabled={updateStatus === "checking"}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {updateStatus === "checking" ? "Checking…" : "Check for updates"}
                  </button>
                  {updateStatus === "uptodate" && (
                    <span className="text-sm text-green-700">✓ You&apos;re on the latest version</span>
                  )}
                  {updateStatus === "available" && (
                    <span className="text-sm text-blue-700">
                      v{updateInfo?.version} found — downloading in background
                    </span>
                  )}
                  {updateStatus === "downloaded" && (
                    <span className="text-sm text-green-700">
                      ✓ v{updateInfo?.version} ready — will install on next relaunch
                    </span>
                  )}
                  {updateStatus === "error" && (
                    <span className="text-sm text-red-600">
                      {updateInfo?.message || "Could not check for updates"}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  setShowSettings(false);
                  setNewKey("");
                  setKeyStatus("idle");
                  setUpdateStatus("idle");
                }}
                className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode selector */}
      <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
        {(["new-listing", "sale-agreed", "reduced"] as AppMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            disabled={anyBusy}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              mode === m
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m === "new-listing" ? "New Listing" : m === "sale-agreed" ? "Sale Agreed" : "Reduced"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      {/* ===== NEW LISTING ===== */}
      {mode === "new-listing" && (
        <>
          <form onSubmit={handleGenerate} className="mb-6 flex gap-2">
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.langtownandcountry.com/property/..."
              className="flex-1 rounded border border-slate-300 px-3 py-2"
              disabled={anyBusy}
            />
            <button
              type="submit"
              disabled={anyBusy}
              className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {busy === "scraping" ? "Loading…" : "Load listing"}
            </button>
          </form>

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
                      onChange={(e) => setCover({ ...cover, shortAddress: e.target.value })}
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      className="w-full rounded border border-slate-300 px-2 py-1"
                      value={cover.status}
                      onChange={(e) => setCover({ ...cover, status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
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
                          setCover({ ...cover, bedrooms: e.target.value ? Number(e.target.value) : null })
                        }
                      />
                    </Field>
                    <Field label="Bathrooms">
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 px-2 py-1"
                        value={cover.bathrooms ?? ""}
                        onChange={(e) =>
                          setCover({ ...cover, bathrooms: e.target.value ? Number(e.target.value) : null })
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
                        setCover({ ...cover, office: e.target.value, phone: o?.phone || cover.phone });
                      }}
                    >
                      {OFFICES.map((o) => (
                        <option key={o.label} value={o.label}>{o.label}</option>
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
                      onChange={(e) => setCover({ ...cover, website: e.target.value })}
                    />
                  </Field>
                  <Field label="EPC rating (used in caption)">
                    <input
                      maxLength={4}
                      placeholder="e.g. B"
                      className="w-full rounded border border-slate-300 px-2 py-1 uppercase"
                      value={cover.epcRating}
                      onChange={(e) =>
                        setCover({ ...cover, epcRating: e.target.value.toUpperCase() })
                      }
                    />
                  </Field>
                </div>

                <div className="mt-5 rounded bg-slate-50 p-3 text-sm">
                  <div className="mb-1 text-xs text-slate-500">Selection summary</div>
                  <div>
                    <strong>{picks.length}</strong>{" "}
                    {picks.length === 1 ? "image" : "images"} selected →{" "}
                    <strong>{totalPages}</strong>-page post
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {picks.length === 0
                      ? "Click photos on the right. First one is the cover."
                      : `Cover + ${interiorPages.length} inside ${interiorPages.length === 1 ? "page" : "pages"}. Photos crop to keep the LTC watermark visible.`}
                  </div>
                </div>

                {oddInterior && (
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                    Select <strong>1 more photo</strong> to complete the pair — each inside slide needs 2 images.
                  </div>
                )}

                <button
                  onClick={doRender}
                  disabled={anyBusy || picks.length === 0 || oddInterior}
                  className="mt-5 w-full rounded bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-40"
                >
                  {busy === "rendering"
                    ? renderedPages.length > 0
                      ? `Rendering… (${renderedPages.length}/${totalPages})`
                      : "Rendering…"
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
                  <h2 className="font-semibold">Photos from listing ({allImages.length})</h2>
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
                  <strong>Click a photo</strong> to add/remove it from the post. The first one becomes the cover
                  background. Interior photos are always in pairs (2 per slide). Up to {MAX_TOTAL_IMAGES} photos total.
                </p>

                <div
                  className="mb-6 grid gap-3"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}
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
                        <img src={u} alt="" className="aspect-[4/3] w-full object-cover" />
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
                        <img src={src} alt={`Page ${pageIdx + 1}`} className="w-full" />
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
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Captions</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleCaption}
                    disabled={anyBusy}
                    className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy === "captioning" ? "Generating…" : captions ? "Regenerate" : "Generate captions"}
                  </button>
                  {captions && (
                    <button
                      onClick={copyCaption}
                      className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-3 flex border-b border-slate-200">
                <button
                  onClick={() => setCaptionTab("social")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    captionTab === "social"
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Facebook / Instagram / LinkedIn
                </button>
                <button
                  onClick={() => setCaptionTab("x")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    captionTab === "x"
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  X (Twitter)
                </button>
              </div>

              {captions ? (
                <>
                  {captionTab === "social" && (
                    <textarea
                      value={captions.longForm}
                      onChange={(e) => setCaptions({ ...captions, longForm: e.target.value })}
                      className="h-96 w-full rounded border border-slate-300 p-3 font-mono text-sm leading-relaxed"
                    />
                  )}
                  {captionTab === "x" && (
                    <div>
                      <textarea
                        value={captions.xCaption}
                        onChange={(e) => setCaptions({ ...captions, xCaption: e.target.value })}
                        className="h-32 w-full rounded border border-slate-300 p-3 font-mono text-sm leading-relaxed"
                        maxLength={280}
                      />
                      <div
                        className={`mt-1 text-right text-xs ${
                          captions.xCaption.length > 280
                            ? "text-red-600 font-semibold"
                            : captions.xCaption.length > 260
                              ? "text-amber-600"
                              : "text-slate-400"
                        }`}
                      >
                        {captions.xCaption.length} / 280 characters
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Click <strong>Generate captions</strong> to draft posts for all platforms. You can edit before copying.
                </div>
              )}

              {!cover.epcRating && (
                <p className="mt-2 text-xs text-amber-700">
                  Heads up: no EPC rating set — caption will omit that line. Add one in the cover panel above if you
                  want it included.
                </p>
              )}
            </section>
          )}
        </>
      )}

      {/* ===== SALE AGREED / REDUCED ===== */}
      {(mode === "sale-agreed" || mode === "reduced") && (
        <>
          <div className="mb-2 text-sm text-slate-600">
            {mode === "sale-agreed"
              ? "Paste one property URL per line. Each produces a single Sale Agreed poster."
              : "Paste one property URL per line. Each produces a single Reduced poster."}
          </div>
          <form onSubmit={handleScrapeSingle} className="mb-6">
            <textarea
              required
              value={singleRawUrls}
              onChange={(e) => setSingleRawUrls(e.target.value)}
              rows={4}
              placeholder={"https://www.langtownandcountry.com/property/...\nhttps://www.langtownandcountry.com/property/..."}
              className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
              disabled={anyBusy}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={anyBusy || !singleRawUrls.trim()}
                className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                {busy === "scraping-multi"
                  ? singleScrapeProgress
                    ? `Loading… (${singleScrapeProgress.done}/${singleScrapeProgress.total})`
                    : "Loading…"
                  : "Load listings"}
              </button>
              {singleItems.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleRenderSingle}
                    disabled={anyBusy}
                    className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
                  >
                    {busy === "rendering-multi"
                      ? `Rendering… (${singleRenderedCount}/${singleItems.length})`
                      : `Render ${singleItems.length} ${singleItems.length === 1 ? "poster" : "posters"}`}
                  </button>
                  {singleRenderedCount > 0 && (
                    <button
                      type="button"
                      onClick={downloadSingleZip}
                      className="rounded border border-slate-900 px-4 py-2 font-medium text-slate-900"
                    >
                      Download zip ({singleRenderedCount} PNGs)
                    </button>
                  )}
                </>
              )}
            </div>
          </form>

          {singleItems.length > 0 && (
            <div className="grid gap-4">
              {singleItems.map((item, i) => (
                <div key={item.url} className="rounded border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="font-medium">{item.shortAddress}</span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                    <div className="grid gap-3">
                      <Field label="Address">
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1"
                          value={item.shortAddress}
                          onChange={(e) => {
                            const updated = [...singleItems];
                            updated[i] = { ...item, shortAddress: e.target.value };
                            setSingleItems(updated);
                          }}
                        />
                      </Field>

                      {mode === "sale-agreed" && (
                        <>
                          <Field label="Office">
                            <select
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={item.office}
                              onChange={(e) => {
                                const o = OFFICES.find((x) => x.label === e.target.value);
                                const updated = [...singleItems];
                                updated[i] = { ...item, office: e.target.value, phone: o?.phone || item.phone };
                                setSingleItems(updated);
                              }}
                            >
                              {OFFICES.map((o) => (
                                <option key={o.label} value={o.label}>{o.label}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Phone">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={item.phone}
                              onChange={(e) => {
                                const updated = [...singleItems];
                                updated[i] = { ...item, phone: e.target.value };
                                setSingleItems(updated);
                              }}
                            />
                          </Field>
                          <Field label="Website">
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1"
                              value={item.website}
                              onChange={(e) => {
                                const updated = [...singleItems];
                                updated[i] = { ...item, website: e.target.value };
                                setSingleItems(updated);
                              }}
                            />
                          </Field>
                        </>
                      )}

                      {mode === "reduced" && (
                        <Field label="Price">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1"
                            value={item.price}
                            onChange={(e) => {
                              const updated = [...singleItems];
                              updated[i] = { ...item, price: e.target.value };
                              setSingleItems(updated);
                            }}
                          />
                        </Field>
                      )}

                      {/* Image picker */}
                      <div>
                        <div className="mb-1 block text-xs font-medium text-slate-600">
                          Background image (click to select)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.property.imageUrls.map((imgUrl) => {
                            const selected = item.selectedImageUrl === imgUrl;
                            return (
                              <button
                                type="button"
                                key={imgUrl}
                                onClick={() => {
                                  const updated = [...singleItems];
                                  updated[i] = { ...item, selectedImageUrl: imgUrl };
                                  setSingleItems(updated);
                                }}
                                className={`relative h-16 w-24 flex-none overflow-hidden rounded border-2 transition ${
                                  selected
                                    ? "border-amber-500 ring-2 ring-amber-200"
                                    : "border-transparent hover:border-slate-300"
                                }`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imgUrl} alt="" className="h-full w-full object-cover" />
                                {selected && (
                                  <span className="absolute inset-0 flex items-center justify-center bg-amber-500/30 text-xs font-bold text-white">
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="flex flex-col items-center justify-start">
                      {singleRendered[i] ? (
                        <div className="overflow-hidden rounded border border-slate-200 w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={singleRendered[i]} alt={`Poster ${i + 1}`} className="w-full" />
                        </div>
                      ) : busy === "rendering-multi" ? (
                        <div className="flex h-32 w-full items-center justify-center rounded border border-dashed border-slate-300 text-sm text-slate-400">
                          Rendering…
                        </div>
                      ) : (
                        <div className="flex h-32 w-full items-center justify-center rounded border border-dashed border-slate-300 text-sm text-slate-400">
                          Preview here
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
