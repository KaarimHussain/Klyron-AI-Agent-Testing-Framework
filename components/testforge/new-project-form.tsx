"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, ChevronDown, ChevronUp, KeyRound, BookOpen, FileText, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [scopeNotes, setScopeNotes] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [userStory, setUserStory] = useState("");
  const [requirementDoc, setRequirementDoc] = useState("");
  const [apiDoc, setApiDoc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          targetUrl,
          scopeNotes: scopeNotes || undefined,
          loginUsername: loginUsername || undefined,
          loginPassword: loginPassword || undefined,
          userStory: userStory || undefined,
          requirementDoc: requirementDoc || undefined,
          apiDoc: apiDoc || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create project");
      }
      const project = await res.json();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold">New Project</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-medium">Project name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My App QA"
            className="h-8 text-sm"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="url" className="text-xs font-medium">Target URL</Label>
          <Input
            id="url"
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com"
            className="h-8 text-sm"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scope" className="text-xs font-medium">
            Scope notes{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="scope"
            value={scopeNotes}
            onChange={(e) => setScopeNotes(e.target.value)}
            placeholder="Focus on checkout flow, skip blog pages…"
            className="resize-none text-sm"
            rows={2}
          />
        </div>

        {/* Advanced Options Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors"
        >
          <span>Advanced options — credentials, user story, requirements</span>
          {showAdvanced ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
        </button>

        {showAdvanced && (
          <div className={cn("space-y-4 rounded-lg border bg-muted/30 p-4")}>
            {/* Login Credentials */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                Login Credentials
                <span className="font-normal text-muted-foreground">(for authenticated pages)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="login-user" className="text-[10px] text-muted-foreground">Username / Email</Label>
                  <Input
                    id="login-user"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="admin@example.com"
                    className="h-7 text-xs"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="login-pass" className="text-[10px] text-muted-foreground">Password</Label>
                  <Input
                    id="login-pass"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-7 text-xs"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            {/* User Story */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                User Story
              </div>
              <Textarea
                value={userStory}
                onChange={(e) => setUserStory(e.target.value)}
                placeholder="As a user, I want to… so that I can…"
                className="resize-none text-xs"
                rows={2}
              />
            </div>

            {/* Requirement Document */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Requirement Document
              </div>
              <Textarea
                value={requirementDoc}
                onChange={(e) => setRequirementDoc(e.target.value)}
                placeholder="Paste your requirements or acceptance criteria here…"
                className="resize-none text-xs"
                rows={3}
              />
            </div>

            {/* API Documentation */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                API Documentation
              </div>
              <Textarea
                value={apiDoc}
                onChange={(e) => setApiDoc(e.target.value)}
                placeholder="Paste relevant API endpoints, Swagger snippets, or OpenAPI spec…"
                className="resize-none text-xs"
                rows={3}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full h-8 text-sm">
          {loading ? (
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Creating…</>
          ) : (
            "Create Project →"
          )}
        </Button>
      </form>
    </div>
  );
}
