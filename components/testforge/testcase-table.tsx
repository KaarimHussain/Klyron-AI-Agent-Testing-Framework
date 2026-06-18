"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Pencil, Trash2, Check, X, Code, ArrowUpDown, CheckCircle2, Clock } from "lucide-react";
import type { TestCase } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

interface TestCaseTableProps {
  projectId: string;
  testCases: TestCase[];
  onUpdate: (updated: TestCase) => void;
  onDelete: (id: string) => void;
  onGenerateScript: (tc: TestCase) => void;
  generatingIds: Set<string>;
}

const priorityColor: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const typeColor: Record<string, string> = {
  functional: "bg-green-100 text-green-700 border-green-200",
  ui: "bg-purple-100 text-purple-700 border-purple-200",
  negative: "bg-orange-100 text-orange-700 border-orange-200",
  "edge-case": "bg-pink-100 text-pink-700 border-pink-200",
};

export function TestCaseTable({
  testCases,
  onUpdate,
  onDelete,
  onGenerateScript,
  generatingIds,
}: TestCaseTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<TestCase>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [detailTc, setDetailTc] = useState<TestCase | null>(null);
  const [sortField, setSortField] = useState<"priority" | "type" | "module" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function startEdit(tc: TestCase) {
    setEditingId(tc.id);
    setEditValues({ title: tc.title, module: tc.module, priority: tc.priority, status: tc.status });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function saveEdit(tc: TestCase) {
    setSavingId(tc.id);
    try {
      const res = await fetch(`/api/testcases/${tc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
      }
    } finally {
      setSavingId(null);
      setEditingId(null);
      setEditValues({});
    }
  }

  async function deleteCase(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/testcases/${id}`, { method: "DELETE" });
      onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleStatus(tc: TestCase) {
    if (togglingIds.has(tc.id)) return;
    setTogglingIds((prev) => new Set(prev).add(tc.id));
    try {
      const next = tc.status === "draft" ? "approved" : "draft";
      const res = await fetch(`/api/testcases/${tc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) onUpdate(await res.json());
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(tc.id);
        return next;
      });
    }
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = [...testCases].sort((a, b) => {
    if (!sortField) return 0;
    const av = a[sortField] as string;
    const bv = b[sortField] as string;
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  if (testCases.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No test cases yet. Generate them after crawling the site.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Title</TableHead>
              <TableHead>
                <button
                  className="flex items-center gap-1 text-xs font-medium"
                  onClick={() => toggleSort("module")}
                >
                  Module <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="flex items-center gap-1 text-xs font-medium"
                  onClick={() => toggleSort("type")}
                >
                  Type <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="flex items-center gap-1 text-xs font-medium"
                  onClick={() => toggleSort("priority")}
                >
                  Priority <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((tc) => (
              <TableRow key={tc.id} className="group">
                <TableCell>
                  {editingId === tc.id ? (
                    <Input
                      value={editValues.title ?? tc.title}
                      onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                      className="h-7 text-sm"
                    />
                  ) : (
                    <button
                      className="text-left text-sm font-medium hover:text-primary hover:underline"
                      onClick={() => setDetailTc(tc)}
                    >
                      {tc.title}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {editingId === tc.id ? (
                    <Input
                      value={editValues.module ?? tc.module}
                      onChange={(e) => setEditValues((v) => ({ ...v, module: e.target.value }))}
                      className="h-7 text-sm"
                    />
                  ) : (
                    tc.module
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={cn("text-xs border", typeColor[tc.type])} variant="outline">
                    {tc.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  {editingId === tc.id ? (
                    <Select
                      value={editValues.priority ?? tc.priority}
                      onValueChange={(v) =>
                        setEditValues((prev) => ({
                          ...prev,
                          priority: v as TestCase["priority"],
                        }))
                      }
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      className={cn("text-xs border", priorityColor[tc.priority])}
                      variant="outline"
                    >
                      {tc.priority}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => toggleStatus(tc)}
                    disabled={togglingIds.has(tc.id)}
                    title={tc.status === "approved" ? "Click to set back to draft" : "Click to approve"}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      togglingIds.has(tc.id)
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:opacity-80 active:scale-95",
                      tc.status === "approved"
                        ? "border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "border-border bg-muted text-muted-foreground hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                    )}
                  >
                    {togglingIds.has(tc.id) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : tc.status === "approved" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {tc.status === "approved" ? "Approved" : "Draft"}
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {editingId === tc.id ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => saveEdit(tc)}
                          disabled={savingId === tc.id}
                        >
                          {savingId === tc.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3 text-green-600" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={cancelEdit}
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={() => startEdit(tc)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={() => onGenerateScript(tc)}
                          disabled={generatingIds.has(tc.id)}
                          title="Generate script"
                        >
                          {generatingIds.has(tc.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Code className="h-3 w-3 text-primary" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-destructive"
                          onClick={() => deleteCase(tc.id)}
                          disabled={deletingId === tc.id}
                        >
                          {deletingId === tc.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!detailTc} onOpenChange={() => setDetailTc(null)}>
        {detailTc && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">{detailTc.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Badge className={cn("text-xs border", typeColor[detailTc.type])} variant="outline">
                  {detailTc.type}
                </Badge>
                <Badge
                  className={cn("text-xs border", priorityColor[detailTc.priority])}
                  variant="outline"
                >
                  {detailTc.priority}
                </Badge>
              </div>
              {detailTc.preconditions && (
                <div>
                  <p className="font-medium text-muted-foreground">Preconditions</p>
                  <p>{detailTc.preconditions}</p>
                </div>
              )}
              <div>
                <p className="font-medium text-muted-foreground">Steps</p>
                <ol className="ml-4 list-decimal space-y-1">
                  {(detailTc.steps as string[]).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Expected Result</p>
                <p>{detailTc.expectedResult}</p>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
