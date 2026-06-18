import { chromium } from "playwright-core";
import { applyStealth, stealthLaunchArgs, stealthUA, hideBotSignals } from "./stealth";

export interface CrawledPage {
  url: string;
  title: string;
  headings: string[];
  forms: {
    selector: string;
    fields: { name: string; type: string; label: string; selector: string }[];
  }[];
  interactiveElements: { type: "button" | "link"; text: string; selector: string }[];
}

export interface CrawlProgressEvent {
  type: "thinking" | "action" | "result" | "error" | "done";
  message: string;
  data?: unknown;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  onProgress?: (event: CrawlProgressEvent) => void;
}

export class CrawlError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_URL"
      | "DNS_FAILED"
      | "TIMEOUT"
      | "BLOCKED"
      | "SSL_ERROR"
      | "BROWSER_LAUNCH"
      | "ZERO_PAGES"
      | "UNKNOWN"
  ) {
    super(message);
    this.name = "CrawlError";
  }
}

const DEFAULT_MAX_PAGES = 15;
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_DELAY_MS = 800;

function isSameOrigin(base: string, target: string): boolean {
  try {
    return new URL(target).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function classifyPlaywrightError(err: unknown): CrawlError {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("ERR_NAME_NOT_RESOLVED") || msg.includes("ERR_NAME_NOT_RESOLVED")) {
    return new CrawlError(
      "Domain could not be resolved. Check the URL is correct and the site is online.",
      "DNS_FAILED"
    );
  }
  if (msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("ERR_CONNECTION_RESET")) {
    return new CrawlError(
      "Connection refused. The server may be down or blocking automated access.",
      "BLOCKED"
    );
  }
  if (msg.includes("ERR_CERT") || msg.includes("SSL") || msg.includes("certificate")) {
    return new CrawlError(
      "SSL/TLS certificate error. The site may have an invalid certificate.",
      "SSL_ERROR"
    );
  }
  if (msg.includes("Timeout") || msg.includes("timeout") || msg.includes("ERR_TIMED_OUT")) {
    return new CrawlError(
      "Page load timed out. The site may be too slow or blocking headless browsers.",
      "TIMEOUT"
    );
  }
  if (msg.includes("403") || msg.includes("429") || msg.includes("ERR_HTTP_RESPONSE_CODE_FAILURE")) {
    return new CrawlError(
      "Access denied (403/429). The site is blocking automated crawlers.",
      "BLOCKED"
    );
  }
  return new CrawlError(`Unexpected error: ${msg}`, "UNKNOWN");
}

type ExtractedPage = CrawledPage & { _linkHrefs: string[] };

async function extractPageData(
  page: import("playwright-core").Page,
  url: string
): Promise<ExtractedPage> {
  const result = await page.evaluate((pageUrl: string) => {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .slice(0, 20)
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);

    const forms = Array.from(document.querySelectorAll("form")).map((form, fi) => {
      const formSelector = form.id
        ? `#${form.id}`
        : form.className
          ? `form.${form.className.split(" ")[0]}`
          : `form:nth-of-type(${fi + 1})`;

      const fields = Array.from(form.querySelectorAll("input, select, textarea")).map(
        (el, idx) => {
          const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          const name = input.name || input.id || `field-${idx}`;
          const type =
            el.tagName === "SELECT" ? "select" : (input as HTMLInputElement).type || "text";

          let label = "";
          if (input.id) {
            const labelEl = document.querySelector(`label[for="${input.id}"]`);
            if (labelEl) label = labelEl.textContent?.trim() ?? "";
          }
          if (!label) {
            const closestLabel = input.closest("label");
            if (closestLabel) label = closestLabel.textContent?.trim() ?? "";
          }

          const selector = input.id
            ? `#${input.id}`
            : input.name
              ? `[name="${input.name}"]`
              : `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;

          return { name, type, label, selector };
        }
      );

      return { selector: formSelector, fields };
    });

    const buttons = Array.from(
      document.querySelectorAll("button, [role=button], input[type=submit], input[type=button]")
    )
      .slice(0, 50)
      .map((el, idx) => {
        const text =
          el.textContent?.trim() ||
          (el as HTMLInputElement).value?.trim() ||
          (el as HTMLElement).getAttribute("aria-label") ||
          "";
        const selector = el.id
          ? `#${el.id}`
          : el.className
            ? `${el.tagName.toLowerCase()}.${(el.className as string).split(" ")[0]}`
            : `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
        return { type: "button" as const, text, selector };
      })
      .filter((b) => b.text);

    const links = Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 100)
      .map((el, idx) => {
        const text = el.textContent?.trim() || (el as HTMLAnchorElement).title || "";
        const href = (el as HTMLAnchorElement).href;
        const selector = el.id ? `#${el.id}` : `a:nth-of-type(${idx + 1})`;
        return { type: "link" as const, text, selector, href };
      })
      .filter((l) => l.text);

    return {
      url: pageUrl,
      title: document.title,
      headings,
      forms,
      interactiveElements: [...buttons, ...links.map(({ href: _href, ...rest }) => rest)],
      _linkHrefs: links.map((l) => l.href),
    };
  }, url);
  return result as unknown as ExtractedPage;
}

export async function crawlSite(
  targetUrl: string,
  options: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const {
    maxPages = DEFAULT_MAX_PAGES,
    maxDepth = DEFAULT_MAX_DEPTH,
    delayMs = DEFAULT_DELAY_MS,
    onProgress,
  } = options;

  const emit = (event: CrawlProgressEvent) => onProgress?.(event);

  // ── 1. Validate URL format ──────────────────────────────────────────────────
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new CrawlError("Only http:// and https:// URLs are supported.", "INVALID_URL");
    }
  } catch (err) {
    if (err instanceof CrawlError) throw err;
    throw new CrawlError(`Invalid URL: "${targetUrl}"`, "INVALID_URL");
  }

  emit({ type: "thinking", message: `Starting crawl of ${parsedUrl.hostname}…` });

  // ── 2. Launch browser ───────────────────────────────────────────────────────
  let browser: import("playwright-core").Browser;
  try {
    browser = await chromium.launch({ args: stealthLaunchArgs(), headless: true });
  } catch (err) {
    throw new CrawlError(
      `Failed to launch browser. Is Playwright installed? (${err instanceof Error ? err.message : String(err)})`,
      "BROWSER_LAUNCH"
    );
  }

  const context = await browser.newContext({
    userAgent: stealthUA,
    viewport: { width: 1280, height: 800 },
  });
  await applyStealth(context);

  const page = await context.newPage();
  await hideBotSignals(page);

  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [
    { url: normalizeUrl(targetUrl), depth: 0 },
  ];
  const results: CrawledPage[] = [];
  let stepBudget = maxPages * 3;

  try {
    // ── 3. Preflight: load the root URL first, fail fast if unreachable ───────
    emit({ type: "action", message: `Loading ${parsedUrl.origin}…` });
    try {
      const response = await page.goto(normalizeUrl(targetUrl), {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // Treat hard HTTP errors on the root as fatal
      const status = response?.status() ?? 200;
      if (status === 403 || status === 429) {
        throw new CrawlError(
          `The site returned HTTP ${status} — it appears to be blocking automated access.`,
          "BLOCKED"
        );
      }
      if (status >= 500) {
        throw new CrawlError(
          `The site returned HTTP ${status} — the server may be down or misconfigured.`,
          "UNKNOWN"
        );
      }
    } catch (err) {
      if (err instanceof CrawlError) throw err;
      throw classifyPlaywrightError(err);
    }

    // Root loaded — extract and mark visited
    const rootNorm = normalizeUrl(targetUrl);
    visited.add(rootNorm);
    queue.shift(); // already loaded, handled below

    const rawRoot = await extractPageData(page, rootNorm);
    const rootPage = rawRoot as unknown as CrawledPage & { _linkHrefs: string[] };
    results.push({
      url: rootPage.url,
      title: rootPage.title,
      headings: rootPage.headings,
      forms: rootPage.forms,
      interactiveElements: rootPage.interactiveElements,
    });
    emit({
      type: "result",
      message: `✓ ${rootPage.title || rootNorm} (${rootPage.forms.length} forms, ${rootPage.interactiveElements.length} elements)`,
    });

    for (const href of rootPage._linkHrefs) {
      const norm = normalizeUrl(href);
      if (!visited.has(norm) && isSameOrigin(targetUrl, norm)) {
        queue.push({ url: norm, depth: 1 });
      }
    }

    await page.waitForTimeout(delayMs);

    // ── 4. BFS the rest of the site ───────────────────────────────────────────
    while (queue.length > 0 && results.length < maxPages && stepBudget > 0) {
      stepBudget--;
      const item = queue.shift()!;
      const normalized = normalizeUrl(item.url);

      if (visited.has(normalized)) continue;
      if (!isSameOrigin(targetUrl, normalized)) continue;
      if (item.depth > maxDepth) continue;

      visited.add(normalized);
      emit({ type: "action", message: `Crawling: ${normalized}` });

      try {
        const response = await page.goto(normalized, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });

        // Skip non-HTML responses (PDFs, images, etc.)
        const ct = response?.headers()["content-type"] ?? "";
        if (!ct.includes("text/html")) {
          emit({ type: "thinking", message: `Skipping non-HTML: ${normalized}` });
          continue;
        }

        await page.waitForTimeout(delayMs);
        const rawData = await extractPageData(page, normalized);
        const data = rawData as unknown as CrawledPage & { _linkHrefs: string[] };

        results.push({
          url: data.url,
          title: data.title,
          headings: data.headings,
          forms: data.forms,
          interactiveElements: data.interactiveElements,
        });

        emit({
          type: "result",
          message: `✓ ${data.title || normalized} (${data.forms.length} forms, ${data.interactiveElements.length} elements)`,
        });

        if (item.depth < maxDepth) {
          for (const href of data._linkHrefs) {
            const norm = normalizeUrl(href);
            if (!visited.has(norm) && isSameOrigin(targetUrl, norm)) {
              queue.push({ url: norm, depth: item.depth + 1 });
            }
          }
        }
      } catch (err) {
        // Per-page errors are non-fatal — log and continue
        const msg = err instanceof Error ? err.message : String(err);
        emit({
          type: "error",
          message: `Skipped ${normalized}: ${classifyPlaywrightError(err).message}`,
        });
        // Don't let a cascade of timeouts stall the crawl
        if (msg.includes("Timeout") || msg.includes("timeout")) {
          emit({ type: "thinking", message: "Slowing down after timeout…" });
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    // ── 5. Guard: zero pages is always an error ────────────────────────────────
    if (results.length === 0) {
      throw new CrawlError(
        "No pages could be extracted from the site. It may require JavaScript rendering, authentication, or may be blocking headless browsers.",
        "ZERO_PAGES"
      );
    }
  } finally {
    await browser.close();
  }

  emit({
    type: "done",
    message: `Crawl complete — captured ${results.length} page${results.length === 1 ? "" : "s"}.`,
  });
  return results;
}
