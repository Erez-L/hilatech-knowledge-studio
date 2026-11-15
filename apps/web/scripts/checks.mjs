// Browser checks against a running server: accessibility (axe, WCAG 2.2 AA
// rule set) and the interactions that exist in the design-foundation
// milestone. Usage: node scripts/checks.mjs [--base http://localhost:3100]
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3100";
const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function open(path, { width = 1440, height = 900, theme = "light" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1300);
  return { context, page, errors };
}

async function axe(name, page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")}`).join("; ");
  check(`axe: ${name}`, violations.length === 0, summary);
}

/* ---- accessibility ---- */
for (const [name, path, theme] of [
  ["landing en light", "/en", "light"],
  ["landing he light", "/he", "light"],
  ["landing en dark", "/en", "dark"],
  ["workspace empty en", "/en/demo", "light"],
  ["workspace empty he dark", "/he/demo", "dark"],
  ["not-found en", "/en/missing-page", "light"],
]) {
  const { context, page, errors } = await open(path, { theme });
  await axe(name, page);
  if (!path.includes("missing")) check(`no console errors: ${name}`, errors.length === 0, errors.join(" | "));
  await context.close();
}

/* ---- landing interactions ---- */
{
  const { context, page } = await open("/en");
  check("html lang/dir en", (await page.getAttribute("html", "lang")) === "en" && (await page.getAttribute("html", "dir")) === "ltr");

  // product preview: switching question and citation
  await page.getByRole("tab").nth(1).click();
  check("preview: tab switches answer", await page.getByRole("tabpanel").getByText("30 minutes").first().isVisible());
  await page.getByRole("tabpanel").locator("button[aria-pressed]").nth(1).click();
  check("preview: citation shows its source", await page.getByRole("tabpanel").getByText("duty manager", { exact: false }).last().isVisible());

  // contact form validation
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Request a demo" }).click();
  check("contact: empty submit shows field errors", (await page.locator("#contact [aria-invalid='true']").count()) === 3);
  check("contact: focus moves to first invalid field", await page.evaluate(() => document.activeElement?.getAttribute("name") === "name"));
  await page.getByLabel("Full name").fill("Dana Example");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.getByLabel("What would you like").fill("Refund policies.");
  await page.getByRole("button", { name: "Request a demo" }).click();
  check("contact: invalid email rejected", await page.getByText("Enter a valid email address").isVisible());
  await page.getByLabel("Work email").fill("dana@example.com");
  await page.getByRole("button", { name: "Request a demo" }).click();
  await page.getByText("Request sent").waitFor({ timeout: 8000 }).catch(() => {});
  check("contact: valid submit reaches success state", await page.getByText("Request sent").isVisible());

  // theme toggle
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  check("theme: toggles to dark", (await page.getAttribute("html", "data-theme")) === "dark");

  // language switch
  await page.getByRole("link", { name: /Switch language/ }).first().click();
  await page.waitForURL("**/he");
  check("language: switches to Hebrew RTL", (await page.getAttribute("html", "dir")) === "rtl" && (await page.getAttribute("html", "lang")) === "he");
  check("theme: persists across navigation", (await page.getAttribute("html", "data-theme")) === "dark");
  await context.close();
}

/* ---- API ---- */
{
  const bad = await fetch(base + "/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "", email: "x", message: "", locale: "en" }) });
  const body = await bad.json();
  check("api: invalid lead returns 422 with field codes", bad.status === 422 && body.error?.code === "validation" && body.fields?.email === "email" && Boolean(bad.headers.get("x-request-id")));
  const junk = await fetch(base + "/api/contact", { method: "POST", body: "{nope" });
  check("api: malformed JSON returns 400", junk.status === 400);
  const bot = await fetch(base + "/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "a", email: "a@b.co", message: "m", locale: "en", website: "http://spam" }) });
  check("api: filled honeypot rejected", bot.status === 422);
  let limited = false;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(base + "/api/contact", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: "{}" });
    if (r.status === 429) limited = true;
  }
  check("api: rate limit returns 429", limited);
}

/* ---- workspace interactions ---- */
{
  const { context, page, errors } = await open("/en/demo");
  check("workspace: evidence region absent before a source is chosen", (await page.locator("#evidence-region").count()) === 0);
  check("workspace: preview banner visible", await page.getByText("Live AI answers are not connected yet").isVisible());

  // typed question is not answered as if by AI
  const box = page.getByRole("textbox", { name: "Your question" });
  await box.fill("What is the parental leave policy?");
  check("composer: send enabled with text", await page.getByRole("button", { name: "Send question" }).isEnabled());
  await box.press("Shift+Enter");
  check("composer: Shift+Enter adds a new line", (await box.inputValue()).includes("\n"));
  await box.press("Enter");
  check("composer: Enter sends and clears", (await box.inputValue()) === "");
  check("typed question: honest notice, no answer", await page.getByText("wasn't sent to an AI model").isVisible());
  check("typed question: no citations rendered", (await page.locator("main button[aria-pressed]").count()) === 0);

  // example question: reveal, stop, retry
  await page.getByRole("button", { name: "New chat" }).click();
  await page.locator("[data-example-question='first-week']").click();
  await page.getByRole("button", { name: "Stop" }).click();
  check("stop: halts the reveal", await page.getByText("Stopped before the answer finished").isVisible());
  await page.getByRole("button", { name: "Retry" }).click();
  await page.locator("[data-answer-complete]").waitFor({ timeout: 10000 });
  check("retry: answer completes", true);
  check("answer: labelled as pre-written", await page.getByText("Pre-written sample answer").isVisible());

  // citation → evidence
  await page.locator("[data-answer-complete] button[aria-pressed]").nth(1).click();
  await page.waitForTimeout(500);
  const region = page.locator("#evidence-region");
  check("citation: opens evidence region", await region.isVisible());
  check("citation: correct document and section", (await region.getByText("Employee Onboarding Guide").first().isVisible()) && (await region.getByText("Section 2.3").first().isVisible()));
  check("citation: cited passage highlighted", (await region.locator("mark[data-active='true']").innerText()).includes("information security course"));
  await region.getByRole("button", { name: "Next" }).click();
  check("viewer: next goes to section 2.4", await region.getByText("Payroll and paperwork").isVisible());
  await region.getByRole("button", { name: "Next" }).click();
  check("viewer: uncovered section says text is not included", await region.getByText("isn't included in the sample preview").isVisible());
  await page.getByRole("button", { name: "Close evidence" }).click();
  await page.waitForTimeout(500);
  check("evidence: closes and frees the width", (await page.locator("#evidence-region").count()) === 0);

  // follow-up and history
  await page.locator("[data-answer-complete]").getByRole("button", { name: /Priority 1 ticket/ }).click();
  await page.locator("[data-answer-complete]").nth(1).waitFor({ timeout: 10000 });
  check("follow-up: appends a second answer", (await page.locator("[data-answer-complete]").count()) === 2);
  await page.getByRole("button", { name: "Bookkeeping plans compared" }).click();
  await page.locator("[data-answer-complete]").waitFor({ timeout: 10000 });
  check("history: opens a sample conversation with a table", await page.locator("main table").isVisible());
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Refund and Cancellation Policy" }).click();
  await page.waitForTimeout(500);
  check("library: opens a document in the viewer", await page.locator("#evidence-region").getByText("Page 3 of 8").isVisible());
  check("no console errors: workspace session", errors.length === 0, errors.join(" | "));
  await axe("workspace conversation + evidence (en)", page);
  await context.close();
}

/* ---- workspace: mobile + Hebrew ---- */
{
  const { context, page } = await open("/he/demo", { width: 390, height: 844 });
  await page.locator("[data-example-question]").first().click();
  await page.locator("[data-answer-complete]").waitFor({ timeout: 10000 });
  await page.locator("[data-answer-complete] button[aria-pressed]").first().click();
  await page.waitForTimeout(600);
  const dialog = page.getByRole("dialog");
  check("mobile: evidence opens as a sheet", await dialog.isVisible());
  check("mobile he: page label localized", await dialog.getByText("עמוד 3 מתוך 8").isVisible());
  await axe("workspace evidence sheet (he, mobile)", page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check("mobile: Escape closes the sheet", (await page.getByRole("dialog").count()) === 0);
  await page.getByRole("button", { name: "פתיחת הניווט" }).click();
  await page.waitForTimeout(400);
  check("mobile: navigation opens as a sheet", await page.getByRole("dialog").getByText("ספריית הידע").isVisible());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile he: no horizontal overflow", overflow <= 1, `${overflow}px`);
  await context.close();
}
{
  const { context, page } = await open("/en", { width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.waitForTimeout(400);
  check("mobile landing: menu opens", await page.getByRole("dialog").getByRole("link", { name: "How it works" }).isVisible());
  await axe("landing mobile menu (en)", page);
  await context.close();
}
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base + "/en/demo", { waitUntil: "networkidle" });
  await page.locator("[data-example-question]").first().click();
  check("reduced motion: answer shown immediately", await page.locator("[data-answer-complete]").isVisible());
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
