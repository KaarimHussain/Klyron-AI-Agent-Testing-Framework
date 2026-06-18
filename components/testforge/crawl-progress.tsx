"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Globe, CheckCircle2, AlertCircle, Zap, Brain, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressEvent {
  type: "thinking" | "action" | "result" | "error" | "done";
  message: string;
  data?: unknown;
}

interface CrawlProgressProps {
  projectId: string;
  onCrawlComplete: () => void;
}

const eventStyle: Record<ProgressEvent["type"], { icon: React.ReactNode; row: string; dot: string }> = {
  thinking: { icon: <Brain className="h-3 w-3"    />, row: "text-muted-foreground",                dot: "bg-muted-foreground/40"   },
  action:   { icon: <Globe className="h-3 w-3"    />, row: "text-foreground",                       dot: "bg-primary"               },
  result:   { icon: <CheckCircle2 className="h-3 w-3" />, row: "text-green-600 dark:text-green-400", dot: "bg-green-500"             },
  error:    { icon: <AlertCircle className="h-3 w-3"  />, row: "text-destructive",                   dot: "bg-destructive"           },
  done:     { icon: <Zap className="h-3 w-3"      />, row: "text-primary font-medium",               dot: "bg-primary"               },
};

export function CrawlProgress({ projectId, onCrawlComplete }: CrawlProgressProps) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [crawling, setCrawling] = useState(false);
  const [done, setDone] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function startCrawl() {
    setEvents([]);
    setCrawling(true);
    setDone(false);
    setFatalError(null);
    setProgress(5);
    abortRef.current = new AbortController();
    let receivedDone = false;

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
        signal: abortRef.current.signal,
      });

      // Non-2xx before stream starts = hard failure
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      if (!res.body) throw new Error("No response body from server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const raw = line.replace(/^data: /, "").trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as ProgressEvent;
            setEvents((prev) => [...prev, event]);
            setProgress((p) => Math.min(p + 5, 95));

            if (event.type === "done") {
              receivedDone = true;
              setProgress(100);
              setDone(true);
              setTimeout(onCrawlComplete, 600);
            }
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          } catch { /* ignore partial SSE chunks */ }
        }
      }

      // Stream closed without a done event — likely a server crash
      if (!receivedDone) {
        setFatalError("The crawl stream ended unexpectedly. The server may have timed out. Try again.");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // user cancelled
      setFatalError(err instanceof Error ? err.message : String(err));
    } finally {
      setCrawling(false);
    }
  }

  function stopCrawl() {
    abortRef.current?.abort();
    setCrawling(false);
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={crawling ? "destructive" : "default"}
          className="h-8 text-xs gap-1.5"
          onClick={crawling ? stopCrawl : startCrawl}
        >
          {crawling ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stop</>
          ) : (
            <><Globe className="h-3.5 w-3.5" />{done ? "Re-Analyze" : "Analyze Site"}</>
          )}
        </Button>
        {done && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(crawling || events.length > 0) && (
        <Progress value={progress} className="h-1" />
      )}

      {/* Event log */}
      {events.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/20 p-3 space-y-1">
          {events.map((ev, i) => {
            const s = eventStyle[ev.type];
            return (
              <div key={i} className={cn("flex items-start gap-2 text-xs leading-relaxed", s.row)}>
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
                <span className="flex-1">{ev.message}</span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Fatal error banner */}
      {fatalError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Crawl failed</p>
            <p className="mt-0.5 leading-relaxed opacity-90">{fatalError}</p>
          </div>
          <button
            onClick={startCrawl}
            className="shrink-0 ml-2 rounded p-0.5 hover:bg-destructive/20 transition-colors"
            title="Retry"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Empty hint */}
      {events.length === 0 && !crawling && !fatalError && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Click <strong className="font-medium text-foreground">Analyze Site</strong> to start.
          TestForge will map pages, forms, and interactive elements so the AI can generate
          grounded test cases and scripts.
        </p>
      )}

    </div>
  );
}
