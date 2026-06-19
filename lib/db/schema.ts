import { pgTable, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("global"),
  selectedModel: text("selected_model").notNull().default("deepseek/deepseek-chat"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppSettings = typeof appSettings.$inferSelect;
import { createId } from "@paralleldrive/cuid2";

export const projectStatusEnum = pgEnum("project_status", [
  "idle",
  "crawling",
  "crawled",
  "generating",
  "ready",
  "error",
]);

export const testCaseTypeEnum = pgEnum("test_case_type", [
  "functional",
  "ui",
  "negative",
  "edge-case",
]);

export const testCasePriorityEnum = pgEnum("test_case_priority", [
  "high",
  "medium",
  "low",
]);

export const testCaseStatusEnum = pgEnum("test_case_status", [
  "draft",
  "approved",
]);

export const projects = pgTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  targetUrl: text("target_url").notNull(),
  scopeNotes: text("scope_notes"),
  // Optional user-provided context for richer test generation
  loginUsername: text("login_username"),
  loginPassword: text("login_password"),
  userStory: text("user_story"),
  requirementDoc: text("requirement_doc"),
  apiDoc: text("api_doc"),
  status: projectStatusEnum("status").notNull().default("idle"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sitePages = pgTable("site_pages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  headings: jsonb("headings").$type<string[]>(),
  forms: jsonb("forms").$type<
    {
      selector: string;
      fields: { name: string; type: string; label: string; selector: string }[];
    }[]
  >(),
  interactiveElements: jsonb("interactive_elements").$type<
    { type: "button" | "link"; text: string; selector: string }[]
  >(),
  crawledAt: timestamp("crawled_at").notNull().defaultNow(),
});

export interface TestDataSet {
  label: string;
  category: "valid" | "invalid" | "boundary" | "security";
  values: Record<string, string>;
}

export const testCases = pgTable("test_cases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  module: text("module").notNull(),
  type: testCaseTypeEnum("type").notNull(),
  preconditions: text("preconditions"),
  steps: jsonb("steps").$type<string[]>().notNull(),
  expectedResult: text("expected_result").notNull(),
  priority: testCasePriorityEnum("priority").notNull(),
  status: testCaseStatusEnum("status").notNull().default("draft"),
  testData: jsonb("test_data").$type<TestDataSet[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const automationScripts = pgTable("automation_scripts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  testCaseId: text("test_case_id")
    .notNull()
    .references(() => testCases.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  code: text("code").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type SitePage = typeof sitePages.$inferSelect;
export type NewSitePage = typeof sitePages.$inferInsert;
export type TestCase = typeof testCases.$inferSelect;
export type NewTestCase = typeof testCases.$inferInsert;
export type AutomationScript = typeof automationScripts.$inferSelect;
export type NewAutomationScript = typeof automationScripts.$inferInsert;

// ── Test execution ────────────────────────────────────────────────────────────

export const testRunStatusEnum = pgEnum("test_run_status", [
  "pending", "running", "completed", "failed",
]);

export const testResultStatusEnum = pgEnum("test_result_status", [
  "passed", "failed", "skipped", "error",
]);

export const testRuns = pgTable("test_runs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: testRunStatusEnum("status").notNull().default("pending"),
  browser: text("browser").notNull().default("chromium"),
  totalTests: text("total_tests").notNull().default("0"),
  passed: text("passed").notNull().default("0"),
  failed: text("failed").notNull().default("0"),
  skipped: text("skipped").notNull().default("0"),
  durationMs: text("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const testResults = pgTable("test_results", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  runId: text("run_id").notNull().references(() => testRuns.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  testCaseId: text("test_case_id").references(() => testCases.id, { onDelete: "set null" }),
  scriptId: text("script_id").references(() => automationScripts.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: testResultStatusEnum("status").notNull(),
  durationMs: text("duration_ms"),
  errorMessage: text("error_message"),
  screenshotBase64: text("screenshot_base64"),
  consoleErrors: jsonb("console_errors").$type<string[]>(),
  networkErrors: jsonb("network_errors").$type<string[]>(),
  defects: jsonb("defects").$type<Defect[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export interface Defect {
  type: "ui" | "functional" | "broken-link" | "js-error" | "performance";
  description: string;
  severity: "critical" | "major" | "minor";
}

export type TestRun = typeof testRuns.$inferSelect;
export type NewTestRun = typeof testRuns.$inferInsert;
export type TestResult = typeof testResults.$inferSelect;
export type NewTestResult = typeof testResults.$inferInsert;
