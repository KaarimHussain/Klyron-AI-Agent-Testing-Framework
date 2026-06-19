import type { CrawledPage } from "@/lib/browser/crawler";

export interface TestCasePromptContext {
  userStory?: string | null;
  requirementDoc?: string | null;
  apiDoc?: string | null;
}

export function buildTestCasePrompt(
  pages: CrawledPage[],
  scopeNotes: string | null,
  context?: TestCasePromptContext
): string {
  const siteMapSummary = pages
    .map((p) => {
      const formSummary = p.forms
        .map(
          (f) =>
            `  Form[${f.selector}]: fields=[${f.fields.map((field) => `${field.label || field.name}(${field.type})`).join(", ")}]`
        )
        .join("\n");
      const elemSummary = p.interactiveElements
        .slice(0, 20)
        .map((e) => `  ${e.type}[${e.selector}]: "${e.text}"`)
        .join("\n");
      return `Page: ${p.url}\nTitle: ${p.title}\nHeadings: ${p.headings.slice(0, 5).join(" | ")}\n${formSummary}\n${elemSummary}`;
    })
    .join("\n\n---\n\n");

  const contextBlocks: string[] = [];
  if (context?.userStory) contextBlocks.push(`USER STORY:\n${context.userStory}`);
  if (context?.requirementDoc) contextBlocks.push(`REQUIREMENTS:\n${context.requirementDoc}`);
  if (context?.apiDoc) contextBlocks.push(`API DOCUMENTATION:\n${context.apiDoc}`);
  const contextSection = contextBlocks.length > 0
    ? `\nADDITIONAL CONTEXT:\n${contextBlocks.join("\n\n")}\n`
    : "";

  return `You are a senior QA engineer. Based on the crawled site map below, generate comprehensive manual test cases covering:
- Functional flows (forms, navigation, core features)
- UI/layout checks (critical visual elements)
- Negative tests (empty inputs, invalid data, error states)
- Edge cases (boundary values, unusual sequences)

${scopeNotes ? `Focus area: ${scopeNotes}\n` : ""}${contextSection}
SITE MAP:
${siteMapSummary}

Generate between 10 and 25 test cases. Each test case must use ONLY selectors and page elements that appear in the site map above — never invent selectors. Return JSON matching the schema exactly.`;
}

export function buildScriptPrompt(
  testCase: {
    title: string;
    module: string;
    type: string;
    preconditions: string | null;
    steps: string[];
    expectedResult: string;
    priority: string;
  },
  siteMap: CrawledPage[],
  targetUrl: string
): string {
  const selectorContext = siteMap
    .map((p) => {
      const forms = p.forms
        .map(
          (f) =>
            `  form selector: ${f.selector}\n` +
            f.fields
              .map(
                (field) =>
                  `    field: selector="${field.selector}" name="${field.name}" type="${field.type}" label="${field.label}"`
              )
              .join("\n")
        )
        .join("\n");
      const elems = p.interactiveElements
        .slice(0, 30)
        .map((e) => `  ${e.type}: selector="${e.selector}" text="${e.text}"`)
        .join("\n");
      return `URL: ${p.url}\n${forms}\n${elems}`;
    })
    .join("\n\n");

  return `You are a senior test automation engineer. Write a Playwright (JavaScript, CommonJS) spec file for the following test case.

RULES:
- Use ONLY the selectors listed in the SELECTOR CONTEXT below — never invent or guess selectors.
- Use page.locator() with the exact selector strings shown.
- The base URL is: ${targetUrl}
- Use test() from @playwright/test, no external helpers.
- Include appropriate expect() assertions for the expected result.
- Handle async/await correctly.
- The file must be self-contained and runnable with: npx playwright test <fileName>

TEST CASE:
Title: ${testCase.title}
Module: ${testCase.module}
Type: ${testCase.type}
Priority: ${testCase.priority}
Preconditions: ${testCase.preconditions ?? "None"}
Steps:
${testCase.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
Expected Result: ${testCase.expectedResult}

SELECTOR CONTEXT (use ONLY these):
${selectorContext}

Return JSON with fileName (kebab-case .spec.js) and the complete code string.`;
}
