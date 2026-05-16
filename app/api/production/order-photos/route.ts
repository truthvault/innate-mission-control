import { del, list, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

function cleanOrderId(value: string | null) {
  return value && /^\d+$/.test(value) ? value : null;
}

function cleanFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90) || "photo";
}

function isMissingBlobToken(err: unknown) {
  return err instanceof Error && err.message.includes("No token found");
}

export async function GET(request: NextRequest) {
  const orderId = cleanOrderId(request.nextUrl.searchParams.get("orderId"));
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

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
        photos: [],
        disabledReason: "Photo storage is not connected yet.",
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
      return NextResponse.json(
        { error: "Photo storage is not connected yet." },
        { status: 503 }
      );
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
      return NextResponse.json({ error: "Photo storage is not connected yet." }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Photo delete failed" },
      { status: 500 }
    );
  }
}
