/**
 * Download an asset by ID — proxies the file from the stored URL.
 */
export async function downloadAsset(assetId: string): Promise<void> {
  const res = await fetch(`/api/content/assets/${assetId}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ download: true }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Download failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  // Determine filename
  const ext = res.headers.get("content-type")?.startsWith("image/") ? ".png" : ".mp4";
  const filename = `asset-${assetId.slice(0, 8)}${ext}`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
