# Klyron — Pending Features & Incomplete Items

Tracked against: `AI_QA_Agent_Requirements.txt`

---

## Completed

- [x] **Settings Page** — AI model selector with top 3 picks + full OpenRouter model list with capability badges. (`/settings`)
- [x] **User Inputs** — Credentials (login username/password for authenticated crawl), User Story, Requirement Doc, API Documentation added to project creation form (collapsible Advanced section).
- [x] **AI Validation Layer** — "Validate & Improve" button on Test Cases tab. Detects duplicates, coverage gaps, and per-case improvement suggestions with one-click duplicate removal. (`/api/validate-testcases`)
- [x] **Test Data Generation** — "Generate Data" button in each test case detail dialog. Generates valid, invalid, boundary, and security test datasets. (`/api/generate-testdata`)
- [x] **Playwright Framework Generation** — "Download Framework" export generates a full `klyron-tests/` package: `playwright.config.js`, `package.json`, `README.md`, `pages/` (BasePage + per-crawled-page POMs), `utils/helpers.js`, `utils/testData.js`. (`/api/export/[id]?mode=framework`)
- [x] **Edge Case Discovery Engine** — "Discover Edge Cases" button generates a dedicated batch of edge-case test cases using systematic patterns: boundary values, SQL injection, XSS, path traversal, null bytes, session edge cases, and network patterns. (`/api/generate-edgecases`)
- [x] **Test Execution Engine** — "Execution" tab with browser selector (Chrome/Firefox/Safari). Runs approved test cases against the live site using Playwright, streams per-test progress via SSE. (`/api/execute`)
- [x] **Result Analysis** — Execution results stored per run: pass/fail/error status, duration, console errors, network errors, in-page screenshots (base64). Previous runs viewable with expandable per-test detail.
- [x] **Defect Detection** — Automatic defect classification per test result: JS errors, broken links, functional failures, execution errors — with severity (critical/major/minor).
- [x] **Reporting** — "HTML Report" (dark-themed, self-contained, opens in browser) and "Excel Report" (4-sheet workbook: Summary, Test Cases, Execution Results, Defects). (`/api/report/[id]?format=html|excel`)

---

## Still Incomplete

### Medium Priority

- [ ] **Cross-browser parallel execution** — Currently runs browsers sequentially (one browser per run). Parallel execution across Chrome + Firefox + Safari simultaneously is not implemented.
- [ ] **Video recording** — Screenshots captured on all tests. Video `retain-on-failure` is in the framework config but not captured during in-process execution (requires `playwright test` CLI runner).
- [ ] **Trace files** — Playwright trace files (`.zip` with DOM snapshots) not captured during in-process execution.
- [ ] **PDF report** — HTML report can be printed to PDF from the browser. A server-side PDF generator (e.g., Puppeteer) is not implemented.
- [ ] **Self-healing locators** — When a selector breaks, the executor falls back to text-based matching but does not automatically update the stored selector in the DB.
- [ ] **Auto-retry on flake** — The framework `playwright.config.js` has `retries: 1` configured, but the in-process executor does not retry failed tests.

### Lower Priority

- [ ] **Scalability** — Large sites (500+ pages) may hit Next.js 5-minute timeout (`maxDuration = 300`). A dedicated background job queue (e.g., BullMQ) would be needed.
- [ ] **Secure credential storage** — Login credentials stored as plain text in the DB. Should be encrypted at rest (e.g., AES-256 with a server-side key).
- [ ] **Sensitive data masking in logs** — Passwords and tokens currently appear in plain text in SSE event logs.
- [ ] **Concurrent user actions** — No simulation of multiple simultaneous users (requires load testing tooling, out of scope for Playwright).
- [ ] **Coverage metrics** — No formal coverage % tracking (pages tested vs. total crawled, feature areas covered vs. total).

---

## Notes

- Run `npm run db:push` after pulling these changes (adds: `app_settings`, `test_runs`, `test_results` tables; new columns on `projects` and `test_cases`).
- The `xlsx` package is now a runtime dependency (`npm install xlsx`).
- Test execution requires Playwright to be installed in the execution environment — handled by the Railway Dockerfile.
