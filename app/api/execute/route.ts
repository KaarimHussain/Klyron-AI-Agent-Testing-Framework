export const runtime = "nodejs";
export const maxDuration = 300;

import { db } from "@/lib/db/client";
import { projects, testCases, automationScripts, testRuns, testResults } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeTestCase, type SupportedBrowser } from "@/lib/browser/executor";
import { z } from "zod";

const RequestSchema = z.object({
  projectId: z.string(),
  browser: z.enum(["chromium", "firefox", "webkit"]).optional().default("chromium"),
  runOnlyApproved: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const { projectId, browser, runOnlyApproved } = parsed.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });
  }

  const allCases = await db.select().from(testCases).where(
    runOnlyApproved
      ? and(eq(testCases.projectId, projectId), eq(testCases.status, "approved"))
      : eq(testCases.projectId, projectId)
  );

  if (allCases.length === 0) {
    return new Response(
      JSON.stringify({ error: runOnlyApproved ? "No approved test cases found." : "No test cases found." }),
      { status: 400 }
    );
  }

  // Create run record
  const [run] = await db
    .insert(testRuns)
    .values({ projectId, browser, totalTests: String(allCases.length) })
    .returning();

  await db.update(testRuns).set({ status: "running" }).where(eq(testRuns.id, run.id));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* client disconnected */ }
      };

      send({ type: "start", runId: run.id, total: allCases.length, browser });

      let passed = 0;
      let failed = 0;
      let errored = 0;

      for (const tc of allCases) {
        send({ type: "progress", testCaseId: tc.id, title: tc.title, status: "running" });

        // Find matching script
        const [script] = await db
          .select()
          .from(automationScripts)
          .where(eq(automationScripts.testCaseId, tc.id));

        try {
          const result = await executeTestCase(
            tc.steps as string[],
            tc.expectedResult,
            { browser: browser as SupportedBrowser, baseUrl: project.targetUrl }
          );

          const [saved] = await db
            .insert(testResults)
            .values({
              runId: run.id,
              projectId,
              testCaseId: tc.id,
              scriptId: script?.id ?? null,
              title: tc.title,
              status: result.status === "error" ? "error" : result.status,
              durationMs: String(result.durationMs),
              errorMessage: result.errorMessage ?? null,
              screenshotBase64: result.screenshotBase64 ?? null,
              consoleErrors: result.consoleErrors,
              networkErrors: result.networkErrors,
              defects: result.defects,
            })
            .returning();

          if (result.status === "passed") passed++;
          else if (result.status === "failed") failed++;
          else errored++;

          send({
            type: "progress",
            testCaseId: tc.id,
            title: tc.title,
            status: result.status,
            resultId: saved.id,
            durationMs: result.durationMs,
            defects: result.defects.length,
            errorMessage: result.errorMessage,
          });

        } catch (err) {
          errored++;
          send({
            type: "progress",
            testCaseId: tc.id,
            title: tc.title,
            status: "error",
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Finalize run
      await db.update(testRuns).set({
        status: errored + failed > 0 ? "failed" : "completed",
        passed: String(passed),
        failed: String(failed + errored),
        skipped: "0",
        completedAt: new Date(),
      }).where(eq(testRuns.id, run.id));

      send({ type: "done", runId: run.id, passed, failed, errored, total: allCases.length });

      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
