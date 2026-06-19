"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, AlertTriangle, Lightbulb, Copy, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DuplicateGroup {
  indices: number[];
  ids: string[];
  titles: string[];
  reason: string;
}

interface CoverageGap {
  area: string;
  suggestion: string;
}

interface Improvement {
  index: number;
  id: string;
  title: string;
  suggestion: string;
}

interface ValidationReport {
  duplicateGroups: DuplicateGroup[];
  coverageGaps: CoverageGap[];
  improvements: Improvement[];
  overallCoverage: "Excellent" | "Good" | "Moderate" | "Poor";
  summary: string;
}

const coverageColors: Record<string, string> = {
  Excellent: "bg-green-500/15 text-green-500",
  Good: "bg-blue-500/15 text-blue-400",
  Moderate: "bg-yellow-500/15 text-yellow-500",
  Poor: "bg-red-500/15 text-red-500",
};

interface ValidationPanelProps {
  projectId: string;
  hasTestCases: boolean;
  onDeleteIds: (ids: string[]) => void;
}

export function ValidationPanel({ projectId, hasTestCases, onDeleteIds }: ValidationPanelProps) {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function runValidation() {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/validate-testcases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
      setReport(data as ValidationReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">AI Validation</h3>
          {report && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", coverageColors[report.overallCoverage])}>
              {report.overallCoverage} Coverage
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={runValidation}
          disabled={running || !hasTestCases}
          className="h-7 text-xs gap-1.5"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {running ? "Validating…" : "Validate & Improve"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-destructive bg-destructive/5 border-b">
          <X className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {!report && !running && !error && (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Run validation to detect duplicates, coverage gaps, and get improvement suggestions.
        </p>
      )}

      {report && (
        <div className="divide-y">
          {/* Summary */}
          <div className="px-4 py-3 text-xs text-muted-foreground leading-relaxed">
            {report.summary}
          </div>

          {/* Duplicates */}
          {report.duplicateGroups.length > 0 && (
            <div className="px-4 py-3">
              <button
                onClick={() => toggle("dupes")}
                className="flex w-full items-center justify-between text-xs font-medium"
              >
                <span className="flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5 text-yellow-500" />
                  {report.duplicateGroups.length} Duplicate Group{report.duplicateGroups.length > 1 ? "s" : ""}
                </span>
                {expanded["dupes"] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded["dupes"] && (
                <div className="mt-3 space-y-3">
                  {report.duplicateGroups.map((group, i) => (
                    <div key={i} className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                      <p className="mb-2 text-[10px] text-muted-foreground">{group.reason}</p>
                      <div className="space-y-1">
                        {group.titles.map((title, j) => (
                          <div key={j} className="flex items-center justify-between text-xs">
                            <span className="truncate text-foreground">{title}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-6 text-[10px] text-destructive hover:text-destructive hover:border-destructive/50"
                        onClick={() => {
                          // Keep first, delete rest
                          onDeleteIds(group.ids.slice(1));
                        }}
                      >
                        Remove duplicates (keep first)
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Coverage Gaps */}
          {report.coverageGaps.length > 0 && (
            <div className="px-4 py-3">
              <button
                onClick={() => toggle("gaps")}
                className="flex w-full items-center justify-between text-xs font-medium"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                  {report.coverageGaps.length} Coverage Gap{report.coverageGaps.length > 1 ? "s" : ""}
                </span>
                {expanded["gaps"] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded["gaps"] && (
                <div className="mt-3 space-y-2">
                  {report.coverageGaps.map((gap, i) => (
                    <div key={i} className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs">
                      <p className="font-medium">{gap.area}</p>
                      <p className="mt-1 text-muted-foreground leading-relaxed">{gap.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Improvements */}
          {report.improvements.length > 0 && (
            <div className="px-4 py-3">
              <button
                onClick={() => toggle("imps")}
                className="flex w-full items-center justify-between text-xs font-medium"
              >
                <span className="flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
                  {report.improvements.length} Improvement{report.improvements.length > 1 ? "s" : ""}
                </span>
                {expanded["imps"] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded["imps"] && (
                <div className="mt-3 space-y-2">
                  {report.improvements.map((imp, i) => (
                    <div key={i} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs">
                      <p className="font-medium truncate">{imp.title}</p>
                      <p className="mt-1 text-muted-foreground leading-relaxed">{imp.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {report.duplicateGroups.length === 0 && report.coverageGaps.length === 0 && (
            <div className="px-4 py-3 text-xs text-green-500">
              No duplicates or coverage gaps found. Test suite looks solid!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
