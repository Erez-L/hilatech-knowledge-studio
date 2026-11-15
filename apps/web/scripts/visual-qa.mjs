// Visual QA: opens the running app in Chrome via Playwright, captures
// screenshots, and reports console errors, failed requests and horizontal
// overflow. Usage:
//   node scripts/visual-qa.mjs [--base http://localhost:3100] [--out ../../artifacts/screenshots] [--only name]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const base = args.base ?? "http://localhost:3100";
const out = path.resolve(args.out ?? "../../artifacts/screenshots");
const only = args.only;

const VIEWPORTS = { mobile: [390, 844], tablet: [768, 1024], desktop: [1440, 900] };

/** name, path, viewport, theme, fullPage, optional interaction */
const shots = [
  ["landing-desktop", "/en", "desktop", "light", true],
  ["landing-tablet", "/en", "tablet", "light", true],
  ["landing-mobile", "/en", "mobile", "light", true],
  ["landing-hero-desktop", "/en", "desktop", "light", false],
  ["landing-hebrew-rtl-desktop", "/he", "desktop", "light", true],
  ["landing-hebrew-rtl-mobile", "/he", "mobile", "light", true],
  ["landing-dark-desktop", "/en", "desktop", "dark", true],
  ["workspace-empty-desktop", "/en/demo", "desktop", "light", false],
  ["workspace-desktop", "/en/demo", "desktop", "light", false, "conversation"],
  ["workspace-tablet", "/en/demo", "tablet", "light", false, "conversation"],
  ["workspace-mobile", "/en/demo", "mobile", "light", false, "conversation-no-evidence"],
  ["workspace-mobile-evidence", "/en/demo", "mobile", "light", false, "conversation"],
  ["workspace-empty-mobile", "/en/demo", "mobile", "light", false],
  ["workspace-hebrew-rtl-desktop", "/he/demo", "desktop", "light", false, "conversation"],
  ["workspace-hebrew-rtl-mobile", "/he/demo", "mobile", "light", false, "conversation-no-evidence"],
  ["workspace-dark-desktop", "/en/demo", "desktop", "dark", false, "conversation"],
  ["workspace-table-desktop", "/en/demo", "desktop", "light", false, "table"],
].filter(([name]) => !only || name.includes(only));

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const problems = [];

for (const [name, url, viewport, theme, fullPage, action] of shots) {
  const [width, height] = VIEWPORTS[viewport];
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: viewport === "desktop" ? 1 : 2,
    colorScheme: theme,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${name}: page error: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`${name}: request failed: ${r.url()}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${name}: HTTP ${r.status()} ${r.url()}`));

  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  if (action?.startsWith("conversation") || action === "table") {
    const index = action === "table" ? 3 : 0;
    await page.locator("[data-example-question]").nth(index).click();
    await page.locator("[data-answer-complete]").waitFor({ timeout: 15000 });
    if (action !== "conversation-no-evidence") {
      await page.locator("[data-answer-complete] button[aria-pressed]").first().click();
      await page.waitForTimeout(600);
    }
  }
  await page.waitForTimeout(1500);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) problems.push(`${name}: horizontal overflow of ${overflow}px`);

  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
  await context.close();
  console.log(`captured ${name}`);
}

await browser.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.log(" - " + p);
  process.exitCode = 1;
} else {
  console.log("\nNo console errors, failed requests or horizontal overflow.");
}
