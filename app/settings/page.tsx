"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/testforge/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, DollarSign, Eye, Wrench, FileJson, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Capability = "json" | "tools" | "vision" | "fast" | "cheap";

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  description: string;
  capabilities: Capability[];
  contextWindow: string;
  cost: string;
}

const CAPABILITY_META: Record<
  Capability,
  { label: string; icon: React.ReactNode; required?: boolean; description: string }
> = {
  json: {
    label: "JSON Schema",
    icon: <FileJson className="h-3 w-3" />,
    required: true,
    description: "Structured JSON output — required for test case generation",
  },
  tools: {
    label: "Tool Calling",
    icon: <Wrench className="h-3 w-3" />,
    description: "Function/tool calling support",
  },
  vision: {
    label: "Vision",
    icon: <Eye className="h-3 w-3" />,
    description: "Image and screenshot input",
  },
  fast: {
    label: "Fast",
    icon: <Zap className="h-3 w-3" />,
    description: "Low latency inference",
  },
  cheap: {
    label: "Cheap",
    icon: <DollarSign className="h-3 w-3" />,
    description: "Cost-effective — under $1 / 1M tokens",
  },
};

const TOP_PICKS: ModelConfig[] = [
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    description: "Best value for structured output. Default model. Excellent JSON generation at very low cost.",
    capabilities: ["json", "tools", "fast", "cheap"],
    contextWindow: "128k",
    cost: "$0.27 / 1M",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    description: "Strongest reasoning and instruction following. Best for complex multi-step test scenarios.",
    capabilities: ["json", "tools", "vision"],
    contextWindow: "200k",
    cost: "$3.00 / 1M",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "Most widely tested with JSON Schema format. Highly reliable structured output and tool calling.",
    capabilities: ["json", "tools", "vision"],
    contextWindow: "128k",
    cost: "$2.50 / 1M",
  },
];

const ALL_MODELS: ModelConfig[] = [
  ...TOP_PICKS,
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    description: "Cheaper and faster GPT-4o. Good for simple or repetitive test case generation.",
    capabilities: ["json", "tools", "vision", "fast", "cheap"],
    contextWindow: "128k",
    cost: "$0.15 / 1M",
  },
  {
    id: "anthropic/claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    description: "Fastest and cheapest Claude model. Ideal for rapid bulk script generation.",
    capabilities: ["json", "tools", "fast", "cheap"],
    contextWindow: "200k",
    cost: "$0.80 / 1M",
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    description: "Fast Google model with a massive context window. Handles large site crawls well.",
    capabilities: ["json", "tools", "vision", "fast", "cheap"],
    contextWindow: "1M",
    cost: "$0.10 / 1M",
  },
  {
    id: "google/gemini-pro-1.5",
    name: "Gemini 1.5 Pro",
    provider: "Google",
    description: "Enormous context window — ideal for sites with hundreds of pages in a single prompt.",
    capabilities: ["json", "tools", "vision"],
    contextWindow: "2M",
    cost: "$1.25 / 1M",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    description: "Open-source model with solid JSON output and tool calling support.",
    capabilities: ["json", "tools", "cheap"],
    contextWindow: "128k",
    cost: "$0.12 / 1M",
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large",
    provider: "Mistral AI",
    description: "EU-based model with strong reasoning. Good alternative to GPT-4o for privacy-conscious use.",
    capabilities: ["json", "tools"],
    contextWindow: "128k",
    cost: "$2.00 / 1M",
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B",
    provider: "Alibaba",
    description: "Strong code and structured output generation. Very cost-effective open model.",
    capabilities: ["json", "tools", "cheap"],
    contextWindow: "128k",
    cost: "$0.35 / 1M",
  },
];

function CapabilityBadge({ cap }: { cap: Capability }) {
  const meta = CAPABILITY_META[cap];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        meta.required
          ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30"
          : "bg-muted text-muted-foreground"
      )}
    >
      {meta.icon}
      {meta.label}
      {meta.required && <span className="text-blue-400">*</span>}
    </span>
  );
}

function TopPickCard({
  model,
  selected,
  onSelect,
}: {
  model: ModelConfig;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative w-full rounded-xl border p-4 text-left transition-all duration-150",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/50"
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {model.provider}
        </span>
      </div>
      <p className="mb-1 font-semibold text-sm">{model.name}</p>
      <p className="mb-3 text-xs text-muted-foreground leading-relaxed">{model.description}</p>
      <div className="flex flex-wrap gap-1">
        {model.capabilities.map((cap) => (
          <CapabilityBadge key={cap} cap={cap} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
        <span>Context: {model.contextWindow}</span>
        <span>{model.cost} tokens</span>
      </div>
    </button>
  );
}

export default function SettingsPage() {
  const [selectedModel, setSelectedModel] = useState<string>("deepseek/deepseek-chat");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSelectedModel(data.selectedModel ?? "deepseek/deepseek-chat");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedModel }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const isTopPick = TOP_PICKS.some((m) => m.id === selectedModel);
  const selectedName =
    ALL_MODELS.find((m) => m.id === selectedModel)?.name ?? selectedModel;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Klyron&apos;s AI model. The selected model is used for test case and script generation.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            Loading settings…
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top Picks */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <h2 className="font-medium text-sm">Top Picks</h2>
                <span className="text-xs text-muted-foreground">Recommended for Klyron</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {TOP_PICKS.map((model) => (
                  <TopPickCard
                    key={model.id}
                    model={model}
                    selected={selectedModel === model.id}
                    onSelect={() => setSelectedModel(model.id)}
                  />
                ))}
              </div>
            </section>

            {/* All Models */}
            <section>
              <h2 className="mb-4 font-medium text-sm">All Available Models</h2>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-left font-medium">Model</th>
                      <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Provider</th>
                      <th className="px-4 py-2.5 text-left font-medium">Capabilities</th>
                      <th className="px-4 py-2.5 text-right font-medium hidden md:table-cell">Context</th>
                      <th className="px-4 py-2.5 text-right font-medium hidden md:table-cell">Cost</th>
                      <th className="px-4 py-2.5 text-right font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ALL_MODELS.map((model) => (
                      <tr
                        key={model.id}
                        className={cn(
                          "transition-colors",
                          selectedModel === model.id
                            ? "bg-primary/5"
                            : "hover:bg-muted/30"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs">{model.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed max-w-[200px] hidden lg:block">
                            {model.description}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                          {model.provider}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {model.capabilities.map((cap) => (
                              <CapabilityBadge key={cap} cap={cap} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground text-right hidden md:table-cell">
                          {model.contextWindow}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground text-right hidden md:table-cell">
                          {model.cost}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {selectedModel === model.id ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary font-medium">
                              <Check className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <button
                              onClick={() => setSelectedModel(model.id)}
                              className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                            >
                              Select
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                <span className="text-blue-400 font-medium">JSON Schema*</span> is required for Klyron to generate structured test cases. All listed models support it via OpenRouter.
              </p>
            </section>

            {/* Save bar */}
            <div className="sticky bottom-4 flex items-center justify-between rounded-xl border bg-background/95 backdrop-blur-sm px-4 py-3 shadow-lg">
              <div className="text-sm">
                <span className="text-muted-foreground">Active model: </span>
                <span className="font-medium">{selectedName}</span>
                {!isTopPick && (
                  <Badge variant="outline" className="ml-2 text-[10px]">Custom</Badge>
                )}
              </div>
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className={cn(saved && "bg-green-600 hover:bg-green-600")}
              >
                {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
