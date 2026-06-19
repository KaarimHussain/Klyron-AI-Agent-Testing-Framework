export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { projects, sitePages, testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { openrouter } from "@/lib/llm/client";
import { getActiveModel } from "@/lib/db/settings";
import { TestCaseListSchema, testCaseListJsonSchema } from "@/lib/llm/schemas";
import { buildEdgeCaseSystemPrompt } from "@/lib/edge-cases/patterns";
import { z } from "zod";

const RequestSchema = z.object({ projectId: z.string() });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = parsed.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const pages = await db.select().from(sitePages).where(eq(sitePages.projectId, projectId));
  if (pages.length === 0) {
    return NextResponse.json({ error: "No crawled pages — run crawl first" }, { status: 400 });
  }

  const model = await getActiveModel();

  const siteMapSummary = pages
    .map((p) => {
      const forms = (p.forms as { selector: string; fields: { name: string; type: string; label: string; selector: string }[] }[] | null) ?? [];
      const formSummary = forms
        .map(
          (f) =>
            `  Form[${f.selector}]: fields=[${f.fields.map((field) => `${field.label || field.name}(${field.type})`).join(", ")}]`
        )
        .join("\n");
      return `Page: ${p.url}\nTitle: ${p.title}\n${formSummary}`;
    })
    .join("\n\n---\n\n");

  const edgeSystemPrompt = buildEdgeCaseSystemPrompt();

  const prompt = `${edgeSystemPrompt}

TARGET SITE:
${siteMapSummary}

Generate 8–15 edge case test cases. Use ONLY the selectors and fields that appear in the site map.
Each test case MUST belong to one of: boundary, security, session, or network edge case categories.
Set type to "edge-case" for all generated test cases.
Return JSON matching the schema exactly.`;

  try {
    const res = await openrouter.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a security-focused QA engineer. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: testCaseListJsonSchema },
    });

    const raw = res.choices[0]?.message?.content ?? "";
    const validated = TestCaseListSchema.safeParse(JSON.parse(raw));
    if (!validated.success) {
      return NextResponse.json({ error: "LLM returned invalid schema" }, { status: 500 });
    }

    // Force all to edge-case type and insert
    const inserted = await Promise.all(
      validated.data.testCases.map((tc) =>
        db
          .insert(testCases)
          .values({
            projectId,
            title: tc.title,
            module: tc.module,
            type: "edge-case",
            preconditions: tc.preconditions,
            steps: tc.steps,
            expectedResult: tc.expectedResult,
            priority: tc.priority,
            status: "draft",
          })
          .returning()
      )
    );

    return NextResponse.json({ testCases: inserted.map((r) => r[0]) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
