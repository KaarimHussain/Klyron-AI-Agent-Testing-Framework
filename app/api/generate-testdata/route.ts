export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { openrouter } from "@/lib/llm/client";
import { getActiveModel } from "@/lib/db/settings";
import { TestDataListSchema, testDataListJsonSchema } from "@/lib/llm/schemas";
import { z } from "zod";

const RequestSchema = z.object({ testCaseId: z.string() });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { testCaseId } = parsed.data;
  const [tc] = await db.select().from(testCases).where(eq(testCases.id, testCaseId));
  if (!tc) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 });
  }

  const model = await getActiveModel();

  const steps = (tc.steps as string[]).join("\n");
  const prompt = `You are a QA data engineer. Generate realistic test datasets for this test case.

TEST CASE: ${tc.title}
MODULE: ${tc.module}
TYPE: ${tc.type}
STEPS:
${steps}
EXPECTED RESULT: ${tc.expectedResult}

Generate 4–8 test datasets covering:
- valid: realistic positive test data that should pass
- invalid: data that should trigger validation errors (empty, wrong format, wrong type)
- boundary: edge values (max length, min length, zero, negative numbers)
- security: injection strings (SQL injection, XSS, script tags, null bytes)

For each dataset, "values" should map the relevant field name to the test value.
Field names should be short and descriptive (e.g., "email", "password", "username", "amount").

Return JSON matching the schema exactly.`;

  try {
    const res = await openrouter.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a QA data expert. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: testDataListJsonSchema },
    });

    const raw = res.choices[0]?.message?.content ?? "";
    const validated = TestDataListSchema.safeParse(JSON.parse(raw));
    if (!validated.success) {
      return NextResponse.json({ error: "LLM returned invalid data schema" }, { status: 500 });
    }

    const [updated] = await db
      .update(testCases)
      .set({ testData: validated.data.datasets })
      .where(eq(testCases.id, testCaseId))
      .returning();

    return NextResponse.json({ testData: updated.testData });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
