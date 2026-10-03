import AssetGrid from "@/components/content/AssetGrid";
import { downloadAsset } from "@/lib/download";

export const metadata = { title: "Asset Library" };

export default function AssetLibraryPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Asset Library</h1>
            <p className="text-sm text-slate-400 mt-0.5">AI-generated images and videos</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <AssetGrid
          refreshInterval={10000}
          onDownload={async (asset) => {
            await downloadAsset(asset.id);
          }}
        />
      </div>
    </div>
  );
}
