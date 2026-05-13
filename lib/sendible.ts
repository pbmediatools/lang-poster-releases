import type { DraftResult } from "./types";

// Sendible's REST API is documented at:
//   https://app.sendible.com/api/docs (account-gated)
// Endpoint shapes below are the conventional ones; if your account uses
// different paths/fields, adjust here in one place.

const BASE = process.env.SENDIBLE_API_BASE || "https://api.sendible.com/v1";

function authHeaders(): Record<string, string> {
  const key = process.env.SENDIBLE_API_KEY;
  const user = process.env.SENDIBLE_USERNAME;
  if (!key) throw new Error("SENDIBLE_API_KEY not set");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    ...(user ? { "X-Sendible-User": user } : {}),
  };
}

interface CreateDraftInput {
  longCaption: string;
  xCaption: string;
  imageUrls: string[]; // direct URLs Sendible will fetch & attach
}

export async function createDraft(input: CreateDraftInput): Promise<DraftResult> {
  const profileIds = (process.env.SENDIBLE_PROFILE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (profileIds.length === 0) {
    throw new Error("SENDIBLE_PROFILE_IDS not set (comma-separated)");
  }

  const hashtags = process.env.DEFAULT_HASHTAGS || "";
  const longWithTags = hashtags
    ? `${input.longCaption}\n\n${hashtags}`
    : input.longCaption;

  // Sendible's compose endpoint: POST /v1/posts (draft mode).
  // Most accounts accept a single payload that targets multiple services
  // and per-service overrides (e.g. shorter text for X).
  const body = {
    status: "draft",
    text: longWithTags,
    profile_ids: profileIds,
    media_urls: input.imageUrls,
    service_overrides: {
      twitter: { text: input.xCaption },
      x: { text: input.xCaption },
    },
  };

  const r = await fetch(`${BASE}/posts`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errText = await r.text();
    return {
      draftId: "",
      status: "error",
      message: `Sendible ${r.status}: ${errText}`,
    };
  }

  const data = await r.json();
  return {
    draftId: String(data.id ?? data.post_id ?? ""),
    url: data.url ?? data.web_url,
    status: "draft",
  };
}

export async function listProfiles(): Promise<unknown> {
  // Helper for setting up SENDIBLE_PROFILE_IDS — call from a one-off script.
  const r = await fetch(`${BASE}/services`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`Services list failed: ${r.status}`);
  return r.json();
}
