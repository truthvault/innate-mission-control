"use client";

/**
 * Order photo tray: Blob-backed QC/final photos for an order.
 * Extracted from PlanClient as part of the view-by-view split.
 */

import { useEffect, useState } from "react";
import { DT } from "@/components/mission-control-tokens";

export type OrderPhoto = { url: string; pathname: string; uploadedAt?: string; size?: number };

export function OrderPhotoTray({ orderId, embedded = false, onPhotoUploaded }: { orderId: number; embedded?: boolean; onPhotoUploaded?: () => void }) {
  const [requested, setRequested] = useState(true);
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [status, setStatus] = useState<string>("Loading photos...");
  const [disabledReason, setDisabledReason] = useState<string>("");
  const [deletingPathname, setDeletingPathname] = useState<string>("");
  const [pendingDeletePathname, setPendingDeletePathname] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    fetch(`/api/production/order-photos?orderId=${orderId}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Photo store unavailable")))
      .then((data: { photos?: OrderPhoto[]; disabledReason?: string }) => {
        if (!cancelled) {
          setPhotos(data.photos ?? []);
          setDisabledReason(data.disabledReason ?? "");
          setStatus("");
        }
      })
      .catch((err) => {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Photo store unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, requested]);


  async function deletePhoto(photo: OrderPhoto) {
    setDeletingPathname(photo.pathname);
    setStatus("Deleting photo...");
    try {
      const params = new URLSearchParams({ orderId: String(orderId), pathname: photo.pathname });
      const response = await fetch(`/api/production/order-photos?${params.toString()}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Delete failed");
      setPhotos((current) => current.filter((item) => item.pathname !== photo.pathname));
      setStatus("Photo deleted");
    } finally {
      setDeletingPathname("");
      setPendingDeletePathname("");
    }
  }

  function requestDeletePhoto(photo: OrderPhoto) {
    if (pendingDeletePathname !== photo.pathname) {
      setPendingDeletePathname(photo.pathname);
      setStatus("Press Delete again to remove this photo.");
      return;
    }
    deletePhoto(photo).catch((err) => setStatus(err instanceof Error ? err.message : "Delete failed"));
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append("orderId", String(orderId));
    form.append("file", file);
    setUploading(true);
    setStatus("Uploading photo...");
    try {
      const response = await fetch("/api/production/order-photos", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setPhotos((current) => [data.photo as OrderPhoto, ...current]);
      setDisabledReason("");
      setStatus("Photo uploaded");
      onPhotoUploaded?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${embedded ? "rgba(12,124,122,0.16)" : DT.border}`, background: embedded ? "rgba(255,255,255,0.62)" : DT.cardBg, borderRadius: embedded ? 9 : 12, padding: embedded ? 8 : 12, boxShadow: embedded ? "none" : "0 6px 18px rgba(37,30,20,0.035)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          {!embedded && <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em", color: DT.teal }}>Photos</div>}
          <div style={{ marginTop: embedded ? 0 : 2, fontFamily: DT.sans, fontSize: embedded ? 11 : 13, color: embedded ? DT.textPrimary : DT.textMuted, fontWeight: 900 }}>{embedded ? "QC photos" : "QC and dispatch evidence"}</div>
        </div>
        {!requested ? (
          <button
            type="button"
            onClick={() => {
              setStatus("Loading photos...");
              setRequested(true);
            }}
            style={{ border: `1px solid rgba(12,124,122,0.18)`, background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
          >
            Load photos
          </button>
        ) : (
          <label title={disabledReason || "Upload order photos"} style={{ border: `1px solid rgba(12,124,122,0.18)`, background: disabledReason || uploading ? "rgba(0,0,0,0.035)" : DT.tealSoft, color: disabledReason || uploading ? DT.textFaint : DT.teal, borderRadius: 999, padding: embedded ? "5px 8px" : "6px 9px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: disabledReason || uploading ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
            {uploading ? "Uploading..." : "+ Photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={Boolean(disabledReason) || uploading}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.currentTarget.value = "";
                Promise.all(files.map(uploadPhoto)).catch((err) => setStatus(err instanceof Error ? err.message : "Upload failed"));
              }}
              style={{ display: "none" }}
            />
          </label>
        )}
      </div>
      {(status || disabledReason || !requested) && <div style={{ marginTop: 6, border: disabledReason ? "1px solid rgba(154,91,18,0.20)" : "none", background: disabledReason ? "rgba(250,204,21,0.10)" : "transparent", borderRadius: 8, padding: disabledReason ? "6px 8px" : 0, fontFamily: DT.sans, fontSize: 10, color: disabledReason ? "#9a5b12" : DT.textMuted, fontWeight: 850, lineHeight: 1.3 }}>{status || disabledReason || "Photos load only when needed."}</div>}
      {requested && (
        <div style={{ marginTop: embedded ? 6 : 8, display: "grid", gridTemplateColumns: embedded ? "repeat(3, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 5 }}>
          {photos.map((photo) => (
            <div key={photo.pathname} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", border: `1px solid ${DT.border}`, background: DT.cardBg }}>
              <a href={photo.url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Order upload" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </a>
              <button
                type="button"
                disabled={deletingPathname === photo.pathname}
                onClick={() => requestDeletePhoto(photo)}
                style={{ position: "absolute", right: 4, top: 4, border: "1px solid rgba(146,42,35,0.16)", background: pendingDeletePathname === photo.pathname ? "rgba(146,42,35,0.88)" : "rgba(255,253,249,0.92)", color: deletingPathname === photo.pathname ? DT.textFaint : pendingDeletePathname === photo.pathname ? "#fff" : DT.textMuted, borderRadius: 999, minWidth: 30, height: 24, padding: "0 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, cursor: deletingPathname === photo.pathname ? "wait" : "pointer", lineHeight: "20px" }}
                aria-label="Delete photo"
                title="Delete photo"
              >
                {pendingDeletePathname === photo.pathname ? "Sure" : "Del"}
              </button>
            </div>
          ))}
          {photos.length === 0 && <div style={{ gridColumn: "1 / -1", border: `1px dashed ${DT.border}`, background: "rgba(255,255,255,0.60)", borderRadius: 9, padding: embedded ? "6px 7px" : "8px 9px", fontFamily: DT.sans, fontSize: embedded ? 10 : 11, color: DT.textMuted, lineHeight: 1.3 }}>No photos yet.</div>}
        </div>
      )}
    </div>
  );
}
