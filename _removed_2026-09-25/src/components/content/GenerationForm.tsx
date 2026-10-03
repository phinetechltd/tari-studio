"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Film, Image, Loader2, AlertCircle, RotateCcw, X } from "lucide-react";
import { createAssetSchema } from "@/lib/validators";

export interface GenerationFormProps {
  onGenerated?: (asset: any, error?: string) => void;
}

const IMAGE_MODELS = [
  { value: "flux-pro/kontext/max/text-to-image", label: "Flux Pro", description: "Highest quality photorealistic images", icon: Image },
  { value: "soul-2/standard/text-to-image", label: "SOUL 2", description: "Stylized editorial imagery", icon: Image },
  { value: "nano-banana-pro", label: "Nano Banana Pro", description: "Fast high-fidelity generation", icon: Image },
];

const VIDEO_MODELS = [
  { value: "seedance-2/text-to-video", label: "Seedance 2.0", description: "5s text-to-video, 720p", icon: Film },
  { value: "seedance-2-5/text-to-video", label: "Seedance 2.5", description: "Up to 10s, 1080p", icon: Film },
  { value: "kling-3/standard/text-to-video", label: "Kling 3.0 Standard", description: "Up to 15s cinematic video", icon: Film },
  { value: "wan-3/text-to-video", label: "Wan 3.0", description: "Long-form text-to-video", icon: Film },
];

const IMAGE_ASPECTS = [
  { value: "1:1", label: "1:1 Square" },
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Portrait" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

const VIDEO_ASPECTS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
];

const VIDEO_DURATIONS = [
  { value: "5", label: "5 seconds" },
  { value: "10", label: "10 seconds" },
  { value: "15", label: "15 seconds" },
];

interface State {
  mediaType: "IMAGE" | "VIDEO";
  model: string;
  prompt: string;
  aspectRatio: string;
  seed: number | null;
  duration: number | null;
  motion: number | null;
  resolution: string | null;
}

const initialState: State = {
  mediaType: "IMAGE",
  model: "",
  prompt: "",
  aspectRatio: "1:1",
  seed: null,
  duration: null,
  motion: null,
  resolution: null,
};

export default function GenerationForm({ onGenerated }: GenerationFormProps) {
  const [s, setS] = useState<State>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const selectedModel = s.mediaType === "IMAGE" ? IMAGE_MODELS.find((m) => m.value === s.model) : VIDEO_MODELS.find((m) => m.value === s.model);

  const setMediaType = (mt: "IMAGE" | "VIDEO") => {
    setS((prev) => ({
      ...prev,
      mediaType: mt,
      model: mt === "IMAGE" ? IMAGE_MODELS[0].value : "",
      aspectRatio: mt === "IMAGE" ? "1:1" : "16:9",
      seed: null,
      duration: null,
      motion: null,
      resolution: null,
    }));
    setError(null);
  };

  const handleGenerate = useCallback(async () => {
    if (!s.model || !s.prompt.trim()) return;

    const val = createAssetSchema.safeParse({
      mediaType: s.mediaType,
      model: s.model,
      prompt: s.prompt,
      aspectRatio: s.aspectRatio,
      seed: s.seed,
      duration: s.duration,
      motion: s.motion,
      resolution: s.resolution,
    });
    if (!val.success) {
      setError(val.error.issues[0]?.message || "Invalid input");
      return;
    }

    setLoading(true);
    setError(null);
    setGenerating(true);

    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(val.data),
      });

      const data = await res.json();

      if (res.status === 202 && data.asset?.status === "GENERATING") {
        setAssetId(data.asset.id);
      } else if (data.asset?.status === "READY") {
        setAssetId(data.asset.id);
        onGenerated?.(data.asset);
      } else if (data.asset?.status === "FAILED") {
        setError(data.asset.error || "Generation failed");
        onGenerated?.(data.asset, data.asset.error);
      } else {
        setError(data.error || "Generation failed");
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, [s]);

  const resetForm = () => {
    setS(initialState);
    setError(null);
    setAssetId(null);
  };

  const isBusy = loading || generating;

  return (
    <div className="space-y-6">
      {/* Media Type Toggle */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
        <button
          onClick={() => setMediaType("IMAGE")}
          disabled={isBusy}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            s.mediaType === "IMAGE"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Image className="w-4 h-4" />
          Image
        </button>
        <button
          onClick={() => setMediaType("VIDEO")}
          disabled={isBusy}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            s.mediaType === "VIDEO"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Film className="w-4 h-4" />
          Video
        </button>
      </div>

      {/* Model Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Model</label>
        <div className="grid grid-cols-1 gap-2">
          {(s.mediaType === "IMAGE" ? IMAGE_MODELS : VIDEO_MODELS).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => setS((prev) => ({ ...prev, model: m.value }))}
                disabled={isBusy || s.model === m.value}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  s.model === m.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${s.model === m.value ? "text-blue-600" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{m.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.description}</div>
                </div>
                {s.model === m.value && (
                  <div className="ml-auto flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Prompt</label>
        <textarea
          value={s.prompt}
          onChange={(e) => setS((prev) => ({ ...prev, prompt: e.target.value }))}
          placeholder="A beautiful sunset over mountains, cinematic lighting, 8k resolution..."
          rows={4}
          disabled={isBusy}
          className="w-full rounded-xl border-slate-200 bg-white px-4 py-3 text-sm placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-y"
        />
      </div>

      {/* Options Panel */}
      {s.mediaType === "IMAGE" && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Aspect Ratio</label>
            <select
              value={s.aspectRatio}
              onChange={(e) => setS((prev) => ({ ...prev, aspectRatio: e.target.value }))}
              disabled={isBusy}
              className="w-full rounded-lg border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500"
            >
              {IMAGE_ASPECTS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Seed (optional)</label>
            <input
              type="number"
              value={s.seed ?? ""}
              onChange={(e) => setS((prev) => ({ ...prev, seed: e.target.value ? Number(e.target.value) : null }))}
              placeholder="Random"
              disabled={isBusy}
              className="w-full rounded-lg border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {s.mediaType === "VIDEO" && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Aspect Ratio</label>
            <select
              value={s.aspectRatio}
              onChange={(e) => setS((prev) => ({ ...prev, aspectRatio: e.target.value }))}
              disabled={isBusy}
              className="w-full rounded-lg border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500"
            >
              {VIDEO_ASPECTS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Duration</label>
            <select
              value={s.duration?.toString() ?? ""}
              onChange={(e) => setS((prev) => ({ ...prev, duration: e.target.value ? Number(e.target.value) : null }))}
              disabled={isBusy}
              className="w-full rounded-lg border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500"
            >
              <option value="">Select...</option>
              {VIDEO_DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Motion</label>
            <select
              value={s.motion?.toString() ?? ""}
              onChange={(e) => setS((prev) => ({ ...prev, motion: e.target.value ? Number(e.target.value) : null }))}
              disabled={isBusy}
              className="w-full rounded-lg border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500"
            >
              <option value="">Default</option>
              <option value="1">Low</option>
              <option value="2">Medium</option>
              <option value="3">High</option>
            </select>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Generation failed</p>
            <p className="mt-1 text-red-600">{error}</p>
          </div>
          <button
            onClick={resetForm}
            className="ml-auto flex-shrink-0 p-1 rounded-lg hover:bg-red-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          disabled={isBusy || !s.model || !s.prompt.trim()}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-xl transition-all shadow-sm"
        >
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {generating && <Loader2 className="w-5 h-5 animate-spin" />}
          {generating ? "Generating..." : loading ? "Submitting..." : "Generate"}
        </button>
        <button
          onClick={resetForm}
          disabled={isBusy}
          className="px-4 py-3 rounded-xl border-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed text-slate-600 transition-all"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
