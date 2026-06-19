"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Play, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Monitor, Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestRun, TestResult, Defect } from "@/lib/db/schema";

interface LiveResult {
  testCaseId: string;
  title: string;
  status: "running" | "passed" | "failed" | "error";
  durationMs?: number;
  defects?: number;
  errorMessage?: string;
}

interface RunSummary {
  runId: string;
  passed: number;
  failed: number;
  errored: number;
  total: number;
}

interface ExecutionPanelProps {
  projectId: string;
  hasApprovedCases: boolean;
}

const statusIcon: Record<string, React.ReactNode> = {
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
  passed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  error: <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />,
};

const statusClass: Record<string, string> = {
  passed: "bg-green-500/10 text-green-500",
  failed: "bg-red-500/10 text-red-500",
  error: "bg-orange-500/10 text-orange-500",
  skipped: "bg-muted text-muted-foreground",
};

export function ExecutionPanel({ projectId, hasApprovedCases }: ExecutionPanelProps) {
  const [browser, setBrowser] = useState<"chromium" | "firefox" | "webkit">("chromium");
  const [runOnlyApproved, setRunOnlyApproved] = useState(true);
  const [running, setRunning] = useState(false);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pastRuns, setPastRuns] = useState<TestRun[]>([]);
  const [latestResults, setLatestResults] = useState<TestResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) return;
        setPastRuns(data.runs ?? []);
        setLatestResults(data.latestResults ?? []);
      })
      .catch(() => {});
  }, [projectId]);

  async function startRun() {
    setRunning(true);
    setError(null);
    setLiveResults([]);
    setSummary(null);

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, browser, runOnlyApproved }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Server error ${res.status}`);
      }

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const raw = line.replace(/^data: /, "").trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === "start") { setTotal(event.total); }
            if (event.type === "progress") {
              setLiveResults((prev) => {
                const idx = prev.findIndex((r) => r.testCaseId === event.testCaseId);
                const entry: LiveResult = {
                  testCaseId: event.testCaseId,
                  title: event.title,
                  status: event.status,
                  durationMs: event.durationMs,
                  defects: event.defects,
                  errorMessage: event.errorMessage,
                };
                if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n; }
                return [...prev, entry];
              });
            }
            if (event.type === "done") {
              setSummary(event);
              // Refresh history
              fetch(`/api/runs/${projectId}`)
                .then((r) => r.json())
                .then((data) => {
                  if (Array.isArray(data)) return;
                  setPastRuns(data.runs ?? []);
                  setLatestResults(data.latestResults ?? []);
                })
                .catch(() => {});
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const doneCount = liveResults.filter((r) => r.status !== "running").length;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Test Execution</h3>
          {summary && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-green-500">{summary.passed} passed</span>
              {summary.failed > 0 && <span className="text-red-500">{summary.failed} failed</span>}
              {summary.errored > 0 && <span className="text-orange-500">{summary.errored} errors</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={browser} onValueChange={(v) => setBrowser(v as typeof browser)}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chromium">Chrome</SelectItem>
              <SelectItem value="firefox">Firefox</SelectItem>
              <SelectItem value="webkit">Safari</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={startRun}
            disabled={running || !hasApprovedCases}
            className="h-7 text-xs gap-1.5"
            title={!hasApprovedCases ? "Approve at least one test case first" : undefined}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? "Running…" : "Run Tests"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-destructive bg-destructive/5 border-b">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Live progress */}
      {running && (
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Running tests…</span>
            <span>{doneCount} / {total}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {/* Live results */}
      {liveResults.length > 0 && (
        <div className="divide-y max-h-64 overflow-y-auto">
          {liveResults.map((r) => (
            <div key={r.testCaseId} className="flex items-center justify-between px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {statusIcon[r.status]}
                <span className="truncate">{r.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {r.durationMs && <span className="text-muted-foreground">{r.durationMs}ms</span>}
                {r.defects != null && r.defects > 0 && (
                  <span className="flex items-center gap-0.5 text-orange-500">
                    <Bug className="h-3 w-3" />{r.defects}
                  </span>
                )}
                {r.errorMessage && (
                  <span className="max-w-[160px] truncate text-destructive" title={r.errorMessage}>
                    {r.errorMessage}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Past run history */}
      {pastRuns.length > 0 && !running && liveResults.length === 0 && (
        <div>
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowHistory((v) => !v)}
          >
            <span>Latest run: {new Date(pastRuns[0].createdAt).toLocaleString()} — {pastRuns[0].passed} passed / {pastRuns[0].failed} failed</span>
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showHistory && latestResults.length > 0 && (
            <div className="border-t divide-y max-h-72 overflow-y-auto">
              {latestResults.map((r) => (
                <div key={r.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-xs hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {statusIcon[r.status] ?? statusIcon.error}
                      <span className="truncate">{r.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", statusClass[r.status])}>
                        {r.status}
                      </span>
                      {r.durationMs && <span className="text-muted-foreground">{r.durationMs}ms</span>}
                      {(r.defects as Defect[] | null)?.length ? (
                        <span className="flex items-center gap-0.5 text-orange-500">
                          <Bug className="h-3 w-3" />{(r.defects as Defect[]).length}
                        </span>
                      ) : null}
                    </div>
                  </button>
                  {expandedId === r.id && (
                    <div className="border-t bg-muted/20 px-4 py-3 text-xs space-y-2">
                      {r.errorMessage && (
                        <div>
                          <p className="font-medium text-destructive mb-1">Error</p>
                          <p className="text-muted-foreground">{r.errorMessage}</p>
                        </div>
                      )}
                      {(r.consoleErrors as string[] | null)?.length ? (
                        <div>
                          <p className="font-medium mb-1">Console Errors ({(r.consoleErrors as string[]).length})</p>
                          {(r.consoleErrors as string[]).slice(0, 3).map((e, i) => (
                            <p key={i} className="text-muted-foreground font-mono text-[10px] truncate">{e}</p>
                          ))}
                        </div>
                      ) : null}
                      {(r.defects as Defect[] | null)?.length ? (
                        <div>
                          <p className="font-medium mb-1">Defects ({(r.defects as Defect[]).length})</p>
                          {(r.defects as Defect[]).map((d, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Badge variant="outline" className={cn("text-[10px] shrink-0", d.severity === "critical" ? "border-red-500 text-red-500" : d.severity === "major" ? "border-orange-500 text-orange-500" : "border-yellow-500 text-yellow-500")}>
                                {d.severity}
                              </Badge>
                              <span className="text-muted-foreground">{d.description}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {r.screenshotBase64 && (
                        <div>
                          <p className="font-medium mb-1">Screenshot</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:image/png;base64,${r.screenshotBase64}`}
                            alt="Test screenshot"
                            className="rounded border max-h-40 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!running && liveResults.length === 0 && pastRuns.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          {hasApprovedCases
            ? "Run your approved test cases against the live site. Results include screenshots and defect detection."
            : "Approve at least one test case before running."}
        </p>
      )}
    </div>
  );
}
