import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

function configPath(): string | null {
  const ud = process.env.USERDATA_PATH;
  if (!ud) return null;
  return path.join(ud, "config.json");
}

function loadConfig(): Record<string, string> {
  const cp = configPath();
  if (!cp) return {};
  try {
    return JSON.parse(fs.readFileSync(cp, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg: Record<string, string>) {
  const cp = configPath();
  if (!cp) return;
  fs.mkdirSync(path.dirname(cp), { recursive: true });
  fs.writeFileSync(cp, JSON.stringify(cfg, null, 2));
}

// GET — return whether a key is set (masked)
export async function GET() {
  const cfg = loadConfig();
  const key = cfg.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  return NextResponse.json({
    hasKey: !!key,
    maskedKey: key ? `${key.slice(0, 12)}${"•".repeat(20)}` : "",
  });
}

// POST — save a new key
export async function POST(req: Request) {
  const { apiKey } = await req.json();
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return NextResponse.json(
      { error: "Invalid key — must start with sk-ant-" },
      { status: 400 },
    );
  }
  const cfg = loadConfig();
  cfg.anthropicApiKey = apiKey.trim();
  saveConfig(cfg);

  // Update the live env var so caption calls work immediately without restart
  process.env.ANTHROPIC_API_KEY = apiKey.trim();

  return NextResponse.json({ ok: true });
}
