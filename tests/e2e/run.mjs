/**
 * Browser tests: price list, customers, CSV import/undo, onboarding and team.
 * Runs against a local dev server and the seeded demo database, then cleans up.
 *
 *   npm run dev   # in another terminal
 *   npm run e2e
 *
 * Env (.env.local): SEED_PASSWORD; optional E2E_BASE_URL (default http://localhost:3000).
 * Uses the installed Google Chrome via playwright-core.
 */
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const password = process.env.SEED_PASSWORD;
const adminPw = password;
const csvDir = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.E2E_SCREENSHOTS ?? "/tmp";
if (!password) throw new Error("Set SEED_PASSWORD in .env.local");

execSync("npx tsx scripts/e2e-cleanup.mts", { stdio: "inherit" });
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
let failed = 0;
const newPage = async () => { const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
let page = await newPage();
const step = async (name, fn) => {
  try { await fn(); console.log("  PASS", name); }
  catch (e) {
    failed++;
    console.log("  FAIL", name, "-", e.message.split("\n")[0]);
    await page.screenshot({ path: `${out}/e2e-fail-${name.replace(/\W+/g, "_")}.png`, fullPage: true }).catch(() => {});
  }
};
const go = (p) => page.goto(base + p, { waitUntil: "networkidle" });
// Fill a form field and confirm React registered it (the unsaved-changes bar
// appears). In dev, a page can still be hydrating after "networkidle".
const fillForm = async (selector, value) => {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    if (await page.getByText("Unsaved changes").isVisible().catch(() => false)) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`form didn't register input on ${selector}`);
};
const login = async (p, email, pw) => {
  await p.goto(base + "/login", { waitUntil: "networkidle" });
  await p.fill("#email", email); await p.fill("#password", pw);
  await p.click("button:has-text('Sign in')");
};
await login(page, "dave@hollis.test", password);
await page.waitForURL("**/app/quotes");
const hollisRateId = await (async () => { await go("/app/rates?q=BP01"); const href = await page.getByRole("link", { name: "Open BP01" }).getAttribute("href"); return href.split("/").pop(); })();

console.log("Price list");

await step("create item", async () => {
  await page.goto(base + "/app/rates/new", { waitUntil: "networkidle" });
  await page.fill("#code", "zztest2");
  await page.fill("#item", "Test item for e2e");
  await page.fill("#category", "Testing");
  await page.fill("#price", "10");
  await page.click("button:has-text('Create item')");
  await page.waitForURL(/\/app\/rates\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await page.getByText("£10.00").first().waitFor();
});
await step("duplicate code rejected", async () => {
  await page.goto(base + "/app/rates/new", { waitUntil: "networkidle" });
  await page.fill("#code", "ZZTEST2"); await page.fill("#item", "dup"); await page.fill("#price", "1");
  await page.click("button:has-text('Create item')");
  await page.getByText(/already used/).waitFor({ timeout: 10000 });
  await page.goBack();
});
await step("schedule price rise", async () => {
  await page.goto(base + "/app/rates?q=ZZTEST2", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Open ZZTEST2" }).click();
  await page.waitForURL(/\/app\/rates\/[0-9a-f-]{36}$/); await page.waitForLoadState("networkidle");
  await page.click("button:has-text('Change price')");
  await page.fill("#new-price", "12.5");
  await page.fill("#effective", "2030-03-01");
  await page.fill("#reason", "Supplier rise test");
  await page.click("button:has-text('Save price')");
  await page.getByText(/Changes to £12.50 on 1 Mar 2030/).waitFor({ timeout: 10000 });
  await page.getByText("£10.00").first().waitFor();
});
await step("edit details and save", async () => {
  await fillForm("#notes", "edited by e2e");
  await page.click("button:has-text('Save')");
  await page.getByText("Saved").waitFor({ timeout: 10000 });
});
await step("history shows events", async () => {
  await page.reload();
  await page.getByText("Price set to £12.50").waitFor({ timeout: 10000 });
  await page.getByText(/Notes: empty → edited by e2e/).waitFor();
});
await step("archive", async () => {
  await page.click("button:has-text('Archive')");
  await page.locator("dialog button:has-text('Archive')").click();
  await page.getByText(/Archived \d/).waitFor({ timeout: 10000 });
});

console.log("Customers");

await step("create customer", async () => {
  await go("/app/customers/new");
  await page.fill("#name", "Zed Testperson");
  await page.fill("#emails", "zed.test@example.org");
  await page.fill("#phones", "07700 111222");
  await page.fill("#tags", "landlord");
  await page.click("button:has-text('Create customer')");
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Zed Testperson" }).waitFor();
});
await step("duplicate email is caught", async () => {
  await go("/app/customers/new");
  await page.fill("#name", "Someone Else");
  await page.fill("#emails", "p.okafor@example.com");
  await page.click("button:has-text('Create customer')");
  await page.getByRole("link", { name: "Open Patience Okafor" }).waitFor({ timeout: 10000 });
});
await step("edit and history", async () => {
  await go("/app/customers?q=zed");
  await page.getByRole("link", { name: "Zed Testperson" }).click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}$/); await page.waitForLoadState("networkidle");
  await fillForm("#payment_terms", "14 days");
  await page.click("button:has-text('Save')");
  await page.getByText("Saved").waitFor({ timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(/Payment terms: empty → 14 days/).waitFor({ timeout: 10000 });
});
await step("add note", async () => {
  await page.click("button:has-text('Add a note')");
  await page.fill("textarea[id^=note-]", "Prefers a call after 5pm");
  await page.click("button:has-text('Save note')");
  await page.getByText("Prefers a call after 5pm").waitFor({ timeout: 10000 });
});
await step("new quote preselects customer", async () => {
  await page.getByRole("link", { name: "New quote" }).last().click();
  await page.waitForURL(/\/app\/quotes\/new\?customer=/); await page.waitForLoadState("networkidle");
  await page.getByText(/Quote for/).waitFor();
  await page.goBack(); await page.waitForLoadState("networkidle");
});
await step("archive and restore", async () => {
  await page.click("button:has-text('Archive')");
  await page.locator("dialog button:has-text('Archive')").click();
  await page.getByText(/Not matched to new enquiries/).waitFor({ timeout: 10000 });
  await page.click("button:has-text('Restore')");
  await page.getByText("Zed Testperson restored").waitFor({ timeout: 10000 });
});

console.log("CSV import");

await step("rates: upload and preview", async () => {
  await go("/app/rates/import");
  await page.setInputFiles("input[type=file]", `${csvDir}/rates-test.csv`);
  await page.getByRole("button", { name: /^New 1$/ }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /^Update 1$/ }).waitFor();
  await page.getByRole("button", { name: /^Error 1$/ }).waitFor();
  await page.getByText("Price: £14.50 → £15.00").waitFor();
  await page.getByText(/Unknown unit "furlong"/).waitFor();
});
await step("rates: blocked until errors acknowledged, then import", async () => {
  const btn = page.getByRole("button", { name: "Import 2 items" });
  if (await btn.isEnabled()) throw new Error("import enabled despite errors");
  await page.getByLabel(/Skip the 1 row with errors/).check();
  await btn.click();
  await page.waitForURL(/\/app\/imports\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.getByText("ZZIMP1").waitFor();
});
await step("rates: new price is live", async () => {
  await go("/app/rates?q=EX01");
  await page.getByText("£15.00").first().waitFor({ timeout: 10000 });
});
await step("rates: undo restores the old price", async () => {
  await go("/app/imports");
  await page.getByRole("link", { name: "rates-test.csv" }).first().click();
  await page.waitForURL(/\/app\/imports\//); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Undo import" }).click();
  await page.locator("dialog button:has-text('Undo import')").click();
  await page.getByText(/^Undone /).waitFor({ timeout: 15000 });
  await go("/app/rates?q=EX01");
  await page.getByText("£14.50").first().waitFor({ timeout: 10000 });
  await go("/app/rates?view=all&q=ZZIMP1");
  await page.getByText("No items match").waitFor();
});
await step("customers: import new + update existing", async () => {
  await go("/app/customers/import");
  await page.setInputFiles("input[type=file]", `${csvDir}/customers-test.csv`);
  await page.getByRole("button", { name: /^New 1$/ }).waitFor({ timeout: 15000 });
  await page.getByText("Add phone 0121 000 9999").waitFor();
  await page.getByRole("button", { name: "Import 2 customers" }).click();
  await page.waitForURL(/\/app\/imports\/[0-9a-f-]{36}$/, { timeout: 20000 });
});
await step("customers: undo", async () => {
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Undo import" }).click();
  await page.locator("dialog button:has-text('Undo import')").click();
  await page.getByText(/^Undone /).waitFor({ timeout: 15000 });
  await go("/app/customers?q=import");
  await page.getByText("No customers match").waitFor();
});

console.log("Onboarding and team");
let ownerLink, estLink;
const ownerPw = "Owner-pass-2026", estPw = "Estim-pass-2026";

page = await newPage();
const adminPage = page;
await step("admin lands on platform admin", async () => {
  await login(page, "admin@quotedesk.test", adminPw);
  await page.waitForURL("**/admin", { timeout: 15000 });
  await page.getByRole("heading", { name: "Companies" }).waitFor();
});
await step("admin creates company and gets owner link", async () => {
  await page.waitForLoadState("networkidle");
  await page.click("button:has-text('New company')");
  await page.fill("#co-name", "E2E Paving Ltd");
  await page.fill("#co-owner", "e2e.owner@example.org");
  await page.click("button:has-text('Create and invite owner')");
  await page.getByText("Company created").waitFor({ timeout: 15000 });
  ownerLink = await page.inputValue("input[aria-label='Invitation link']");
  if (!/\/invite\/[A-Za-z0-9_-]{40,}$/.test(ownerLink)) throw new Error("bad link " + ownerLink);
});
await step("admin cannot open tenant pages", async () => {
  await page.goto(base + "/app/rates/" + hollisRateId, { waitUntil: "networkidle" });
  if (!page.url().includes("/admin")) throw new Error("admin reached tenant page: " + page.url());
});

page = await newPage();
const ownerPage = page;
await step("owner accepts invite and lands on checklist", async () => {
  await page.goto(ownerLink, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "E2E Paving Ltd" }).waitFor();
  await page.fill("#password", ownerPw); await page.fill("#confirm", ownerPw);
  await page.click("button:has-text('Create account and join')");
  await page.waitForURL(/\/app\/quotes/, { timeout: 20000 });
  await page.getByText("Get E2E Paving Ltd set up").waitFor();
});
await step("used invite link is dead", async () => {
  const p2 = await newPage();
  await p2.goto(ownerLink, { waitUntil: "networkidle" });
  await p2.getByText("This invitation has already been used").waitFor();
});
await step("new company sees no Hollis data", async () => {
  await page.goto(base + "/app/rates/" + hollisRateId, { waitUntil: "networkidle" });
  await page.getByText("Page not found").waitFor();
  await page.goto(base + "/app/customers", { waitUntil: "networkidle" });
  await page.getByText("No customers yet").waitFor();
});
await step("owner edits company settings", async () => {
  await page.goto(base + "/app/settings", { waitUntil: "networkidle" });
  await page.fill("#min_charge", "350");
  await page.click("button:has-text('Save settings')");
  await page.getByText(/Settings saved/).waitFor({ timeout: 10000 });
});
await step("owner invites an estimator", async () => {
  await page.goto(base + "/app/settings/team", { waitUntil: "networkidle" });
  await page.click("button:has-text('Invite')");
  await page.fill("#invite-email", "e2e.est@example.org");
  await page.click("button:has-text('Create invitation link')");
  await page.getByRole("heading", { name: "Send this link" }).waitFor({ timeout: 15000 });
  estLink = await page.inputValue("input[aria-label='Invitation link']");
});

const est = await newPage();
await step("estimator joins with limited rights", async () => {
  page = est;
  await est.goto(estLink, { waitUntil: "networkidle" });
  await est.getByText("Estimator", { exact: true }).waitFor();
  await est.fill("#password", estPw); await est.fill("#confirm", estPw);
  await est.click("button:has-text('Create account and join')");
  await est.waitForURL(/\/app\/quotes/, { timeout: 20000 });
  await est.goto(base + "/app/rates", { waitUntil: "networkidle" });
  if (await est.getByRole("link", { name: "New item" }).count()) throw new Error("estimator sees New item");
  await est.goto(base + "/app/settings/team", { waitUntil: "networkidle" });
  if (est.url().includes("/team")) throw new Error("estimator reached team page");
  await est.goto(base + "/app/rates/new", { waitUntil: "networkidle" });
  if (est.url().endsWith("/new")) throw new Error("estimator reached new item page");
});
await step("owner can't demote the last owner", async () => {
  page = ownerPage;
  await page.goto(base + "/app/settings/team", { waitUntil: "networkidle" });
  await page.getByLabel("Role for e2e.owner@example.org").selectOption("manager");
  await page.getByText("A company must keep at least one active owner.").waitFor({ timeout: 10000 });
});
await step("owner deactivates estimator, who is locked out", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("tr", { hasText: "e2e.est@example.org" }).getByRole("button", { name: "Deactivate" }).click();
  await page.getByText("Deactivated", { exact: true }).first().waitFor({ timeout: 10000 });
  await est.goto(base + "/app/quotes", { waitUntil: "networkidle" });
  await est.getByText(/isn't part of an active company/).waitFor({ timeout: 10000 });
});
await step("admin overview shows owner joined", async () => {
  const admin = adminPage;
  page = admin;
  await admin.goto(base + "/admin", { waitUntil: "networkidle" });
  await admin.locator("tr", { hasText: "E2E Paving Ltd" }).getByLabel("Yes").first().waitFor();
});

await browser.close();
execSync("npx tsx scripts/e2e-cleanup.mts", { stdio: "inherit" });
if (errors.length) { console.log("Page errors:", errors); failed++; }
console.log(failed ? `${failed} failure(s)` : "All browser tests passed");
process.exit(failed ? 1 : 0);
