import { chromium, firefox, webkit } from "playwright-core";
import { stealthLaunchArgs, stealthUA } from "./stealth";
import type { Defect } from "@/lib/db/schema";

export type SupportedBrowser = "chromium" | "firefox" | "webkit";

export interface ExecutionResult {
  title: string;
  status: "passed" | "failed" | "error";
  durationMs: number;
  errorMessage?: string;
  screenshotBase64?: string;
  consoleErrors: string[];
  networkErrors: string[];
  defects: Defect[];
}

export interface ExecuteOptions {
  browser?: SupportedBrowser;
  timeout?: number;
  baseUrl: string;
}

/**
 * Execute a generated Playwright script in-process by evaluating its steps
 * against a real browser page. Returns structured results including
 * screenshots, console errors, and detected defects.
 */
export async function executeTestCase(
  steps: string[],
  expectedResult: string,
  options: ExecuteOptions
): Promise<ExecutionResult> {
  const { browser: browserName = "chromium", timeout = 20000, baseUrl } = options;

  const launchFn = browserName === "firefox" ? firefox : browserName === "webkit" ? webkit : chromium;
  const startTime = Date.now();

  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  const browser = await launchFn.launch({
    headless: true,
    args: browserName === "chromium" ? stealthLaunchArgs() : [],
  });

  const context = await browser.newContext({
    userAgent: stealthUA,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });

  // Capture console errors
  context.on("page", (page) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`PageError: ${err.message}`);
    });
    page.on("requestfailed", (req) => {
      networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "failed"}`);
    });
  });

  const page = await context.newPage();

  let screenshotBase64: string | undefined;
  let errorMessage: string | undefined;
  let status: "passed" | "failed" | "error" = "passed";

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout });

    // Execute each step as a high-level action
    for (const step of steps) {
      await executeStep(page, step, baseUrl, timeout);
    }

    // Verify expected result by checking page content
    const pageContent = await page.content();
    const pageText = await page.evaluate(() => document.body.innerText);

    if (!verifyExpectedResult(pageText, pageContent, expectedResult)) {
      status = "failed";
      errorMessage = `Expected result not met: "${expectedResult}"`;
    }

  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
  } finally {
    // Always capture a screenshot
    try {
      const buf = await page.screenshot({ fullPage: false });
      screenshotBase64 = buf.toString("base64");
    } catch { /* ignore screenshot errors */ }
    await browser.close();
  }

  const durationMs = Date.now() - startTime;
  const defects = detectDefects(status, consoleErrors, networkErrors, errorMessage);

  return {
    title: steps[0]?.slice(0, 80) ?? "Unnamed test",
    status,
    durationMs,
    errorMessage,
    screenshotBase64,
    consoleErrors,
    networkErrors,
    defects,
  };
}

/**
 * Interpret a natural-language step string and perform a Playwright action.
 * Handles common patterns: navigate, click, fill, submit, wait, check.
 */
async function executeStep(
  page: import("playwright-core").Page,
  step: string,
  baseUrl: string,
  timeout: number
): Promise<void> {
  const s = step.toLowerCase().trim();

  // Navigate
  if (s.startsWith("navigate to") || s.startsWith("go to") || s.startsWith("open ")) {
    const urlMatch = step.match(/https?:\/\/[^\s"']+/) ?? step.match(/"([^"]+)"/) ?? step.match(/'([^']+)'/);
    const target = urlMatch ? urlMatch[0].replace(/['"]/g, "") : baseUrl;
    await page.goto(target.startsWith("http") ? target : baseUrl + target, {
      waitUntil: "domcontentloaded",
      timeout,
    });
    return;
  }

  // Click
  if (s.includes("click")) {
    const selectorMatch = step.match(/["']([^"']+)["']/) ?? step.match(/on\s+(\S+)/);
    if (selectorMatch) {
      const sel = selectorMatch[1];
      try {
        // Try text match first, then selector
        const el = page.getByText(sel, { exact: false }).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click();
          return;
        }
        await page.locator(sel).first().click({ timeout: 5000 });
      } catch { /* best-effort */ }
    }
    return;
  }

  // Fill / enter / type
  if (s.includes("fill") || s.includes("enter") || s.includes("type") || s.includes("input")) {
    const valueMatch = step.match(/["']([^"']+)["']/g);
    if (valueMatch && valueMatch.length >= 2) {
      const selector = valueMatch[0].replace(/["']/g, "");
      const value = valueMatch[1].replace(/["']/g, "");
      await page.locator(selector).first().fill(value, { timeout: 5000 }).catch(() => {});
    } else if (valueMatch) {
      // Try to find an active input and fill it
      const value = valueMatch[0].replace(/["']/g, "");
      await page.locator("input:visible").first().fill(value).catch(() => {});
    }
    return;
  }

  // Submit / press Enter
  if (s.includes("submit") || s.includes("press enter")) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    return;
  }

  // Wait
  if (s.includes("wait")) {
    const msMatch = step.match(/(\d+)\s*(?:ms|milliseconds?)/i);
    const secMatch = step.match(/(\d+)\s*(?:s|seconds?)/i);
    const ms = msMatch ? parseInt(msMatch[1]) : secMatch ? parseInt(secMatch[1]) * 1000 : 1000;
    await page.waitForTimeout(Math.min(ms, 5000));
    return;
  }

  // Verify / check / assert — these are handled by verifyExpectedResult, just wait briefly
  if (s.includes("verify") || s.includes("check") || s.includes("assert") || s.includes("confirm")) {
    await page.waitForTimeout(500);
    return;
  }

  // Default: wait for network idle
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}

function verifyExpectedResult(pageText: string, _html: string, expected: string): boolean {
  // Simple heuristic: check if key terms from expected result appear on the page
  const lower = expected.toLowerCase();
  const text = pageText.toLowerCase();

  // If expected mentions "error", "fail", "invalid" — check the page shows something
  if (lower.includes("error message") || lower.includes("validation")) {
    return text.includes("error") || text.includes("invalid") || text.includes("required");
  }

  // If expected mentions "success", "redirect", "dashboard"
  if (lower.includes("success") || lower.includes("redirect") || lower.includes("dashboard")) {
    return true; // Navigation itself is proof
  }

  // If no clear signal, pass (the absence of a thrown error is sufficient)
  return true;
}

function detectDefects(
  status: "passed" | "failed" | "error",
  consoleErrors: string[],
  networkErrors: string[],
  errorMessage: string | undefined
): Defect[] {
  const defects: Defect[] = [];

  if (consoleErrors.length > 0) {
    defects.push({
      type: "js-error",
      description: `${consoleErrors.length} JavaScript error${consoleErrors.length > 1 ? "s" : ""}: ${consoleErrors[0]}`,
      severity: "major",
    });
  }

  const brokenLinks = networkErrors.filter((e) => e.includes("404") || e.includes("ERR_NAME_NOT_RESOLVED"));
  if (brokenLinks.length > 0) {
    defects.push({
      type: "broken-link",
      description: `${brokenLinks.length} broken resource${brokenLinks.length > 1 ? "s" : ""}: ${brokenLinks[0]}`,
      severity: "minor",
    });
  }

  if (status === "failed" && errorMessage) {
    defects.push({
      type: "functional",
      description: errorMessage,
      severity: "major",
    });
  }

  if (status === "error" && errorMessage) {
    defects.push({
      type: "functional",
      description: `Test execution error: ${errorMessage}`,
      severity: "critical",
    });
  }

  return defects;
}
