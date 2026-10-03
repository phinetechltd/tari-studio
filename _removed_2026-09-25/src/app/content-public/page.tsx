import Link from "next/link";
import { Image, Film, ArrowRight } from "lucide-react";

export const metadata = { title: "Content Studio" };

export default function ContentOverviewPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">Content Studio</h1>
          <span className="text-sm text-slate-400">AI-powered image and video generation</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Generate */}
          <Link
            href="/app/content/generate"
            className="group block bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all p-6"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-blue-600">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">Generate</h2>
                <p className="text-sm text-slate-500 mt-1">Create AI images and videos using Higgsfield models. Flux Pro, SOUL 2, Seedance, Kling, and Wan.</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all mt-1" />
            </div>
          </Link>

          {/* Asset Library */}
          <Link
            href="/app/content/assets"
            className="group block bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all p-6"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-emerald-600">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">Asset Library</h2>
                <p className="text-sm text-slate-500 mt-1">Browse, search, and download your generated assets. Auto-refreshes every 10 seconds.</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all mt-1" />
            </div>
          </Link>
        </div>

        {/* Feature highlights */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { label: "Flux Pro", desc: "Photorealistic images", icon: Image },
            { label: "Seedance 2.5", desc: "Up to 10s video, 1080p", icon: Film },
            { label: "Kling 3.0", desc: "Cinematic 15s video", icon: Film },
          ].map((f) => (
            <div key={f.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <f.icon className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="font-medium text-slate-900 text-sm">{f.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
