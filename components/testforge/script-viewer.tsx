"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Check, FileCode, X } from "lucide-react";
import type { AutomationScript, TestCase } from "@/lib/db/schema";

interface ScriptViewerProps {
  scripts: AutomationScript[];
  testCases: TestCase[];
  projectId: string;
}

interface ScriptModalProps {
  script: AutomationScript;
  onClose: () => void;
}

function ScriptModal({ script, onClose }: ScriptModalProps) {
  const [copied, setCopied] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    // Lock body scroll
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function copyCode() {
    await navigator.clipboard.writeText(script.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadFile() {
    const blob = new Blob([script.code], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = script.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-5xl flex-col rounded-xl border bg-card shadow-2xl"
           style={{ maxHeight: "90dvh" }}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate font-mono text-sm font-medium">
              {script.fileName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={downloadFile}>
              <Download className="h-3 w-3" /> Download
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={copyCode}>
              {copied ? (
                <><Check className="h-3 w-3 text-green-600" /> Copied</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy</>
              )}
            </Button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Code area — scrolls both axes */}
        <div className="min-h-0 flex-1 overflow-auto">
          <pre className="p-4 font-mono text-xs leading-relaxed text-foreground w-max min-w-full">
            {script.code}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t px-4 py-2">
          <Badge variant="secondary" className="text-xs">
            {script.model.split("/").pop()}
          </Badge>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScriptViewer({ scripts, testCases, projectId }: ScriptViewerProps) {
  const [activeScript, setActiveScript] = useState<AutomationScript | null>(null);

  function downloadAll() {
    window.location.href = `/api/export/${projectId}`;
  }

  function tcTitle(tcId: string) {
    return testCases.find((t) => t.id === tcId)?.title ?? tcId;
  }

  if (scripts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No scripts generated yet. Click <strong>Generate Script</strong> on a test case row,
        or use <strong>Generate All Scripts</strong> above.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={downloadAll}>
            <Download className="mr-2 h-4 w-4" />
            Download All (.zip)
          </Button>
        </div>
        <div className="divide-y rounded-md border">
          {scripts.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileCode className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.fileName}</p>
                  <p className="truncate text-xs text-muted-foreground">{tcTitle(s.testCaseId)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                  {s.model.split("/").pop()}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Download file"
                  onClick={() => {
                    const blob = new Blob([s.code], { type: "text/javascript" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = s.fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setActiveScript(s)}>
                  View
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeScript && (
        <ScriptModal script={activeScript} onClose={() => setActiveScript(null)} />
      )}
    </>
  );
}
