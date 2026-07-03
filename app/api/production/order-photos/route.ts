import { del, list, put } from "@vercel/blob";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LOCAL_PHOTO_ROOT = path.join(process.cwd(), "data", "tuesday-order-photos");

function cleanOrderId(value: string | null) {
  return value && /^\d+$/.test(value) ? value : null;
}

function cleanFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90) || "photo";
}

function isMissingBlobToken(err: unknown) {
  return err instanceof Error && err.message.includes("No token found");
}

function localPhotoDir(orderId: string) {
  return path.join(LOCAL_PHOTO_ROOT, orderId);
}

function localPhotoPath(orderId: string, pathname: string) {
  if (!pathname.startsWith(`production-order-photos/${orderId}/`)) return null;
  const filename = path.basename(pathname);
  if (!filename || filename === "." || filename === "..") return null;
  return path.join(localPhotoDir(orderId), filename);
}

function contentTypeFor(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".heic") return "image/heic";
  return "image/jpeg";
}

async function listLocalPhotos(orderId: string, request: NextRequest) {
  const dir = localPhotoDir(orderId);
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  const photos = await Promise.all(entries.flatMap((entry) => entry.isFile() ? [entry.name] : []).map(async (filename) => {
    const filePath = path.join(dir, filename);
    const fileStat = await stat(filePath);
    const pathname = `production-order-photos/${orderId}/${filename}`;
    const url = new URL(request.url);
    url.search = "";
    url.searchParams.set("orderId", orderId);
    url.searchParams.set("pathname", pathname);
    return {
      url: url.toString(),
      pathname,
      uploadedAt: fileStat.mtime.toISOString(),
      size: fileStat.size,
    };
  }));
  return photos.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

async function writeLocalPhoto(orderId: string, file: File) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}-${cleanFilename(file.name)}`;
  const pathname = `production-order-photos/${orderId}/${filename}`;
  const dir = localPhotoDir(orderId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return {
    url: `/api/production/order-photos?orderId=${orderId}&pathname=${encodeURIComponent(pathname)}`,
    pathname,
    uploadedAt: new Date().toISOString(),
    size: file.size,
  };
}

export async function GET(request: NextRequest) {
  const orderId = cleanOrderId(request.nextUrl.searchParams.get("orderId"));
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  const pathname = request.nextUrl.searchParams.get("pathname");
  if (pathname) {
    const filePath = localPhotoPath(orderId, pathname);
    if (!filePath) return NextResponse.json({ error: "Invalid photo path" }, { status: 400 });
    try {
      const body = await readFile(filePath);
      return new NextResponse(body, {
        headers: {
          "Content-Type": contentTypeFor(filePath),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }
  }

  try {
    const prefix = `production-order-photos/${orderId}/`;
    const result = await list({ prefix });
    return NextResponse.json({
      photos: result.blobs.map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt,
        size: blob.size,
      })),
    });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({
        photos: await listLocalPhotos(orderId, request),
        localFallback: true,
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Photo store unavailable" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const orderId = cleanOrderId(String(formData.get("orderId") || ""));
  const file = formData.get("file");
  if (!orderId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing orderId or file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
  }

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pathname = `production-order-photos/${orderId}/${stamp}-${cleanFilename(file.name)}`;
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
    return NextResponse.json({
      photo: {
        url: blob.url,
        pathname: blob.pathname,
        uploadedAt: new Date().toISOString(),
        size: file.size,
      },
    });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ photo: await writeLocalPhoto(orderId, file), localFallback: true });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Photo upload failed" },
      { status: 500 }
    );
  }
}


export async function DELETE(request: NextRequest) {
  const orderId = cleanOrderId(request.nextUrl.searchParams.get("orderId"));
  const pathname = request.nextUrl.searchParams.get("pathname") || "";
  if (!orderId || !pathname.startsWith(`production-order-photos/${orderId}/`)) {
    return NextResponse.json({ error: "Missing or invalid photo" }, { status: 400 });
  }

  try {
    await del(pathname);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      const filePath = localPhotoPath(orderId, pathname);
      if (!filePath) return NextResponse.json({ error: "Invalid photo path" }, { status: 400 });
      await rm(filePath, { force: true });
      return NextResponse.json({ ok: true, localFallback: true });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Photo delete failed" },
      { status: 500 }
    );
  }
}
