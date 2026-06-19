export const runtime = "nodejs";
export const maxDuration = 300;

import { db } from "@/lib/db/client";
import { projects, sitePages, testCases, automationScripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { openrouter } from "@/lib/llm/client";
import { getActiveModel } from "@/lib/db/settings";
import { scriptOutputJsonSchema, ScriptOutputSchema } from "@/lib/llm/schemas";
import { buildScriptPrompt } from "@/lib/llm/prompts";
import { z } from "zod";
import type { CrawledPage } from "@/lib/browser/crawler";

const RequestSchema = z.object({
  projectId: z.string(),
  model: z.string().optional(),
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

  const { projectId, model: modelOverride } = parsed.data;
  const model = modelOverride ?? await getActiveModel();

  // ── Fetch everything once ─────────────────────────────────────────────────
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404 });
  }

  const pages = await db.select().from(sitePages).where(eq(sitePages.projectId, projectId));
  if (pages.length === 0) {
    return new Response(JSON.stringify({ error: "No crawled pages — run the crawl first" }), { status: 400 });
  }

  const cases = await db.select().from(testCases).where(eq(testCases.projectId, projectId));
  if (cases.length === 0) {
    return new Response(JSON.stringify({ error: "No test cases found" }), { status: 400 });
  }

  const existingScripts = await db
    .select()
    .from(automationScripts)
    .where(eq(automationScripts.projectId, projectId));

  const pending = cases.filter(
    (tc) => !existingScripts.find((s) => s.testCaseId === tc.id)
  );

  if (pending.length === 0) {
    return new Response(JSON.stringify({ error: "All test cases already have scripts" }), { status: 400 });
  }

  const siteMap: CrawledPage[] = pages.map((p) => ({
    url: p.url,
    title: p.title ?? "",
    headings: (p.headings as string[]) ?? [],
    forms: (p.forms as CrawledPage["forms"]) ?? [],
    interactiveElements: (p.interactiveElements as CrawledPage["interactiveElements"]) ?? [],
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* client disconnected */ }
      };

      send({ type: "start", total: pending.length });

      let succeeded = 0;
      let failed = 0;

      for (const tc of pending) {
        send({ type: "progress", testCaseId: tc.id, title: tc.title, status: "generating" });

        try {
          const prompt = buildScriptPrompt(
            {
              title: tc.title,
              module: tc.module,
              type: tc.type,
              preconditions: tc.preconditions,
              steps: tc.steps as string[],
              expectedResult: tc.expectedResult,
              priority: tc.priority,
            },
            siteMap,
            project.targetUrl
          );

          const messages = [
            { role: "system" as const, content: "You are a test automation engineer. Return only valid JSON." },
            { role: "user" as const, content: prompt },
          ];

          let res = await openrouter.chat.completions.create({
            model,
            messages,
            response_format: { type: "json_schema", json_schema: scriptOutputJsonSchema },
          });

          let raw = res.choices[0]?.message?.content ?? "";
          let validated = ScriptOutputSchema.safeParse(JSON.parse(raw));

          if (!validated.success) {
            const repairRes = await openrouter.chat.completions.create({
              model,
              messages: [
                ...messages,
                { role: "assistant" as const, content: raw },
                {
                  role: "user" as const,
                  content: `Invalid JSON: ${JSON.stringify(validated.error.flatten())}. Return corrected JSON only.`,
                },
              ],
              response_format: { type: "json_schema", json_schema: scriptOutputJsonSchema },
            });
            raw = repairRes.choices[0]?.message?.content ?? "";
            validated = ScriptOutputSchema.safeParse(JSON.parse(raw));
          }

          if (!validated.success) {
            throw new Error("LLM returned invalid schema after repair");
          }

          // Upsert — remove old script for this test case if exists
          await db.delete(automationScripts).where(eq(automationScripts.testCaseId, tc.id));
          const [script] = await db
            .insert(automationScripts)
            .values({
              testCaseId: tc.id,
              projectId,
              fileName: validated.data.fileName,
              code: validated.data.code,
              model,
            })
            .returning();

          succeeded++;
          send({ type: "progress", testCaseId: tc.id, title: tc.title, status: "done", script });

        } catch (err) {
          failed++;
          send({
            type: "progress",
            testCaseId: tc.id,
            title: tc.title,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      send({ type: "done", succeeded, failed, total: pending.length });
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
