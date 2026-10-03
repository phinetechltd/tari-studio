import React, { useState, useEffect, useCallback, useRef } from "react";
import { Download, ExternalLink, RefreshCw, Image, Film, X, Loader2 } from "lucide-react";

export interface Asset {
  id: string;
  status: string;
  mediaType: string;
  model: string;
  prompt: string;
  url: string | null;
  thumbnailUrl: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  metadata: Record<string, any> | null;
  requestId: string;
  externalRequestId: string | null;
  createdById: string;
  createdAt: string;
  readyAt: string | null;
  failedAt: string | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  seed: number | null;
  aspectRatio: string | null;
  duration: number | null;
  motion: number | null;
  resolution: string | null;
  creator?: { id: string; name: string; email: string };
  brand?: { id: string; name: string; slug: string };
}

interface Props {
  initialAssets?: Asset[];
  refreshInterval?: number;
  onView?: (asset: Asset) => void;
  onDownload?: (asset: Asset) => Promise<void>;
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  GENERATING: "bg-blue-100 text-blue-700",
  READY: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export default function AssetGrid({ initialAssets, refreshInterval = 10000, onView, onDownload }: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets || []);
  const [loading, setLoading] = useState(!initialAssets);
  const [filter, setFilter] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAssets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("mediaType", filter === "IMAGE" ? "IMAGE" : "VIDEO");
      if (search) params.set("search", search);
      const res = await fetch(`/api/content/assets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (err) {
      console.error("Failed to fetch assets:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchAssets();
    intervalRef.current = setInterval(fetchAssets, refreshInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAssets, refreshInterval]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAssets();
  };

  const filtered = assets.filter((a) => {
    if (filter !== "ALL" && a.mediaType !== filter) return false;
    if (search && !a.prompt.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getThumbnail = (asset: Asset) => {
    if (asset.url) return asset.url;
    if (asset.thumbnailUrl) return asset.thumbnailUrl;
    if (asset.mediaType === "VIDEO") {
      return "https://picsum.photos/seed/vidplaceholder/400/300";
    }
    return "https://picsum.photos/seed/imgplaceholder/400/400";
  };

  const getTypeIcon = (type: string) => {
    return type === "VIDEO" ? Film : Image;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-slate-100 animate-pulse aspect-square" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {(["ALL", "IMAGE", "VIDEO"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f === "ALL" ? "All" : f === "IMAGE" ? "Images" : "Videos"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <input
            type="text"
            placeholder="Search by prompt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border-slate-200 bg-white pl-10 pr-4 py-2 text-sm focus:border-blue-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="text-sm text-slate-500">
          {filtered.length} {filtered.length === 1 ? "asset" : "assets"}
          {refreshing && <span className="ml-2 inline-block animate-pulse">· refreshing</span>}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-xl border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Grid */}
      {filtered.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <Film className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">No assets yet</p>
          <p className="text-slate-400 text-sm mt-1">Generate your first image or video above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((asset) => (
            <AssetGridItem key={asset.id} asset={asset} onView={onView} onDownload={onDownload} getThumbnail={getThumbnail} />
          ))}
        </div>
      )}
    </div>
  );
}
