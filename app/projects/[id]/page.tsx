"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/testforge/navbar";
import { CrawlProgress } from "@/components/testforge/crawl-progress";
import { TestCaseTable } from "@/components/testforge/testcase-table";
import { ScriptViewer } from "@/components/testforge/script-viewer";
import {
  ArrowLeft, Loader2, Sparkles, Code2, Globe, Trash2,
  FileText, CheckCircle2, AlertCircle, Download, TriangleAlert, ShieldAlert, Play, BarChart2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ValidationPanel } from "@/components/testforge/validation-panel";
import { ExecutionPanel } from "@/components/testforge/execution-panel";
import type { Project, SitePage, TestCase, AutomationScript } from "@/lib/db/schema";

interface ProjectData extends Project {
  pages: SitePage[];
  testCases: TestCase[];
  scripts: AutomationScript[];
}

const statusMeta: Record<string, { label: string; class: string }> = {
  idle:       { label: "Idle",        class: "bg-muted text-muted-foreground" },
  crawling:   { label: "Crawling…",   class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  crawled:    { label: "Crawled",     class: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  generating: { label: "Generating…", class: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  ready:      { label: "Ready",       class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  error:      { label: "Error",       class: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("crawl");
  const [generatingTestCases, setGeneratingTestCases] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingDataIds, setGeneratingDataIds] = useState<Set<string>>(new Set());
  const [generatingEdgeCases, setGeneratingEdgeCases] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptFailures, setScriptFailures] = useState<{ title: string; error: string }[]>([]);

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Failed to load project");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  async function generateTestCases() {
    setGeneratingTestCases(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-testcases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Generation failed");
      }
      const { testCases } = await res.json();
      setData((prev) => (prev ? { ...prev, testCases } : prev));
      setActiveTab("testcases");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingTestCases(false);
    }
  }

  async function generateScript(tc: TestCase) {
    setGeneratingIds((prev) => new Set(prev).add(tc.id));
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tc.id }),
      });
      if (res.ok) {
        const script = await res.json();
        setData((prev) =>
          prev ? { ...prev, scripts: [...prev.scripts.filter((s) => s.testCaseId !== tc.id), script] } : prev
        );
      }
    } finally {
      setGeneratingIds((prev) => { const n = new Set(prev); n.delete(tc.id); return n; });
    }
  }

  async function generateAllScripts() {
    if (!data) return;
    setGeneratingAll(true);
    setError(null);
    setScriptFailures([]);

    try {
      const res = await fetch("/api/generate-scripts-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
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
            const event = JSON.parse(raw) as {
              type: string;
              testCaseId?: string;
              title?: string;
              status?: string;
              script?: import("@/lib/db/schema").AutomationScript;
              error?: string;
              succeeded?: number;
              failed?: number;
              total?: number;
            };

            if (event.type === "progress" && event.status === "done" && event.script) {
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      scripts: [
                        ...prev.scripts.filter((s) => s.testCaseId !== event.testCaseId),
                        event.script!,
                      ],
                    }
                  : prev
              );
              // Mark as generating in the table while in-flight
              if (event.testCaseId) {
                setGeneratingIds((prev) => { const n = new Set(prev); n.delete(event.testCaseId!); return n; });
              }
            }

            if (event.type === "progress" && event.status === "generating" && event.testCaseId) {
              setGeneratingIds((prev) => new Set(prev).add(event.testCaseId!));
            }

            if (event.type === "progress" && event.status === "error" && event.testCaseId) {
              setGeneratingIds((prev) => { const n = new Set(prev); n.delete(event.testCaseId!); return n; });
              setScriptFailures((prev) => [
                ...prev,
                { title: event.title ?? event.testCaseId!, error: event.error ?? "Unknown error" },
              ]);
            }

            if (event.type === "done") {
              if (event.failed && event.failed > 0) {
                setError(`${event.failed} of ${event.total} scripts failed. See details below.`);
              }
              setActiveTab("scripts");
            }
          } catch { /* ignore partial chunks */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingAll(false);
      setGeneratingIds(new Set());
    }
  }

  async function generateEdgeCases() {
    setGeneratingEdgeCases(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-edgecases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Edge case generation failed");
      setData((prev) =>
        prev ? { ...prev, testCases: [...prev.testCases, ...d.testCases] } : prev
      );
      setActiveTab("testcases");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingEdgeCases(false);
    }
  }

  async function generateTestData(tc: import("@/lib/db/schema").TestCase) {
    setGeneratingDataIds((prev) => new Set(prev).add(tc.id));
    try {
      const res = await fetch("/api/generate-testdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tc.id }),
      });
      if (res.ok) {
        const { testData } = await res.json();
        setData((prev) =>
          prev
            ? { ...prev, testCases: prev.testCases.map((t) => t.id === tc.id ? { ...t, testData } : t) }
            : prev
        );
      }
    } finally {
      setGeneratingDataIds((prev) => { const n = new Set(prev); n.delete(tc.id); return n; });
    }
  }

  async function deleteProject() {
    setDeleting(true);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/");
  }

  /* ── Loading / error states ─────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">← Back to Dashboard</Link>
        </Button>
      </div>
    );
  }
  if (!data) return null;

  const hasCrawled   = data.pages.length > 0;
  const hasTestCases = data.testCases.length > 0;
  const hasScripts   = data.scripts.length > 0;
  const approvedCount = data.testCases.filter((t) => t.status === "approved").length;
  const meta = statusMeta[data.status] ?? statusMeta.idle;

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        left={
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <Link href="/"><ArrowLeft className="h-3.5 w-3.5" /></Link>
            </Button>
            <span className="truncate text-sm font-medium">{data.name}</span>
            <span className={cn("hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block", meta.class)}>
              {meta.label}
            </span>
          </div>
        }
        right={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={deleting}
                title="Delete project"
              >
                {deleting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-destructive" />
                  Delete &quot;{data?.name}&quot;?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                <div className="space-y-2 pt-1 text-sm text-muted-foreground">
                  <p>This will permanently delete the project and all associated data:</p>
                  <ul className="ml-4 list-disc space-y-1 text-xs">
                    <li>{data?.pages.length ?? 0} crawled page{(data?.pages.length ?? 0) !== 1 ? "s" : ""}</li>
                    <li>{data?.testCases.length ?? 0} test case{(data?.testCases.length ?? 0) !== 1 ? "s" : ""}</li>
                    <li>{data?.scripts.length ?? 0} automation script{(data?.scripts.length ?? 0) !== 1 ? "s" : ""}</li>
                  </ul>
                  <p className="font-medium text-foreground">This action cannot be undone.</p>
                </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteProject}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, delete project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-5">

        {/* ── Stats row ───────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Globe,    value: data.pages.length,      label: "Pages crawled" },
            { icon: FileText, value: data.testCases.length,  label: `${approvedCount} approved` },
            { icon: Code2,    value: data.scripts.length,    label: "Scripts" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-none">{value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Action bar ──────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={generateTestCases}
            disabled={!hasCrawled || generatingTestCases}
            className="h-8 text-xs gap-1.5"
          >
            {generatingTestCases
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            Generate Test Cases
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={generateAllScripts}
            disabled={!hasTestCases || generatingAll}
            className="h-8 text-xs gap-1.5"
          >
            {generatingAll
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Code2 className="h-3.5 w-3.5" />}
            Generate All Scripts
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={generateEdgeCases}
            disabled={!hasCrawled || generatingEdgeCases}
            className="h-8 text-xs gap-1.5"
          >
            {generatingEdgeCases
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ShieldAlert className="h-3.5 w-3.5" />}
            Discover Edge Cases
          </Button>
          {hasScripts && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => (window.location.href = `/api/export/${id}?mode=framework`)}
              >
                <Download className="h-3.5 w-3.5" />
                Download Framework
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1.5 text-muted-foreground"
                onClick={() => (window.location.href = `/api/export/${id}?mode=flat`)}
              >
                <Download className="h-3.5 w-3.5" />
                Scripts only
              </Button>
            </>
          )}
          {hasTestCases && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => window.open(`/api/report/${id}?format=html`, "_blank")}
              >
                <BarChart2 className="h-3.5 w-3.5" />
                HTML Report
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => (window.location.href = `/api/report/${id}?format=excel`)}
              >
                <BarChart2 className="h-3.5 w-3.5" />
                Excel Report
              </Button>
            </>
          )}
        </div>

        {/* ── Error banner ────────────────────────────── */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
            {scriptFailures.length > 0 && (
              <div className="border-t border-destructive/20 divide-y divide-destructive/10">
                {scriptFailures.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2">
                    <span className="shrink-0 mt-0.5 font-medium w-32 truncate opacity-80">{f.title}</span>
                    <span className="opacity-70 leading-relaxed">{f.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8 text-xs">
            <TabsTrigger value="crawl" className="gap-1.5 text-xs px-3">
              <Globe className="h-3.5 w-3.5" />
              Site Map
              {hasCrawled && (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {data.pages.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="testcases" className="gap-1.5 text-xs px-3">
              <Sparkles className="h-3.5 w-3.5" />
              Test Cases
              {hasTestCases && (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {data.testCases.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="scripts" className="gap-1.5 text-xs px-3">
              <Code2 className="h-3.5 w-3.5" />
              Scripts
              {hasScripts && (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {data.scripts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="execution" className="gap-1.5 text-xs px-3">
              <Play className="h-3.5 w-3.5" />
              Execution
            </TabsTrigger>
          </TabsList>

          {/* Site Map tab */}
          <TabsContent value="crawl" className="mt-4 space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold">Browser Crawl</h3>
              <CrawlProgress projectId={id} onCrawlComplete={loadProject} />
            </div>

            {hasCrawled && (
              <div className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">Crawled Pages</h3>
                  <span className="text-xs text-muted-foreground">{data.pages.length} pages</span>
                </div>
                <div className="divide-y">
                  {data.pages.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.title || p.url}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.url}</p>
                      </div>
                      <div className="ml-4 flex shrink-0 gap-3 text-xs text-muted-foreground">
                        <span className="hidden sm:inline">
                          {(p.forms as unknown[])?.length ?? 0} forms
                        </span>
                        <span>{(p.interactiveElements as unknown[])?.length ?? 0} elements</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Test Cases tab */}
          <TabsContent value="testcases" className="mt-4 space-y-4">
            <ValidationPanel
              projectId={id}
              hasTestCases={hasTestCases}
              onDeleteIds={async (ids) => {
                await fetch("/api/testcases/bulk-delete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids }),
                });
                setData((prev) =>
                  prev ? { ...prev, testCases: prev.testCases.filter((t) => !ids.includes(t.id)) } : prev
                );
              }}
            />
            <div className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Test Cases</h3>
                {hasTestCases && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      {approvedCount} approved
                    </span>
                    <span>{data.testCases.length - approvedCount} draft</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                {hasTestCases && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Click a title to see details · Click the status pill to approve/draft · Hover a row for actions
                  </p>
                )}
                <TestCaseTable
                  projectId={id}
                  testCases={data.testCases}
                  onUpdate={(updated) =>
                    setData((prev) =>
                      prev ? { ...prev, testCases: prev.testCases.map((t) => t.id === updated.id ? updated : t) } : prev
                    )
                  }
                  onDelete={(deletedId) =>
                    setData((prev) =>
                      prev ? { ...prev, testCases: prev.testCases.filter((t) => t.id !== deletedId) } : prev
                    )
                  }
                  onGenerateScript={generateScript}
                  generatingIds={generatingIds}
                  onGenerateTestData={generateTestData}
                  generatingDataIds={generatingDataIds}
                />
              </div>
            </div>
          </TabsContent>

          {/* Scripts tab */}

          <TabsContent value="scripts" className="mt-4">
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Automation Scripts</h3>
              </div>
              <div className="p-4">
                <ScriptViewer
                  scripts={data.scripts}
                  testCases={data.testCases}
                  projectId={id}
                />
              </div>
            </div>
          </TabsContent>
          {/* Execution tab */}
          <TabsContent value="execution" className="mt-4">
            <ExecutionPanel
              projectId={id}
              hasApprovedCases={approvedCount > 0}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
