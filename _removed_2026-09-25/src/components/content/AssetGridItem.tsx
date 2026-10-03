import React, { useState } from "react";
import { Download, ExternalLink, Film, Image } from "lucide-react";
import type { Asset } from "./AssetGrid";

interface Props {
  asset: Asset;
  onView?: (asset: Asset) => void;
  onDownload?: (asset: Asset) => Promise<void>;
  getThumbnail: (asset: Asset) => string;
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  GENERATING: "bg-blue-100 text-blue-700",
  READY: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  GENERATING: "Generating",
  READY: "Ready",
  FAILED: "Failed",
};

export default function AssetGridItem({ asset, onView, onDownload, getThumbnail }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const thumbnail = getThumbnail(asset);

  const handleDownload = async () => {
    if (!onDownload) {
      if (asset.url) {
        const a = document.createElement("a");
        a.href = asset.url;
        a.download = `asset-${asset.id.slice(0, 8)}.${asset.mimeType?.startsWith("image/") ? "png" : "mp4"}`;
        a.target = "_blank";
        a.click();
      }
      return;
    }
    setDownloading(true);
    try {
      await onDownload(asset);
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = () => {
    if (asset.url && !previewUrl) {
      setPreviewUrl(asset.url);
    }
  };

  return (
    <div className="group relative rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all overflow-hidden">
      {/* Thumbnail */}
      <div className="aspect-video relative bg-slate-100">
        {asset.status === "GENERATING" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <img
            src={thumbnail}
            alt={asset.prompt.slice(0, 60)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center">
          <div className="flex gap-2">
            <button
              onClick={handlePreview}
              className="p-2 rounded-lg bg-white/90 hover:bg-white text-slate-700 transition-all"
              title="Preview"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            {asset.status === "READY" && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="p-2 rounded-lg bg-white/90 hover:bg-white text-slate-700 transition-all disabled:opacity-50"
                title="Download"
              >
                <Download className={`w-4 h-4 ${downloading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
        </div>
        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[asset.status] || "bg-slate-100 text-slate-600"}`}>
            {asset.status === "GENERATING" && <Loader2 className="w-3 h-3 animate-spin" />}
            {statusLabels[asset.status] || asset.status}
          </span>
        </div>
        {/* Media Type Badge */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/80 text-slate-600 backdrop-blur-sm">
            {asset.mediaType === "VIDEO" ? <Film className="w-3 h-3" /> : <Image className="w-3 h-3" />}
            {asset.mediaType}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs font-medium text-slate-900 line-clamp-2 mb-1">{asset.prompt}</p>
        <p className="text-xs text-slate-400">{asset.model.split("/").pop() || asset.model}</p>

        {asset.aspectRatio && (
          <p className="text-xs text-slate-400 mt-1">{asset.aspectRatio}{asset.duration ? ` · ${asset.duration}s` : ""}</p>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onView}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg border-slate-200 hover:bg-slate-50 text-slate-600 transition-all"
          >
            View
          </button>
          {asset.status === "READY" && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white transition-all disabled:opacity-50"
            >
              {downloading ? "Downloading..." : "Download"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
