import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PROCESS_TEMPLATE_PREVIEWS,
  normalizeProcessTemplates,
  type ProcessTemplatePreview,
} from "@/lib/production/process-templates";

const STORE_PATH = path.join(process.cwd(), "reference", "tuesday", "process-templates.json");

async function readTemplates(): Promise<{ templates: ProcessTemplatePreview[]; source: "file" | "defaults"; updatedAt: string | null }> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as { templates?: unknown; updatedAt?: unknown };
    return {
      templates: normalizeProcessTemplates(parsed.templates),
      source: "file",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
    if (code !== "ENOENT") throw err;
    return { templates: DEFAULT_PROCESS_TEMPLATE_PREVIEWS, source: "defaults", updatedAt: null };
  }
}

export async function GET() {
  try {
    return NextResponse.json(await readTemplates());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Process templates unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { templates?: unknown; resetToDefaults?: unknown } | null;
  try {
    const templates = body?.resetToDefaults ? DEFAULT_PROCESS_TEMPLATE_PREVIEWS : normalizeProcessTemplates(body?.templates);
    const payload = { updatedAt: new Date().toISOString(), templates };
    await mkdir(path.dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return NextResponse.json({ templates, source: "file", updatedAt: payload.updatedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Process templates save failed" }, { status: 500 });
  }
}
