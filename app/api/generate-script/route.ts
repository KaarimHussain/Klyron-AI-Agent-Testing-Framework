export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { projects, sitePages, testCases, automationScripts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { openrouter, DEFAULT_MODEL } from "@/lib/llm/client";
import { scriptOutputJsonSchema, ScriptOutputSchema } from "@/lib/llm/schemas";
import { buildScriptPrompt } from "@/lib/llm/prompts";
import { z } from "zod";

const RequestSchema = z.object({
  testCaseId: z.string(),
  model: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { testCaseId, model = DEFAULT_MODEL } = parsed.data;

  const [tc] = await db.select().from(testCases).where(eq(testCases.id, testCaseId));
  if (!tc) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, tc.projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const pages = await db.select().from(sitePages).where(eq(sitePages.projectId, tc.projectId));

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
    pages.map((p) => ({
      url: p.url,
      title: p.title ?? "",
      headings: (p.headings as string[]) ?? [],
      forms: (p.forms as never) ?? [],
      interactiveElements: (p.interactiveElements as never) ?? [],
    })),
    project.targetUrl
  );

  async function callLLM(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
    return openrouter.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: scriptOutputJsonSchema,
      },
    });
  }

  try {
    const messages = [
      { role: "system" as const, content: "You are a test automation engineer. Return only valid JSON." },
      { role: "user" as const, content: prompt },
    ];

    let res = await callLLM(messages);
    let raw = res.choices[0]?.message?.content ?? "";

    let parsed2 = ScriptOutputSchema.safeParse(JSON.parse(raw));
    if (!parsed2.success) {
      const repairRes = await callLLM([
        ...messages,
        { role: "assistant" as const, content: raw },
        {
          role: "user" as const,
          content: `Invalid JSON: ${JSON.stringify(parsed2.error.flatten())}. Return corrected JSON only.`,
        },
      ]);
      raw = repairRes.choices[0]?.message?.content ?? "";
      parsed2 = ScriptOutputSchema.safeParse(JSON.parse(raw));
      if (!parsed2.success) {
        return NextResponse.json({ error: "LLM returned invalid schema after repair" }, { status: 500 });
      }
    }

    // Upsert — replace existing script for same test case
    await db.delete(automationScripts).where(eq(automationScripts.testCaseId, testCaseId));

    const [script] = await db
      .insert(automationScripts)
      .values({
        testCaseId,
        projectId: tc.projectId,
        fileName: parsed2.data.fileName,
        code: parsed2.data.code,
        model,
      })
      .returning();

    return NextResponse.json(script);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
