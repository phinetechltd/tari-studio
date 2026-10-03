"use client";

import React, { useState } from "react";
import { Download, ExternalLink, ArrowLeft, Film, Image, Clock, Maximize2, Link as LinkIcon } from "lucide-react";
import type { Asset } from "./AssetGrid";

interface Props {
  asset: Asset;
  onBack?: () => void;
  onDownload?: (asset: Asset) => Promise<void>;
}

export default function AssetDetailPage({ asset, onBack, onDownload }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  const openPreview = () => {
    if (asset.url) window.open(asset.url, "_blank");
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const modelLabel = asset.model.split("/").pop() || asset.model;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              asset.status === "READY" ? "bg-green-100 text-green-700" :
              asset.status === "GENERATING" ? "bg-blue-100 text-blue-700" :
              asset.status === "FAILED" ? "bg-red-100 text-red-700" :
              "bg-slate-100 text-slate-600"
            }`}>
              {asset.status === "GENERATING" && <Clock className="w-3.5 h-3.5 animate-spin" />}
              {asset.status.charAt(0) + asset.status.slice(1).toLowerCase()}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {asset.mediaType === "VIDEO" ? <Film className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
              {asset.mediaType}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative rounded-xl bg-slate-100 overflow-hidden" style={{ aspectRatio: asset.mediaType === "VIDEO" ? "16/9" : "1" }}>
              {previewUrl ? (
                <video
                  src={previewUrl}
                  controls
                  className="w-full h-full object-contain"
                  autoPlay
                />
              ) : (
                <img
                  src={asset.url || "https://picsum.photos/seed/placeholder/800/600"}
                  alt={asset.prompt}
                  className="w-full h-full object-contain"
                />
              )}
              {/* Actions overlay */}
              <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {asset.url && (
                  <button
                    onClick={openPreview}
                    className="flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white rounded-lg text-sm text-slate-700 shadow-lg transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Preview
                  </button>
                )}
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm shadow-lg transition-all disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 ${downloading ? "animate-spin" : ""}`} />
                  {downloading ? "Downloading..." : "Download"}
                </button>
              </div>
            </div>

            {/* Metadata card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Generation Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Model</p>
                  <p className="font-medium text-slate-900">{modelLabel}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Prompt</p>
                  <p className="font-medium text-slate-900 line-clamp-2">{asset.prompt}</p>
                </div>
                {asset.aspectRatio && (
                  <div>
                    <p className="text-slate-400 text-xs">Aspect Ratio</p>
                    <p className="font-medium text-slate-900">{asset.aspectRatio}</p>
                  </div>
                )}
                {asset.seed !== null && (
                  <div>
                    <p className="text-slate-400 text-xs">Seed</p>
                    <p className="font-medium text-slate-900">{asset.seed}</p>
                  </div>
                )}
                {asset.duration && (
                  <div>
                    <p className="text-slate-400 text-xs">Duration</p>
                    <p className="font-medium text-slate-900">{asset.duration}s</p>
                  </div>
                )}
                {asset.fileSizeBytes !== null && (
                  <div>
                    <p className="text-slate-400 text-xs">File Size</p>
                    <p className="font-medium text-slate-900">{formatBytes(asset.fileSizeBytes)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Asset info */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Asset Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">ID</span>
                  <span className="font-mono text-slate-600 text-xs break-all">{asset.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Request ID</span>
                  <span className="font-mono text-slate-600 text-xs">{asset.requestId}</span>
                </div>
                {asset.externalRequestId && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">External Request ID</span>
                    <span className="font-mono text-slate-600 text-xs break-all">{asset.externalRequestId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Created</span>
                  <span>{formatDate(asset.createdAt)}</span>
                </div>
                {asset.readyAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ready</span>
                    <span>{formatDate(asset.readyAt)}</span>
                  </div>
                )}
                {asset.failedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Failed</span>
                    <span>{formatDate(asset.failedAt)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Downloads</span>
                  <span>{asset.downloadCount}</span>
                </div>
                {asset.mimeType && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">MIME Type</span>
                    <span className="text-slate-600">{asset.mimeType}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Creator */}
            {asset.creator && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Creator</h3>
                <p className="font-medium text-slate-900">{asset.creator.name}</p>
                <p className="text-sm text-slate-400">{asset.creator.email}</p>
              </div>
            )}

            {/* Actions */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-1">Actions</h3>
              <button
                onClick={handleDownload}
                disabled={downloading || asset.status !== "READY"}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  asset.status === "READY"
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                <Download className={`w-4 h-4 ${downloading ? "animate-spin" : ""}`} />
                {downloading ? "Downloading..." : "Download Asset"}
              </button>
              {asset.url && (
                <button
                  onClick={openPreview}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in New Tab
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
