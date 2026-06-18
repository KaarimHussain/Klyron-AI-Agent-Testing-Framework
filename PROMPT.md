# Build Prompt: TestForge — AI Test Case & Automation Script Generator

> Working title "TestForge" — rename freely. Paste this whole doc into Claude Code as the build brief.

## 1. Overview

Build a full-stack Next.js app that takes any website URL, crawls it with a Playwright-driven agent, generates structured **manual test cases** from what it finds, then converts approved test cases into runnable **Playwright JS automation scripts**. Think of it as an internal QA tool: point it at a site, get a manual test plan + an automated regression suite out the other end.

Single user / internal tool for now — no need to over-engineer auth, but keep the schema clean enough to add it later.

## 2. Tech Stack (strict — do not substitute)

- **Framework:** Next.js 15, App Router, TypeScript strict mode, fullstack (UI + API routes in one app, no separate backend)
- **Database:** Neon (serverless Postgres) + Drizzle ORM
- **Browser automation:** Playwright (Chromium), runs only inside Node.js runtime route handlers (`export const runtime = "nodejs"` — never Edge, Playwright needs a real browser process)
- **LLM inference:** OpenRouter, accessed via the official `openai` npm SDK with `baseURL` overridden to `https://openrouter.ai/api/v1` — NOT the Vercel AI SDK. Use OpenAI's structured outputs (`response_format: { type: "json_schema", json_schema: { strict: true, ... } }`) for strict instruction following on every generation step.
- **UI components:** shadcn/ui, Tailwind CSS v4
- **Theme:** Light-first (no dark-first assumptions), forest green accent (`#2D7A4F`, same family as the Lyrix brand) replacing the amber/yellow used in the reference app. Keep a dark mode toggle, just recolor the brand token.
- **Fonts:** Inter for UI text.

## 3. Architecture at a glance

```
Browser (Next.js UI, shadcn)
        │  fetch / streamed responses
        ▼
Next.js App Router
 ├─ app/(dashboard) — project list, new project form
 ├─ app/projects/[id] — crawl progress, test case table, script viewer
 └─ app/api/
     ├─ crawl/route.ts            (Node runtime, streams progress)
     ├─ generate-testcases/route.ts
     ├─ generate-script/route.ts
     └─ projects/route.ts         (CRUD)
        │
        ├─ lib/browser/  → Playwright crawler agent (stealth + extraction)
        ├─ lib/llm/      → OpenRouter client via openai SDK, structured schemas
        └─ lib/db/       → Drizzle schema + Neon client
                │
                ▼
            Neon Postgres
```

## 4. Core user flow

1. User lands on `/`, sees a project list + "New Project" form (URL + optional scope notes, e.g. "focus on checkout flow").
2. Submits → creates a `project` row, redirects to `/projects/[id]`.
3. User clicks **Analyze Site** → calls `/api/crawl`, which streams live progress events back to the UI (same event shape as a typical agent stream: `thinking`, `action`, `result`, `error`, `done`) while Playwright explores the site.
4. Crawl output = a structured **site map** (pages, forms, inputs, buttons, links, nav structure) — persisted to Neon.
5. User clicks **Generate Test Cases** → one LLM call (strict JSON schema) turns the site map into a list of manual test cases (functional, UI, negative/edge-case). Saved to DB, shown in an editable shadcn data table.
6. User reviews, edits, or deletes test cases inline before automating anything — this review gate matters, don't skip it.
7. User clicks **Generate Scripts** (per test case or in bulk) → LLM call produces a Playwright JS spec per test case, using the *actual* selectors discovered during step 4's crawl (never hallucinated selectors).
8. User downloads the full suite as a zip, or copies/views individual `.spec.js` files.

## 5. Database schema (Drizzle + Neon)

```ts
// lib/db/schema.ts
projects: {
  id, name, targetUrl, scopeNotes, status, createdAt
}

sitePages: {
  id, projectId, url, title, headings: jsonb,
  forms: jsonb,       // [{ selector, fields: [{ name, type, label, selector }] }]
  interactiveElements: jsonb, // [{ type: 'button'|'link', text, selector }]
  crawledAt
}

testCases: {
  id, projectId, title, module, type, // 'functional' | 'ui' | 'negative' | 'edge-case'
  preconditions, steps: jsonb,        // string[]
  expectedResult, priority,           // 'high' | 'medium' | 'low'
  status,                              // 'draft' | 'approved'
  createdAt
}

automationScripts: {
  id, testCaseId, projectId, fileName, code, model, createdAt
}
```

## 6. LLM integration

```ts
// lib/llm/client.ts
import OpenAI from "openai";

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "TestForge",
  },
});
```

- Make the model configurable (env var default + optional per-request override), default to something with solid structured-output + tool support on OpenRouter.
- Two strict JSON schemas, defined once and reused:
  - `TestCaseListSchema` — array of test case objects matching the DB shape above.
  - `ScriptOutputSchema` — `{ fileName: string, code: string }`.
- Call pattern: `openrouter.chat.completions.create({ model, messages, response_format: { type: "json_schema", json_schema: { name: "...", strict: true, schema } } })`.
- Repair pattern: if `JSON.parse` on the response fails or doesn't match the schema, do exactly one repair call — re-send the bad output + the validation error, ask for corrected JSON only. Don't blind-retry more than once.

## 7. Playwright crawler agent

- Port the stealth setup (UA string, `Sec-Ch-Ua` headers, init-script patches for `navigator.webdriver`/`plugins`/`languages`/WebGL vendor/`hardwareConcurrency`, launch args disabling `AutomationControlled`) — this is proven and avoids getting blocked while crawling third-party sites.
- Crawl strategy: breadth-first from the target URL, configurable max pages (default ~15) and max depth (default 3). For each page capture: URL, title, top headings, every form with its fields (name/type/label/selector), every visible button/link with its text and a stable selector.
- Stay on the same origin unless explicitly told otherwise.
- Add a step budget + loop guard (same idea as detecting 3 identical actions in a row and bailing) so a malformed site can't cause an infinite crawl.
- Respect a small delay between navigations (rate-limit-friendly, don't hammer the target site).
- Must run inside a Node runtime route handler — flag this clearly in the route file.

## 8. API routes

| Route | Method | Job |
|---|---|---|
| `/api/projects` | GET/POST | list/create projects |
| `/api/projects/[id]` | GET/DELETE | fetch one project incl. pages/test cases/scripts, delete |
| `/api/crawl` | POST | kicks off Playwright crawl for a project, streams progress (SSE or chunked text stream) |
| `/api/generate-testcases` | POST | takes projectId, runs the structured LLM call, persists test cases |
| `/api/generate-script` | POST | takes testCaseId (+ site map context), runs structured LLM call, persists script |
| `/api/export/[projectId]` | GET | zips all scripts for download |

## 9. UI requirements

- Reuse the streaming-progress chat pattern: a thinking/action timeline component during crawl (action cards can show a small inline screenshot if you capture one, same as a browser-agent UI typically does).
- shadcn components to use: `Button`, `Input`, `Textarea`, `Table` (data table for test cases — sortable, inline edit/delete), `Tabs` (Site Map / Test Cases / Scripts), `Dialog` (script preview), `Badge` (priority/type tags), `Card`, `Progress`.
- Pages: `/` (dashboard + new project), `/projects/[id]` (three-tab view: crawl progress → test case table → script viewer with download-all button).
- Color tokens: replace any amber/yellow brand variable with the green family (`#2D7A4F` primary, lighter tint for hover/active states). Light mode is the default theme, not dark.

## 10. Folder structure

```
app/
  page.tsx
  projects/[id]/page.tsx
  api/
    projects/route.ts
    projects/[id]/route.ts
    crawl/route.ts
    generate-testcases/route.ts
    generate-script/route.ts
    export/[projectId]/route.ts
  globals.css
components/
  ui/                    (shadcn)
  testforge/
    crawl-progress.tsx
    testcase-table.tsx
    script-viewer.tsx
    new-project-form.tsx
lib/
  db/
    schema.ts
    client.ts            (Neon + Drizzle setup)
  llm/
    client.ts
    schemas.ts            (zod schemas → json schema for strict mode)
    prompts.ts
  browser/
    crawler.ts
    stealth.ts
drizzle/                  (migrations, drizzle-kit config)
```

## 11. Build order (follow this sequence)

1. Scaffold Next.js + Tailwind + shadcn; set the green theme tokens in `globals.css`.
2. Set up Neon connection + Drizzle schema + run first migration.
3. Build the Playwright crawler module (stealth.ts + crawl loop) as a standalone tested function before wiring it to a route.
4. Build the OpenRouter client + the two strict JSON schemas.
5. Wire the API routes: crawl → DB write → generate-testcases → DB write → generate-script → DB write.
6. Build the UI: dashboard, project page tabs, streaming crawl progress component, editable test case table, script viewer.
7. Wire export/zip download (`jszip` or `archiver`).
8. Pass over error states, empty states, loading states.

## 12. Non-negotiables

- Strict TypeScript, no `any`.
- Generated scripts must only reference selectors that were actually captured during the crawl — no hallucinated selectors, ever. Pass the real site map into the script-generation prompt as grounding context.
- No `localStorage` for anything that matters — persisted state lives in Neon.
- If deploying to Vercel: flag that long crawls can hit serverless function duration limits — either bump `maxDuration` on the crawl route, or note that this tool may need to run on a long-lived Node process instead of a standard serverless function.
- Ethical crawling: same-origin by default, small delay between page navigations, no aggressive parallel hammering of the target site.