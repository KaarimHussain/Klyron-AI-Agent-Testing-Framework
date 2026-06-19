/**
 * Deterministic edge case patterns injected into LLM prompts.
 * These ensure systematic coverage of security and boundary scenarios
 * regardless of what the LLM would naturally generate.
 */

export interface EdgeCasePattern {
  category: "boundary" | "security" | "network" | "session" | "concurrency";
  name: string;
  description: string;
  testValues?: string[];
}

export const BOUNDARY_PATTERNS: EdgeCasePattern[] = [
  {
    category: "boundary",
    name: "Empty / null input",
    description: "Submit forms with all fields left empty",
  },
  {
    category: "boundary",
    name: "Maximum length input",
    description: "Fill text fields with 255+ characters",
    testValues: ["A".repeat(255), "A".repeat(1000)],
  },
  {
    category: "boundary",
    name: "Single character input",
    description: "Fill text fields with exactly one character",
    testValues: ["a", "1", " "],
  },
  {
    category: "boundary",
    name: "Whitespace-only input",
    description: "Submit fields containing only spaces, tabs, or newlines",
    testValues: ["   ", "\t\t", "\n"],
  },
  {
    category: "boundary",
    name: "Numeric boundaries",
    description: "Test minimum (0, -1), maximum (999999), and decimal values",
    testValues: ["0", "-1", "-999999", "999999", "0.001", "1e10"],
  },
  {
    category: "boundary",
    name: "Unicode & special characters",
    description: "Input with emoji, Arabic/CJK text, accented characters",
    testValues: ["Hello 😊", "مرحبا", "你好世界", "café", "naïve"],
  },
];

export const SECURITY_PATTERNS: EdgeCasePattern[] = [
  {
    category: "security",
    name: "SQL Injection",
    description: "Classic SQL injection strings in all input fields",
    testValues: [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "1 UNION SELECT * FROM users",
      "' OR 1=1--",
    ],
  },
  {
    category: "security",
    name: "XSS — Reflected",
    description: "Script injection via input fields",
    testValues: [
      "<script>alert('XSS')</script>",
      "<img src=x onerror=alert(1)>",
      "javascript:alert(1)",
      "<svg onload=alert(1)>",
    ],
  },
  {
    category: "security",
    name: "Path Traversal",
    description: "Directory traversal sequences in file/URL inputs",
    testValues: ["../../etc/passwd", "../../../windows/system32", "..%2F..%2F"],
  },
  {
    category: "security",
    name: "Null byte injection",
    description: "Null bytes to truncate strings",
    testValues: ["admin\x00", "test%00admin"],
  },
];

export const SESSION_PATTERNS: EdgeCasePattern[] = [
  {
    category: "session",
    name: "Duplicate form submission",
    description: "Submit the same form twice in quick succession (double-click)",
  },
  {
    category: "session",
    name: "Browser refresh mid-form",
    description: "Refresh the page while a form is partially filled",
  },
  {
    category: "session",
    name: "Back button after submit",
    description: "Click browser back after a successful form submission",
  },
  {
    category: "session",
    name: "Session expiry",
    description: "Attempt to use the app after session/token has expired",
  },
];

export const NETWORK_PATTERNS: EdgeCasePattern[] = [
  {
    category: "network",
    name: "Slow network simulation",
    description: "Use network throttling to simulate 3G/offline conditions",
  },
  {
    category: "network",
    name: "Request timeout",
    description: "Simulate network timeout while a form is submitting",
  },
];

export const ALL_EDGE_PATTERNS = [
  ...BOUNDARY_PATTERNS,
  ...SECURITY_PATTERNS,
  ...SESSION_PATTERNS,
  ...NETWORK_PATTERNS,
];

export function buildEdgeCaseSystemPrompt(): string {
  const grouped = {
    Boundary: BOUNDARY_PATTERNS,
    Security: SECURITY_PATTERNS,
    Session: SESSION_PATTERNS,
    Network: NETWORK_PATTERNS,
  };

  const lines = Object.entries(grouped)
    .map(([cat, patterns]) =>
      `${cat}:\n${patterns.map((p) => `  - ${p.name}: ${p.description}`).join("\n")}`
    )
    .join("\n\n");

  return `MANDATORY EDGE CASE CATEGORIES (you MUST generate at least one test case per category below):
${lines}

For security patterns, use EXACTLY these test values where relevant:
SQL injection: ' OR '1'='1  |  '; DROP TABLE users; --
XSS: <script>alert('XSS')</script>  |  <img src=x onerror=alert(1)>
Path traversal: ../../etc/passwd

Do NOT skip any category. Include all of the above in addition to functional test cases.`;
}
