// Browser checks for the signed-in application. Run through scripts/ui-checks.sh,
// which starts the real stack and sets APP_BASE_URL and MAIL_OUTBOX_FILE.
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.APP_BASE_URL;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = path.join(root, "artifacts", "screenshots", "app");
const sample = (lang, name) => path.join(root, "samples", "northstar", lang, name);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const results = [];
const consoleErrors = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
async function axe(name, page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  check(`axe: ${name}`, violations.length === 0, violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")}`).join("; "));
}
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  // Expected in these flows: 401 for a signed-out visitor, 400 for the deliberately invalid reset token.
  page.on("console", (m) => m.type() === "error" && !/status of 40[013]|status of 429/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  return { context, page };
}
async function mailLink(to, kind) {
  for (let i = 0; i < 50; i++) {
    const raw = await readFile(process.env.MAIL_OUTBOX_FILE, "utf8").catch(() => "");
    const message = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === to && m.kind === kind).at(-1);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (link) return link;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no ${kind} mail for ${to}`);
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const PASSWORD = "a long enough passphrase 42";
const email = `ui-${Date.now()}@example.test`;

/* ------------------------------------------------ authentication (English, desktop) */
const { context, page } = await newPage();
await page.goto(`${base}/en/app`, { waitUntil: "networkidle" });
check("protected route redirects a signed-out visitor to sign-in", page.url().endsWith("/en/sign-in"), page.url());
await page.evaluate(() => document.fonts.ready);
await shot(page, "auth-sign-in-desktop");
await axe("sign-in (en)", page);

await page.getByRole("button", { name: "Sign in" }).click();
check("sign-in: empty submit shows field errors", (await page.locator("[aria-invalid='true']").count()) === 2);
await page.getByLabel("Email").fill("nobody@example.test");
await page.getByLabel("Password").fill("definitely not right");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByText("The email or password is incorrect.").waitFor();
check("sign-in: wrong credentials give one generic message", true);

await page.getByRole("link", { name: "Create an account" }).click();
await page.waitForURL("**/en/sign-up");
await page.getByLabel("Full name").fill("Dana Example");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("short");
await page.getByRole("button", { name: "Create account" }).click();
check("sign-up: short password rejected in the form", await page.getByText("Use at least 10 characters.").isVisible());
await shot(page, "auth-sign-up-desktop");
await axe("sign-up with error (en)", page);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("heading", { name: "Check your email" }).waitFor();
check("sign-up: asks the user to confirm their email", await page.getByText(email).isVisible());
await shot(page, "auth-check-email-desktop");

await page.goto(await mailLink(email, "verify_email"), { waitUntil: "networkidle" });
await page.waitForURL("**/en/app");
await page.getByRole("heading", { name: "Add documents to get started" }).waitFor();
check("verification link signs the user in and opens the workspace", true);
check("workspace says plainly that test doubles are active", await page.getByText("they are not AI output").isVisible());
await shot(page, "app-empty-no-documents-desktop");
await axe("workspace, no documents (en)", page);

/* ------------------------------------------------------------------ library */
await page.getByRole("link", { name: "Open the library" }).click();
await page.waitForURL("**/en/app/library");
await page.getByRole("heading", { name: "No documents yet" }).waitFor();
await shot(page, "library-empty-desktop");
await axe("library empty (en)", page);

await page.locator("input[type=file]").setInputFiles([
  sample("en", "customer-support-handbook.pdf"),
  sample("en", "employee-onboarding-guide.docx"),
  sample("en", "holiday-schedule-2027.txt"),
  sample("he", "refund-and-cancellation-policy.pdf"),
  path.join(root, "packages", "ai", "test", "fixtures", "scanned-no-text-layer.pdf"),
]);
await page.locator("[data-document-status]").first().waitFor();
await page.locator("[data-document-status='ready']").nth(3).waitFor({ timeout: 40000 });
await page.locator("[data-document-status='unsupported']").waitFor({ timeout: 20000 });
check("upload: four documents reach Ready", (await page.locator("[data-document-status='ready']").count()) === 4);
check("upload: scanned PDF is shown as not supported, with the reason", await page.getByText("This PDF has no text layer").isVisible());
await page.waitForTimeout(400);
await shot(page, "library-desktop");
await axe("library with documents (en)", page);

await page.locator("input[type=file]").setInputFiles(sample("en", "holiday-schedule-2027.txt"));
await page.getByText("This file is already in the library.").waitFor({ timeout: 20000 });
check("upload: duplicate file reported", true);

await page.getByLabel("Search documents").fill("handbook");
await page.waitForFunction(() => document.querySelectorAll("[data-document-status]").length === 1);
check("search narrows the list", true);
await page.getByLabel("Search documents").fill("zzz-nothing");
await page.getByText('No documents match "zzz-nothing"').waitFor();
check("search: no-results state", true);
await page.getByRole("button", { name: "Clear search" }).click();
await page.locator("[data-document-status]").nth(4).waitFor();

await page.getByRole("button", { name: "Open Customer support handbook" }).click();
const preview = page.getByRole("dialog");
await preview.getByText("This handbook describes how the Northstar support team works").waitFor();
check("preview: shows extracted text of page 1", await preview.getByText("Page 1 of 12").isVisible());
await preview.getByRole("button", { name: "Next page" }).click();
await preview.getByText("Page 2 of 12").waitFor();
await preview.getByRole("tab", { name: "Page image" }).click();
await preview.locator("img").waitFor({ state: "visible" });
await page.waitForFunction(() => { const i = document.querySelector("[role=dialog] img"); return i && i.complete && i.naturalWidth > 200; });
check("preview: server-rendered page image loads", true);
await page.waitForTimeout(300);
await shot(page, "library-preview-page-image-desktop");
await axe("library preview (en)", page);
await page.keyboard.press("Escape");

/* ---------------------------------------------------------------- workspace */
await page.getByRole("link", { name: "Ask", exact: true }).click();
await page.waitForURL("**/en/app");
await page.getByText("4 documents ready").waitFor();
await shot(page, "app-empty-desktop");

const box = page.getByRole("textbox", { name: "Your question" });
await box.fill("Priority 1 tickets receive a first response within how many minutes during business hours?");
await box.press("Enter");
await page.locator("[data-answer-status='complete']").waitFor({ timeout: 20000 });
check("ask: the URL now names the conversation", /\?c=[0-9a-f-]{36}$/.test(page.url()), page.url());
check("ask: answer is labelled as test-double output", await page.getByText("Test-double output, not AI").isVisible());
const chip = page.locator("[data-answer-status='complete'] button[aria-pressed]").first();
check("ask: the answer carries a citation", await chip.isVisible());
await chip.click();
const region = page.locator("#evidence-region");
await region.locator("mark[data-active]").waitFor();
check("citation: opens the cited document at the cited page", (await region.getByText("Page 7 of 12").isVisible()) && (await region.getByText("Customer support handbook").first().isVisible()));
check("citation: the cited passage is highlighted", (await region.locator("mark[data-active]").innerText()).includes("first response within 30 minutes"));
await page.waitForTimeout(500);
await shot(page, "app-answer-evidence-desktop");
await axe("workspace with answer and evidence (en)", page);
await region.getByRole("tab", { name: "Page image" }).click();
await page.waitForFunction(() => { const i = document.querySelector("#evidence-region img"); return i && i.complete && i.naturalWidth > 200; });
await page.waitForTimeout(300);
await shot(page, "app-answer-page-image-desktop");
check("usage counter is shown", await page.getByText(/of 200 questions used today/).isVisible());

await box.fill("By the end of which day must the information security course be completed before access to client systems is granted?");
await box.press("Enter");
await page.locator("[data-answer-status='complete']").nth(1).waitFor({ timeout: 20000 });
await page.locator("[data-answer-status='complete']").nth(1).locator("button[aria-pressed]").first().click();
await region.locator("mark[data-active]").waitFor();
check("citation into a DOCX shows its section", await region.getByText("2.3 Required training").first().isVisible());

await box.fill("Zebra quantum xylophone marmalade?");
await box.press("Enter");
await page.getByText("I couldn't find reliable information about that in the available documents.").waitFor({ timeout: 20000 });
check("unsupported question: says so, with no citation", (await page.locator("[data-answer-status='complete']").nth(2).locator("button[aria-pressed]").count()) === 0);

const conversationUrl = page.url();
await page.reload({ waitUntil: "networkidle" });
await page.locator("[data-answer-status='complete']").nth(2).waitFor();
check("reload: the conversation is restored from the server", (await page.locator("[data-answer-status='complete']").count()) === 3);
check("sidebar lists the conversation", await page.getByRole("navigation", { name: "Application" }).getByRole("link", { name: /Priority 1 tickets/ }).isVisible());

/* --------------------------------------------------- deletion and tombstones */
await page.getByRole("link", { name: "Library" }).click();
await page.waitForURL("**/en/app/library");
await page.getByRole("button", { name: "Delete: Customer support handbook" }).click();
await page.getByRole("heading", { name: "Delete this document?" }).waitFor();
await shot(page, "library-delete-dialog-desktop");
await axe("delete dialog (en)", page);
await page.getByRole("button", { name: "Delete document" }).click();
await page.getByText("Customer support handbook was deleted.").waitFor();
check("delete: document removed after confirmation", (await page.getByRole("button", { name: "Open Customer support handbook" }).count()) === 0);
await page.goto(conversationUrl, { waitUntil: "networkidle" });
await page.locator("[data-answer-status='complete']").first().locator("button[aria-pressed]").first().click();
await page.getByText("This source was removed").waitFor();
check("old citation to a deleted document shows as removed", true);
await shot(page, "app-source-removed-desktop");

/* ------------------------------------------------------- sign out / sign in */
await page.getByRole("button", { name: "Sign out", exact: true }).click();
await page.waitForURL("**/en/sign-in");
await page.goto(`${base}/en/app/library`, { waitUntil: "networkidle" });
check("after sign-out the application is closed again", page.url().endsWith("/en/sign-in"));
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/en/app");
check("sign-in with the right password opens the workspace", true);

/* forgot / reset password screens */
await page.getByRole("button", { name: "Sign out", exact: true }).click();
await page.waitForURL("**/en/sign-in");
await page.getByRole("link", { name: "Forgot your password?" }).click();
await page.waitForURL("**/en/forgot-password");
await page.getByRole("heading", { name: "Reset your password" }).waitFor();
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Send reset link" }).click();
await page.getByRole("heading", { name: "Check your email" }).waitFor();
await page.goto(await mailLink(email, "reset_password"), { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Choose a new password" }).waitFor();
await shot(page, "auth-reset-password-desktop");
await axe("reset password (en)", page);
const NEW_PASSWORD = "a second long passphrase 99";
await page.getByLabel("New password").fill(NEW_PASSWORD);
await page.getByRole("button", { name: "Save new password" }).click();
await page.getByRole("heading", { name: "Password changed" }).waitFor();
check("password reset through the emailed link works", true);
await page.goto(`${base}/en/reset-password?token=not-a-real-token`, { waitUntil: "networkidle" });
await page.getByLabel("New password").fill(NEW_PASSWORD);
await page.getByRole("button", { name: "Save new password" }).click();
await page.getByRole("heading", { name: "This link can't be used" }).waitFor();
check("an invalid reset link is explained", true);
await context.close();

/* ----------------------------------------------------- Hebrew, dark, mobile */
async function signIn(page, locale) {
  await page.goto(`${base}/${locale}/sign-in`, { waitUntil: "networkidle" });
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(NEW_PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(`**/${locale}/app`);
}
{
  const { context, page } = await newPage();
  await page.goto(`${base}/he/sign-in`, { waitUntil: "networkidle" });
  check("Hebrew sign-in is right-to-left", (await page.getAttribute("html", "dir")) === "rtl");
  await shot(page, "auth-sign-in-hebrew-desktop");
  await axe("sign-in (he)", page);
  await signIn(page, "he");
  await page.getByRole("textbox").fill("מהו חלון ההחזר המלא לתוכנית שנתית ממועד הרכישה?");
  await page.keyboard.press("Enter");
  await page.locator("[data-answer-status='complete']").waitFor({ timeout: 20000 });
  const cite = page.locator("[data-answer-status='complete'] button[aria-pressed]").first();
  if (await cite.count()) {
    await cite.click();
    await page.locator("#evidence-region mark[data-active]").waitFor();
    check("Hebrew question retrieves the Hebrew PDF (lexical test double)", await page.locator("#evidence-region").getByText("עמוד 3 מתוך 4").isVisible());
  } else check("Hebrew question retrieves the Hebrew PDF (lexical test double)", false, "no citation");
  await page.waitForTimeout(500);
  await shot(page, "app-answer-evidence-hebrew-desktop");
  await axe("workspace with evidence (he)", page);
  await page.locator("#evidence-region").getByRole("tab").nth(1).click();
  await page.waitForFunction(() => { const i = document.querySelector("#evidence-region img"); return i && i.complete && i.naturalWidth > 200; });
  await page.waitForTimeout(300);
  await shot(page, "app-answer-page-image-hebrew-desktop");
  await page.goto(`${base}/he/app/library`, { waitUntil: "networkidle" });
  await page.locator("[data-document-status]").first().waitFor();
  await shot(page, "library-hebrew-desktop");
  await axe("library (he)", page);
  check("Hebrew desktop: no horizontal overflow", (await overflow(page)) <= 1);
  await context.close();
}
{
  const { context, page } = await newPage({ colorScheme: "dark" });
  await signIn(page, "en");
  await page.goto(`${base}/en/app/library`, { waitUntil: "networkidle" });
  await page.locator("[data-document-status]").first().waitFor();
  await shot(page, "library-dark-desktop");
  await axe("library (en, dark)", page);
  await page.getByRole("link", { name: /What is|מהו|Priority/ }).first().click().catch(() => {});
  await page.goto(`${base}/en/app`, { waitUntil: "networkidle" });
  await page.getByRole("textbox").fill("By the end of which day must the information security course be completed before access to client systems is granted?");
  await page.keyboard.press("Enter");
  await page.locator("[data-answer-status='complete']").waitFor({ timeout: 20000 });
  await page.locator("[data-answer-status='complete'] button[aria-pressed]").first().click();
  await page.locator("#evidence-region mark[data-active]").waitFor();
  await page.waitForTimeout(500);
  await shot(page, "app-answer-evidence-dark-desktop");
  await axe("workspace with evidence (en, dark)", page);
  await context.close();
}
for (const locale of ["en", "he"]) {
  const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/${locale}/sign-in`, { waitUntil: "networkidle" });
  await shot(page, `auth-sign-in-${locale === "he" ? "hebrew-" : ""}mobile`);
  await signIn(page, locale);
  await page.getByRole("textbox").fill(locale === "he" ? "מהו חלון ההחזר המלא לתוכנית שנתית ממועד הרכישה?" : "By the end of which day must the information security course be completed before access to client systems is granted?");
  await page.keyboard.press("Enter");
  await page.locator("[data-answer-status='complete']").waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  await shot(page, `app-answer-${locale === "he" ? "hebrew-" : ""}mobile`);
  await page.locator("[data-answer-status='complete'] button[aria-pressed]").first().click();
  await page.getByRole("dialog").locator("mark[data-active]").waitFor();
  check(`mobile ${locale}: evidence opens as a sheet`, await page.getByRole("dialog").isVisible());
  await page.waitForTimeout(500);
  await shot(page, `app-evidence-sheet-${locale === "he" ? "hebrew-" : ""}mobile`);
  await axe(`evidence sheet, mobile (${locale})`, page);
  await page.keyboard.press("Escape");
  await page.goto(`${base}/${locale}/app/library`, { waitUntil: "networkidle" });
  await page.locator("[data-document-status]").first().waitFor();
  await page.waitForTimeout(300);
  await shot(page, `library-${locale === "he" ? "hebrew-" : ""}mobile`);
  await axe(`library, mobile (${locale})`, page);
  check(`mobile ${locale}: no horizontal overflow`, (await overflow(page)) <= 1, `${await overflow(page)}px`);
  await context.close();
}

check("no unexpected console errors", consoleErrors.length === 0, [...new Set(consoleErrors)].slice(0, 4).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
