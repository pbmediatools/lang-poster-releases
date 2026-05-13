# Lang Property Poster

A small web app that automates the per-property posting workflow:

1. Paste a property URL from `langtownandcountry.com`.
2. App scrapes the listing (price, address, features, photos).
3. Claude generates a long-form caption + sub-280-char X version.
4. Canva Connect API autofills the brand cover template and exports a PNG.
5. App pushes everything to **Sendible as a draft** for human approval.

Built as a **Next.js app** so the same codebase runs on a team-member's
desktop (`npm run dev` → `localhost:3030`) and as a hosted SaaS (deploy to
Vercel — same code).

---

## Quick start

```bash
cd ~/Desktop/lang-property-poster
npm install
cp .env.example .env.local
# fill in the keys (see "Setup" below)
npm run dev
# open http://localhost:3030
```

---

## Setup — required keys

Copy `.env.example` to `.env.local` and populate:

### 1. Anthropic
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com/

### 2. Sendible
The Sendible REST API isn't fully publicly documented and may need to be
enabled on your plan. Get your API key from
**Settings → API Access** in the Sendible app.

- `SENDIBLE_API_KEY`
- `SENDIBLE_USERNAME` (your Sendible login)
- `SENDIBLE_PROFILE_IDS` — comma-separated list of the four service IDs
  (Facebook page, Instagram, LinkedIn page, X). Find them via
  `GET /v1/services` (see `lib/sendible.ts → listProfiles()`).

> **If the Sendible draft call fails**, the most likely cause is that the
> request shape needs tweaking for your account. Edit `lib/sendible.ts`
> in one place — the route, body keys, and per-service overrides are all
> there.

### 3. Canva Connect (Canva **Enterprise** required)

Canva Connect is gated to Enterprise organisations. If your account isn't
Enterprise, the Canva step will fail and you'll need to either:

- Upgrade to Canva Enterprise, **or**
- Replace `lib/canva.ts` with a Pillow / `node-canvas` server-side
  template renderer (faster, no Canva at all).

If you do have Enterprise:

1. Register an integration at https://www.canva.com/developers/
2. Run the OAuth flow to get an access token + refresh token.
3. In Canva, open the "Lang To Let 2025" cover slide → install the
   **Data Autofill** app → mark the editable fields:
   - `address` (text)
   - `status` (text — "TO LET" / "FOR SALE")
   - `bedrooms` (text — e.g. "x3")
   - `bathrooms` (text — e.g. "x1")
   - `phone` (text)
   - `hero_image` (image)
4. Copy the brand template ID into `CANVA_BRAND_TEMPLATE_ID`.

If your template uses different field names, update the `data` map in
`lib/canva.ts`.

---

## Deploying as SaaS

Same code; just push to Vercel:

```bash
npx vercel
```

Add the same env vars in the Vercel dashboard. Each user/team gets the
same UI; multi-tenancy (per-user keys / Sendible accounts) would need a
small auth layer on top — wired in `app/api/*` routes.

---

## File map

```
app/
  page.tsx                  → main UI: URL → preview → push
  api/
    scrape/route.ts         → POST {url}      → property JSON
    caption/route.ts        → POST {property} → captions JSON
    canva/route.ts          → POST {property} → cover PNG URL
    sendible/route.ts       → POST {captions, images} → draft id
lib/
  scraper.ts                → cheerio scrape of langtownandcountry.com
  captions.ts               → Claude call (Opus 4.7, prompt-cached)
  canva.ts                  → upload asset → autofill → export PNG
  sendible.ts               → POST /v1/posts as draft
  types.ts
```

---

## Known gaps / next steps

- **ChatGPT prompt parity** — the `SYSTEM_PROMPT` in `lib/captions.ts`
  was reverse-engineered from the recorded sample output. When you
  share the actual ChatGPT custom prompt, paste it in to match style
  exactly. The output JSON contract should stay the same.
- **Sendible scheduling** — currently posts as a draft only. To
  schedule a specific time, add `scheduled_at` (ISO 8601) to the
  request body in `lib/sendible.ts`.
- **Multiple images** — the app pushes the Canva cover + the first 3
  property photos. Adjust the slice in `app/page.tsx → handlePush`.
- **Error recovery** — current error handling is "show the message,
  let the user retry from scratch". A future iteration could persist
  intermediate state so a Canva failure doesn't lose the captions.
