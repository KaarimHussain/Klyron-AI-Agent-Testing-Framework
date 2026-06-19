export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { projects, sitePages, testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { openrouter } from "@/lib/llm/client";
import { getActiveModel } from "@/lib/db/settings";
import { testCaseListJsonSchema, TestCaseListSchema } from "@/lib/llm/schemas";
import { buildTestCasePrompt } from "@/lib/llm/prompts";
import { z } from "zod";

const RequestSchema = z.object({
  projectId: z.string(),
  model: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, model: modelOverride } = parsed.data;
  const model = modelOverride ?? await getActiveModel();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const pages = await db.select().from(sitePages).where(eq(sitePages.projectId, projectId));
  if (pages.length === 0) {
    return NextResponse.json({ error: "No crawled pages found — run crawl first" }, { status: 400 });
  }

  await db.update(projects).set({ status: "generating" }).where(eq(projects.id, projectId));

  const prompt = buildTestCasePrompt(
    pages.map((p) => ({
      url: p.url,
      title: p.title ?? "",
      headings: (p.headings as string[]) ?? [],
      forms: (p.forms as never) ?? [],
      interactiveElements: (p.interactiveElements as never) ?? [],
    })),
    project.scopeNotes,
    {
      userStory: project.userStory,
      requirementDoc: project.requirementDoc,
      apiDoc: project.apiDoc,
    }
  );

  async function callLLM(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
    return openrouter.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: testCaseListJsonSchema,
      },
    });
  }

  let raw: string;
  try {
    const messages = [
      { role: "system" as const, content: "You are a QA expert. Return only valid JSON." },
      { role: "user" as const, content: prompt },
    ];
    const res = await callLLM(messages);
    raw = res.choices[0]?.message?.content ?? "";

    // Repair pass if needed
    let parsed2 = TestCaseListSchema.safeParse(JSON.parse(raw));
    if (!parsed2.success) {
      const repairRes = await callLLM([
        ...messages,
        { role: "assistant" as const, content: raw },
        {
          role: "user" as const,
          content: `The JSON was invalid: ${JSON.stringify(parsed2.error.flatten())}. Return corrected JSON only.`,
        },
      ]);
      raw = repairRes.choices[0]?.message?.content ?? "";
      parsed2 = TestCaseListSchema.safeParse(JSON.parse(raw));
      if (!parsed2.success) {
        await db.update(projects).set({ status: "error" }).where(eq(projects.id, projectId));
        return NextResponse.json({ error: "LLM returned invalid schema after repair" }, { status: 500 });
      }
    }

    // Delete old draft test cases
    await db.delete(testCases).where(eq(testCases.projectId, projectId));

    const inserted = await Promise.all(
      parsed2.data.testCases.map((tc) =>
        db
          .insert(testCases)
          .values({
            projectId,
            title: tc.title,
            module: tc.module,
            type: tc.type,
            preconditions: tc.preconditions,
            steps: tc.steps,
            expectedResult: tc.expectedResult,
            priority: tc.priority,
            status: "draft",
          })
          .returning()
      )
    );

    await db.update(projects).set({ status: "ready" }).where(eq(projects.id, projectId));

    return NextResponse.json({ testCases: inserted.map((r) => r[0]) });
  } catch (err) {
    await db.update(projects).set({ status: "error" }).where(eq(projects.id, projectId));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
