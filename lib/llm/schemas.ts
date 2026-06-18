import { z } from "zod";

// ── Test case schema ──────────────────────────────────────────────────────────

export const TestCaseSchema = z.object({
  title: z.string(),
  module: z.string(),
  type: z.enum(["functional", "ui", "negative", "edge-case"]),
  preconditions: z.string().nullable(),
  steps: z.array(z.string()),
  expectedResult: z.string(),
  priority: z.enum(["high", "medium", "low"]),
});

export const TestCaseListSchema = z.object({
  testCases: z.array(TestCaseSchema),
});

export type TestCaseInput = z.infer<typeof TestCaseSchema>;
export type TestCaseListInput = z.infer<typeof TestCaseListSchema>;

// ── Script output schema ──────────────────────────────────────────────────────

export const ScriptOutputSchema = z.object({
  fileName: z.string(),
  code: z.string(),
});

export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

// ── JSON Schema representations (for OpenAI structured outputs) ───────────────

export const testCaseListJsonSchema = {
  name: "test_case_list",
  strict: true,
  schema: {
    type: "object",
    properties: {
      testCases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            module: { type: "string" },
            type: {
              type: "string",
              enum: ["functional", "ui", "negative", "edge-case"],
            },
            preconditions: { type: ["string", "null"] },
            steps: { type: "array", items: { type: "string" } },
            expectedResult: { type: "string" },
            priority: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: [
            "title",
            "module",
            "type",
            "preconditions",
            "steps",
            "expectedResult",
            "priority",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["testCases"],
    additionalProperties: false,
  },
} as const;

export const scriptOutputJsonSchema = {
  name: "script_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      fileName: { type: "string" },
      code: { type: "string" },
    },
    required: ["fileName", "code"],
    additionalProperties: false,
  },
} as const;
