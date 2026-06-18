import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { NewProjectForm } from "@/components/testforge/new-project-form";
import { Navbar } from "@/components/testforge/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Globe, Sparkles, Code2, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusMeta: Record<string, { label: string; class: string }> = {
  idle:       { label: "Idle",       class: "bg-muted text-muted-foreground" },
  crawling:   { label: "Crawling…",  class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  crawled:    { label: "Crawled",    class: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  generating: { label: "Generating…",class: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  ready:      { label: "Ready",      class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  error:      { label: "Error",      class: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export default async function DashboardPage() {
  let allProjects: (typeof projects.$inferSelect)[] = [];
  try {
    allProjects = await db.select().from(projects).orderBy(desc(projects.createdAt));
  } catch {
    // DB not yet connected — show empty state gracefully
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Point Klyron at any site — get a full test plan and Playwright suite out the other end.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ── New project form ─────────────────────────── */}
          <div className="lg:col-span-1">
            <NewProjectForm />
          </div>

          {/* ── Project list ─────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Projects
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {allProjects.length}
              </span>
            </div>

            {allProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
                <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No projects yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Create one using the form on the left.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {allProjects.map((p) => {
                  const meta = statusMeta[p.status] ?? statusMeta.idle;
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="group flex items-center gap-4 rounded-xl border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm"
                    >
                      {/* Icon */}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Globe className="h-4 w-4 text-primary" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{p.targetUrl}</p>
                      </div>

                      {/* Status + date + arrow */}
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={cn("hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block", meta.class)}>
                          {meta.label}
                        </span>
                        <span className="hidden text-xs text-muted-foreground/60 md:block">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── How it works ─────────────────────────────── */}
        <div className="mt-12 rounded-xl border bg-muted/30 p-6">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            How it works
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Globe,    step: "1", title: "Crawl",    desc: "Playwright maps every page, form, and element on your site." },
              { icon: Sparkles, step: "2", title: "Generate", desc: "DeepSeek turns the site map into structured test cases you can edit." },
              { icon: Code2,    step: "3", title: "Automate", desc: "Approve test cases, generate Playwright scripts, download the suite." },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {step}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <p className="text-sm font-semibold">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
