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

// ── Test data schema ──────────────────────────────────────────────────────────

export const TestDataSetSchema = z.object({
  label: z.string(),
  category: z.enum(["valid", "invalid", "boundary", "security"]),
  values: z.record(z.string(), z.string()),
});

export const TestDataListSchema = z.object({
  datasets: z.array(TestDataSetSchema),
});

export type TestDataSetInput = z.infer<typeof TestDataSetSchema>;

export const testDataListJsonSchema = {
  name: "test_data_list",
  strict: true,
  schema: {
    type: "object",
    properties: {
      datasets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            category: { type: "string", enum: ["valid", "invalid", "boundary", "security"] },
            values: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
          required: ["label", "category", "values"],
          additionalProperties: false,
        },
      },
    },
    required: ["datasets"],
    additionalProperties: false,
  },
} as const;

// ── Validation result schema ──────────────────────────────────────────────────

export const ValidationResultSchema = z.object({
  duplicateGroups: z.array(
    z.object({
      indices: z.array(z.number()),
      reason: z.string(),
    })
  ),
  coverageGaps: z.array(
    z.object({
      area: z.string(),
      suggestion: z.string(),
    })
  ),
  improvements: z.array(
    z.object({
      index: z.number(),
      suggestion: z.string(),
    })
  ),
  overallCoverage: z.enum(["Excellent", "Good", "Moderate", "Poor"]),
  summary: z.string(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const validationResultJsonSchema = {
  name: "validation_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      duplicateGroups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            indices: { type: "array", items: { type: "number" } },
            reason: { type: "string" },
          },
          required: ["indices", "reason"],
          additionalProperties: false,
        },
      },
      coverageGaps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["area", "suggestion"],
          additionalProperties: false,
        },
      },
      improvements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            suggestion: { type: "string" },
          },
          required: ["index", "suggestion"],
          additionalProperties: false,
        },
      },
      overallCoverage: {
        type: "string",
        enum: ["Excellent", "Good", "Moderate", "Poor"],
      },
      summary: { type: "string" },
    },
    required: ["duplicateGroups", "coverageGaps", "improvements", "overallCoverage", "summary"],
    additionalProperties: false,
  },
} as const;

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
