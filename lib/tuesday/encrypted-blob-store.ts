import { get, put, BlobNotFoundError } from "@vercel/blob";
import crypto from "crypto";

type Envelope = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

export function isMissingBlobToken(err: unknown) {
  return err instanceof Error && err.message.includes("No token found");
}

function encryptionKey() {
  const secret = process.env.BLOB_READ_WRITE_TOKEN || process.env.SITE_PASSWORD;
  if (!secret) throw new Error("Tuesday storage secret is not configured");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const envelope: Envelope = {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

function decryptJson<T>(text: string) {
  const envelope = JSON.parse(text) as Envelope;
  if (envelope.version !== 1) throw new Error(`Unsupported Tuesday storage version ${String(envelope.version)}`);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export async function readEncryptedBlob<T>(path: string, fallback: T) {
  try {
    const blob = await get(path, { access: "public" });
    if (!blob || blob.stream == null) return fallback;
    const text = await new Response(blob.stream).text();
    return { ...fallback, ...decryptJson<T>(text) };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return fallback;
    throw err;
  }
}

export async function writeEncryptedBlob(path: string, value: unknown) {
  await put(path, encryptJson(value), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}
