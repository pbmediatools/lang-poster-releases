"use client";

import { useEffect, useState } from "react";

interface Profile {
  id: string | number;
  name: string;
  type: string;
  raw: Record<string, unknown>;
}

export default function SetupPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rawJson, setRawJson] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/sendible/profiles")
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setRawJson(body.data);
        setProfiles(extractProfiles(body.data));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  const csv = Array.from(picked).join(",");

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Sendible setup</h1>
        <p className="mt-1 text-slate-600">
          Pick the 4 profiles you want every post to go to. Copy the
          comma-separated string at the bottom into{" "}
          <code className="rounded bg-slate-100 px-1">SENDIBLE_PROFILE_IDS</code>{" "}
          in your <code className="rounded bg-slate-100 px-1">.env.local</code>,
          then restart the dev server.
        </p>
      </header>

      {loading && <p className="text-slate-500">Loading profiles…</p>}

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Couldn&apos;t fetch profiles.</p>
          <p className="mt-1 text-sm">{error}</p>
          <p className="mt-2 text-sm">
            Most common cause: <code>SENDIBLE_API_KEY</code> /{" "}
            <code>SENDIBLE_USERNAME</code> not set in{" "}
            <code>.env.local</code>, or the endpoint shape differs for your
            account. Check <code>lib/sendible.ts</code>.
          </p>
        </div>
      )}

      {profiles.length > 0 && (
        <>
          <table className="mb-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th className="p-2"></th>
                <th className="p-2">Name</th>
                <th className="p-2">Type</th>
                <th className="p-2">ID</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const id = String(p.id);
                return (
                  <tr key={id} className="border-b border-slate-200">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={picked.has(id)}
                        onChange={() => toggle(id)}
                      />
                    </td>
                    <td className="p-2">{p.name || <em>(no name)</em>}</td>
                    <td className="p-2 text-slate-600">{p.type}</td>
                    <td className="p-2 font-mono">{id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="rounded border border-slate-300 bg-slate-50 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-700">
              Paste this into .env.local:
            </div>
            <code className="block break-all rounded bg-white p-3 font-mono text-sm">
              SENDIBLE_PROFILE_IDS={csv || "(pick some profiles above)"}
            </code>
            {csv && (
              <button
                onClick={() => navigator.clipboard.writeText(csv)}
                className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                Copy IDs
              </button>
            )}
          </div>
        </>
      )}

      {!loading && rawJson != null && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-slate-500">
            Raw API response (for debugging)
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(rawJson, null, 2)}
          </pre>
        </details>
      )}
    </main>
  );
}

// Sendible's services response shape isn't perfectly stable across accounts.
// Try a few likely envelopes, then look for id+name-ish fields on each item.
function extractProfiles(data: unknown): Profile[] {
  const arr = findArray(data);
  if (!arr) return [];
  return arr
    .map((item): Profile | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const id = o.id ?? o.service_id ?? o.profile_id;
      if (id == null) return null;
      const name =
        (o.name as string) ??
        (o.username as string) ??
        (o.display_name as string) ??
        (o.title as string) ??
        "";
      const type =
        (o.service as string) ??
        (o.service_name as string) ??
        (o.type as string) ??
        (o.network as string) ??
        "";
      return { id: id as string | number, name, type, raw: o };
    })
    .filter((x): x is Profile => x != null);
}

function findArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}
