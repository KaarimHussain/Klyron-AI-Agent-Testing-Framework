export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { openrouter } from "@/lib/llm/client";
import { getActiveModel } from "@/lib/db/settings";
import { ValidationResultSchema, validationResultJsonSchema } from "@/lib/llm/schemas";
import { z } from "zod";

const RequestSchema = z.object({ projectId: z.string() });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = parsed.data;
  const cases = await db.select().from(testCases).where(eq(testCases.projectId, projectId));

  if (cases.length === 0) {
    return NextResponse.json({ error: "No test cases found — generate test cases first." }, { status: 400 });
  }

  const model = await getActiveModel();

  const casesSummary = cases
    .map(
      (tc, i) =>
        `[${i}] Title: ${tc.title}\n    Module: ${tc.module}\n    Type: ${tc.type}\n    Steps: ${(tc.steps as string[]).join(" → ")}\n    Expected: ${tc.expectedResult}`
    )
    .join("\n\n");

  const prompt = `You are a senior QA lead reviewing a set of test cases. Analyze the list below and return a structured validation report.

TEST CASES (0-indexed):
${casesSummary}

Your tasks:
1. Identify DUPLICATE groups — test cases that test the same scenario with minimal difference. Use the 0-based indices.
2. Identify COVERAGE GAPS — important flows, edge cases, or modules not covered by any test case.
3. Suggest IMPROVEMENTS for specific test cases (reference by 0-based index).
4. Rate overall coverage: Excellent (>90% covered), Good (70-90%), Moderate (50-70%), Poor (<50%).
5. Write a short summary of your findings.

Return JSON matching the schema exactly.`;

  try {
    const res = await openrouter.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a QA expert. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: validationResultJsonSchema },
    });

    const raw = res.choices[0]?.message?.content ?? "";
    const validated = ValidationResultSchema.safeParse(JSON.parse(raw));

    if (!validated.success) {
      return NextResponse.json({ error: "LLM returned invalid validation schema" }, { status: 500 });
    }

    // Map indices back to test case IDs
    const result = {
      ...validated.data,
      duplicateGroups: validated.data.duplicateGroups.map((g) => ({
        ...g,
        ids: g.indices.map((i) => cases[i]?.id).filter(Boolean),
        titles: g.indices.map((i) => cases[i]?.title).filter(Boolean),
      })),
      improvements: validated.data.improvements.map((imp) => ({
        ...imp,
        id: cases[imp.index]?.id,
        title: cases[imp.index]?.title,
      })),
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
