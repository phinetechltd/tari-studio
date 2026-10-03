import GenerationForm from "@/components/content/GenerationForm";

export const metadata = { title: "Content Studio" };

export default function ContentGeneratePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">Content Studio</h1>
          <span className="text-sm text-slate-400">Generate AI images and videos</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Form */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-5">Generation Settings</h2>
            <GenerationForm />
          </div>

          {/* Hints */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Quick Tips</h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Use descriptive prompts for better results. Include lighting, style, and camera details.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>For images, try different aspect ratios depending on your use case — 1:1 for social, 16:9 for web.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>For videos, longer durations produce more detailed motion. Start with 5s for quick results.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Use a fixed seed for reproducible results across regenerations.</span>
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Models</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Flux Pro</span>
                  <span className="text-slate-400">Image</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">SOUL 2</span>
                  <span className="text-slate-400">Image</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Seedance 2.0</span>
                  <span className="text-slate-400">Video · 5s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Seedance 2.5</span>
                  <span className="text-slate-400">Video · 10s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Kling 3.0</span>
                  <span className="text-slate-400">Video · 15s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Wan 3.0</span>
                  <span className="text-slate-400">Video · Long</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
