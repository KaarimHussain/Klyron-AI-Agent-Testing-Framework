export const runtime = "nodejs";

import { db } from "@/lib/db/client";
import { projects, testCases, automationScripts, testRuns, testResults } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { Defect } from "@/lib/db/schema";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "html"; // "html" | "excel"

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  const cases = await db.select().from(testCases).where(eq(testCases.projectId, projectId));
  const scripts = await db.select().from(automationScripts).where(eq(automationScripts.projectId, projectId));
  const runs = await db.select().from(testRuns).where(eq(testRuns.projectId, projectId)).orderBy(desc(testRuns.createdAt)).limit(5);

  const latestRun = runs[0] ?? null;
  const results = latestRun
    ? await db.select().from(testResults).where(eq(testResults.runId, latestRun.id))
    : [];

  const generatedAt = new Date().toLocaleString();
  const approvedCount = cases.filter((c) => c.status === "approved").length;

  if (format === "excel") {
    // Dynamically import xlsx to avoid build-time issues
    const XLSX = await import("xlsx");

    const wb = XLSX.utils.book_new();

    // Sheet 1: Project Summary
    const summaryData = [
      ["Project Name", project.name],
      ["Target URL", project.targetUrl],
      ["Report Generated", generatedAt],
      ["Total Test Cases", cases.length],
      ["Approved", approvedCount],
      ["Draft", cases.length - approvedCount],
      ["Scripts Generated", scripts.length],
      ["Execution Runs", runs.length],
      ...(latestRun
        ? [
            ["Latest Run Status", latestRun.status],
            ["Latest Run Passed", latestRun.passed],
            ["Latest Run Failed", latestRun.failed],
          ]
        : []),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Sheet 2: Test Cases
    const caseHeaders = ["ID", "Title", "Module", "Type", "Priority", "Status", "Steps Count", "Expected Result"];
    const caseRows = cases.map((tc) => [
      tc.id,
      tc.title,
      tc.module,
      tc.type,
      tc.priority,
      tc.status,
      (tc.steps as string[]).length,
      tc.expectedResult,
    ]);
    const wsCases = XLSX.utils.aoa_to_sheet([caseHeaders, ...caseRows]);
    XLSX.utils.book_append_sheet(wb, wsCases, "Test Cases");

    // Sheet 3: Execution Results
    if (results.length > 0) {
      const resultHeaders = ["Title", "Status", "Duration (ms)", "Defects", "Error Message"];
      const resultRows = results.map((r) => [
        r.title,
        r.status,
        r.durationMs ?? "",
        (r.defects as Defect[] | null)?.length ?? 0,
        r.errorMessage ?? "",
      ]);
      const wsResults = XLSX.utils.aoa_to_sheet([resultHeaders, ...resultRows]);
      XLSX.utils.book_append_sheet(wb, wsResults, "Execution Results");
    }

    // Sheet 4: Defects
    const allDefects: Array<[string, string, string, string]> = [];
    for (const r of results) {
      const defects = (r.defects as Defect[] | null) ?? [];
      for (const d of defects) {
        allDefects.push([r.title, d.type, d.severity, d.description]);
      }
    }
    if (allDefects.length > 0) {
      const wsDefects = XLSX.utils.aoa_to_sheet([
        ["Test Case", "Defect Type", "Severity", "Description"],
        ...allDefects,
      ]);
      XLSX.utils.book_append_sheet(wb, wsDefects, "Defects");
    }

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
    const uint8 = new Uint8Array(buf);
    return new Response(uint8.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="klyron-report-${project.name.replace(/\s+/g, "-")}.xlsx"`,
      },
    });
  }

  // ── HTML Report ─────────────────────────────────────────────────────────────
  const passRate = results.length > 0
    ? Math.round((results.filter((r) => r.status === "passed").length / results.length) * 100)
    : null;

  const allDefects = results.flatMap((r) =>
    ((r.defects as Defect[] | null) ?? []).map((d) => ({ ...d, testTitle: r.title }))
  );

  const resultRows = results
    .map(
      (r) => `
      <tr class="${r.status === "passed" ? "pass" : r.status === "failed" ? "fail" : "error"}">
        <td>${escHtml(r.title)}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>${r.durationMs ?? "—"}ms</td>
        <td>${((r.defects as Defect[] | null) ?? []).length}</td>
        <td class="error-msg">${r.errorMessage ? escHtml(r.errorMessage) : "—"}</td>
      </tr>`
    )
    .join("");

  const defectRows = allDefects
    .map(
      (d) => `
      <tr>
        <td>${escHtml(d.testTitle)}</td>
        <td>${d.type}</td>
        <td><span class="badge ${d.severity}">${d.severity}</span></td>
        <td>${escHtml(d.description)}</td>
      </tr>`
    )
    .join("");

  const caseRows = cases
    .map(
      (tc) => `
      <tr>
        <td>${escHtml(tc.title)}</td>
        <td>${tc.module}</td>
        <td><span class="badge ${tc.type}">${tc.type}</span></td>
        <td><span class="badge ${tc.priority}">${tc.priority}</span></td>
        <td><span class="badge ${tc.status}">${tc.status}</span></td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Klyron Report — ${escHtml(project.name)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e2e8f0;line-height:1.6}
  .wrap{max-width:1100px;margin:0 auto;padding:40px 24px}
  h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}
  .meta{font-size:.8rem;color:#64748b;margin-bottom:32px}
  h2{font-size:1rem;font-weight:600;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid #1e293b}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:32px}
  .stat{background:#1e293b;border-radius:10px;padding:16px;text-align:center}
  .stat-val{font-size:2rem;font-weight:700;line-height:1}
  .stat-label{font-size:.75rem;color:#94a3b8;margin-top:4px}
  .green{color:#22c55e}.red{color:#ef4444}.blue{color:#3b82f6}.yellow{color:#eab308}
  table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:10px;overflow:hidden;font-size:.8rem}
  th{background:#0f172a;padding:10px 14px;text-align:left;font-weight:600;color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
  td{padding:9px 14px;border-top:1px solid #0f172a}
  tr.pass td{background:#052e16}tr.fail td{background:#450a0a}tr.error td{background:#431407}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:600}
  .badge.passed,.badge.approved{background:#052e16;color:#22c55e}
  .badge.failed,.badge.critical{background:#450a0a;color:#ef4444}
  .badge.error,.badge.major{background:#431407;color:#f97316}
  .badge.draft,.badge.minor{background:#422006;color:#eab308}
  .badge.functional{background:#1e3a5f;color:#60a5fa}
  .badge.ui,.badge.edge-case{background:#2d1b69;color:#a78bfa}
  .badge.negative{background:#2d1b18;color:#f97316}
  .badge.high{background:#450a0a;color:#ef4444}
  .badge.medium{background:#422006;color:#eab308}
  .badge.low{background:#1e3a5f;color:#60a5fa}
  .badge.webkit,.badge.chromium,.badge.firefox{background:#1e293b;color:#94a3b8}
  .error-msg{font-size:.7rem;color:#94a3b8;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  footer{margin-top:40px;text-align:center;font-size:.75rem;color:#334155}
</style>
</head>
<body>
<div class="wrap">
  <h1>Klyron Test Report — ${escHtml(project.name)}</h1>
  <div class="meta">Generated ${generatedAt} &nbsp;·&nbsp; ${escHtml(project.targetUrl)}</div>

  <div class="stats">
    <div class="stat"><div class="stat-val">${cases.length}</div><div class="stat-label">Test Cases</div></div>
    <div class="stat"><div class="stat-val green">${approvedCount}</div><div class="stat-label">Approved</div></div>
    <div class="stat"><div class="stat-val blue">${scripts.length}</div><div class="stat-label">Scripts</div></div>
    ${passRate !== null ? `<div class="stat"><div class="stat-val ${passRate >= 80 ? "green" : passRate >= 50 ? "yellow" : "red"}">${passRate}%</div><div class="stat-label">Pass Rate</div></div>` : ""}
    ${allDefects.length > 0 ? `<div class="stat"><div class="stat-val red">${allDefects.length}</div><div class="stat-label">Defects Found</div></div>` : ""}
  </div>

  ${results.length > 0 ? `
  <h2>Execution Results${latestRun ? ` (Run ${new Date(latestRun.createdAt).toLocaleString()} — ${latestRun.browser})` : ""}</h2>
  <table>
    <thead><tr><th>Test Case</th><th>Status</th><th>Duration</th><th>Defects</th><th>Error</th></tr></thead>
    <tbody>${resultRows}</tbody>
  </table>` : ""}

  ${allDefects.length > 0 ? `
  <h2>Defect Report (${allDefects.length} defects)</h2>
  <table>
    <thead><tr><th>Test Case</th><th>Type</th><th>Severity</th><th>Description</th></tr></thead>
    <tbody>${defectRows}</tbody>
  </table>` : ""}

  <h2>Test Cases (${cases.length})</h2>
  <table>
    <thead><tr><th>Title</th><th>Module</th><th>Type</th><th>Priority</th><th>Status</th></tr></thead>
    <tbody>${caseRows}</tbody>
  </table>

  <footer>Generated by <strong>Klyron</strong> · AI-Powered QA Agent</footer>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="klyron-report-${project.name.replace(/\s+/g, "-")}.html"`,
    },
  });
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
