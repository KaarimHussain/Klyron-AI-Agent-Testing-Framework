// NOTE: This route MUST use Node.js runtime — Playwright requires a real browser process.
// Vercel: set maxDuration = 300 and use a Pro/Enterprise plan. For very long crawls
// consider a long-lived server instead of a standard serverless function.
export const runtime = "nodejs";
export const maxDuration = 300;

import { db } from "@/lib/db/client";
import { projects, sitePages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { crawlSite, CrawlError, type CrawlProgressEvent } from "@/lib/browser/crawler";
import { z } from "zod";

const CrawlRequestSchema = z.object({
  projectId: z.string(),
  maxPages: z.number().int().min(1).max(50).optional(),
  maxDepth: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = CrawlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { projectId, maxPages, maxDepth } = parsed.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CrawlProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected — ignore write errors
        }
      };

      try {
        await db.update(projects).set({ status: "crawling" }).where(eq(projects.id, projectId));

        const pages = await crawlSite(project.targetUrl, {
          maxPages,
          maxDepth,
          onProgress: send,
          credentials:
            project.loginUsername && project.loginPassword
              ? { username: project.loginUsername, password: project.loginPassword }
              : undefined,
        });

        // Persist — replace any previous crawl data
        await db.delete(sitePages).where(eq(sitePages.projectId, projectId));
        for (const p of pages) {
          await db.insert(sitePages).values({
            projectId,
            url: p.url,
            title: p.title,
            headings: p.headings,
            forms: p.forms,
            interactiveElements: p.interactiveElements,
          });
        }

        await db.update(projects).set({ status: "crawled" }).where(eq(projects.id, projectId));
        send({ type: "done", message: `Saved ${pages.length} pages to the database.` });

      } catch (err) {
        // Mark project as errored
        try {
          await db.update(projects).set({ status: "error" }).where(eq(projects.id, projectId));
        } catch { /* ignore DB errors during cleanup */ }

        // Build a clean user-facing error message
        let userMessage: string;
        if (err instanceof CrawlError) {
          userMessage = err.message;
        } else if (err instanceof Error) {
          userMessage = `Crawl failed: ${err.message}`;
        } else {
          userMessage = "An unexpected error occurred during the crawl.";
        }

        send({ type: "error", message: userMessage });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering if behind a proxy
    },
  });
}
