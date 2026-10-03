"use client";

import { JsonForm, type FormField } from "@/components/json-form";

interface Props {
  initialSettings: {
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    system: string;
  } | null;
}

export function AiSettingsForm(props: Props) {
  const modelOptions = [
    { value: "nvidia-nemotron-3-ultra", label: "Nemotron 3 Ultra (best quality)" },
    { value: "nvidia-nemotron-3-super", label: "Nemotron 3 Super (balanced)" },
    { value: "nvidia-nemotron-3-nano", label: "Nemotron 3 Nano (fast, low cost)" },
    { value: "nvidia-nemotron-3.5-lightning", label: "Nemotron 3.5 Lightning (ultra fast)" },
    { value: "nvidia-k3:free", label: "Kimi K3 (Moonshot, hosted on NVIDIA)" },
  ];

  const fields: FormField[] = [
    {
      name: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      autoComplete: "off",
      placeholder: "Enter your NVIDIA API key",
      help: "Stored per organisation. Leave blank to remove.",
      defaultValue: props.initialSettings?.apiKey ?? "",
    },
    {
      name: "model",
      label: "Default Model",
      type: "select",
      required: true,
      options: modelOptions,
      help: "The model used by default for generation.",
      defaultValue: props.initialSettings?.model ?? "nvidia-nemotron-3-ultra",
    },
    {
      name: "temperature",
      label: "Temperature",
      type: "number",
      required: true,
      inputMode: "numeric",
      placeholder: "0.0 - 2.0",
      help: "Controls randomness: lower is more focused, higher is more creative.",
      defaultValue: String(props.initialSettings?.temperature ?? 1),
    },
    {
      name: "maxTokens",
      label: "Max Tokens",
      type: "number",
      required: true,
      inputMode: "numeric",
      placeholder: "1 - 16384",
      help: "Maximum number of tokens in the response.",
      defaultValue: String(props.initialSettings?.maxTokens ?? 4096),
    },
    {
      name: "system",
      label: "System Prompt (optional)",
      type: "text",
      required: false,
      autoComplete: "off",
      placeholder: "Instructions that apply to every generation...",
      help: "Prepended to every prompt. Leave blank for none.",
      defaultValue: props.initialSettings?.system ?? "",
    },
  ];

  return (
    <div className="mt-4">
      <JsonForm
        endpoint="/api/account/settings"
        method="PUT"
        fields={fields}
        submitLabel="Save AI Settings"
        toBody={(values) => ({
          apiKey: values.apiKey?.trim() ?? "",
          model: values.model?.trim() ?? "nvidia-nemotron-3-ultra",
          temperature: parseFloat(values.temperature ?? "1"),
          maxTokens: parseInt(values.maxTokens ?? "4096", 10),
          system: values.system?.trim() ?? "",
        })}
        then="none"
        successMessage="Settings saved."
      />
    </div>
  );
}
