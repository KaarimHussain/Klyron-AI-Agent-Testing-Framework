import { pgTable, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
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
